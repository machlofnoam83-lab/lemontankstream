-- ═══════════════════════════════════════════════════════════════════════════
--  LemonTank Stream — סכימה ל-PostgreSQL (Neon / Supabase / RDS — כולם יש חינם)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ⚠️ חשוב: ההתקנה המומלצת של הפרויקט רצה על SQLite המובנה של Node
--     (node:sqlite) — אפס עלויות, אפס תלויות, קובץ אחד.
--
--  למה הקובץ הזה קיים?
--     אם תרצה לעבור ל-Postgres (למשל Neon Free עם 0.5GB, או Supabase Free עם 500MB),
--     הסכימה כאן מוכנה. צריך להוסיף מתאם גישה (adapter) ב-src/lib/db.ts שמחליף
--     את node:sqlite ב-`pg` — אותו ממשק get/all/run/tx. כל שאר הקוד לא משתנה,
--     כי כל השאילתות עוברות בשכבת ה-DB ולא מפוזרות ברכיבים.
--
--  הבדלים מ-SQLite:
--    • INTEGER PRIMARY KEY AUTOINCREMENT  →  BIGSERIAL PRIMARY KEY
--    • REAL                               →  DOUBLE PRECISION
--    • חותמות זמן נשמרות כ-TEXT בפורמט ISO (כמו באפליקציה) כדי לא לשבור השוואות מחרוזת
--    • FTS5 (חיפוש מלא) אינו קיים ב-Postgres — יש כאן הצעה ל-tsvector + GIN
--    • STRICT אינו נדרש: Postgres אוכף טיפוסים כברירת מחדל
--
--  הרצה:  psql "$DATABASE_URL" -f sql/schema.postgresql.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS users (

  id                 BIGSERIAL PRIMARY KEY,
  email              TEXT    NOT NULL,
  email_norm         TEXT    NOT NULL UNIQUE,          -- תמיד lowercase, לבדיקת כפילות
  password_hash      TEXT    NOT NULL,                 -- scrypt: N=2^15, r=8, p=1
  password_algo      TEXT    NOT NULL DEFAULT 'scrypt$32768$8$1',
  password_changed_at TEXT,
  name               TEXT    NOT NULL,
  role               TEXT    NOT NULL DEFAULT 'user',  -- user | editor | admin | owner
  status             TEXT    NOT NULL DEFAULT 'active',-- active | suspended | banned | pending
  plan_code          TEXT    NOT NULL DEFAULT 'free',  -- free | plus
  avatar_url         TEXT,
  locale             TEXT    NOT NULL DEFAULT 'he',
  phone              TEXT,
  country            TEXT,
  birth_date         TEXT,
  email_verified     BIGINT NOT NULL DEFAULT 0,
  twofa_secret       TEXT,
  twofa_enabled      BIGINT NOT NULL DEFAULT 0,
  failed_logins      BIGINT NOT NULL DEFAULT 0,
  locked_until       TEXT,
  last_login_at      TEXT,
  last_login_ip      TEXT,
  last_login_ua      TEXT,
  marketing_opt_in   BIGINT NOT NULL DEFAULT 0,
  referral_code      TEXT    UNIQUE,
  referred_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  coins              BIGINT NOT NULL DEFAULT 0,
  mature_allowed     BIGINT NOT NULL DEFAULT 1,
  max_profiles       BIGINT NOT NULL DEFAULT 5,
  tombstones         TEXT,                             -- JSON: רשומות שנמחקו לצורך GDPR
  notes              TEXT,
  created_at         TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at         TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  deleted_at         TEXT,
  CHECK (role IN ('user','editor','admin','owner')),
  CHECK (status IN ('active','suspended','banned','pending')),
  CHECK (plan_code IN ('free','plus'))
);

CREATE TABLE IF NOT EXISTS profiles (

  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  avatar_url     TEXT,
  color          TEXT    NOT NULL DEFAULT '#f5b301',
  is_kid         BIGINT NOT NULL DEFAULT 0,
  maturity_limit TEXT    NOT NULL DEFAULT '18+',
  pin_hash       TEXT,
  autoplay       BIGINT NOT NULL DEFAULT 1,
  autoplay_next  BIGINT NOT NULL DEFAULT 1,
  lang_audio     TEXT    NOT NULL DEFAULT 'he',
  lang_subs      TEXT    NOT NULL DEFAULT 'he',
  sort_order     BIGINT NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at     TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS sessions (

  id            TEXT    PRIMARY KEY,                  -- מזהה סשן (אקראי)
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id    BIGINT REFERENCES profiles(id) ON DELETE SET NULL,
  token_hash    TEXT    NOT NULL UNIQUE,              -- SHA-256(token) — הטוקן עצמו לא נשמר
  csrf_secret   TEXT    NOT NULL,
  ip            TEXT,
  user_agent    TEXT,
  device_label  TEXT,
  is_trusted    BIGINT NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  last_seen_at  TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  expires_at    TEXT    NOT NULL,
  revoked_at    TEXT,
  revoked_reason TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (

  id         BIGSERIAL PRIMARY KEY,
  email_norm TEXT,
  ip         TEXT,
  user_agent TEXT,
  success    BIGINT NOT NULL,
  reason     TEXT,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS auth_tokens (

  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,                       -- reset | verify | invite | unlock | 2fa_login
  token_hash  TEXT    NOT NULL UNIQUE,
  payload     TEXT,                                   -- JSON
  created_at  TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  expires_at  TEXT    NOT NULL,
  used_at     TEXT,
  ip          TEXT,
  CHECK (kind IN ('reset','verify','invite','unlock','2fa_login','email_change'))
);

CREATE TABLE IF NOT EXISTS api_keys (

  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  prefix       TEXT    NOT NULL,                      -- מוצג למשתמש (lt_live_ab12)
  key_hash     TEXT    NOT NULL UNIQUE,               -- SHA-256
  scopes       TEXT    NOT NULL DEFAULT 'read',       -- CSV: read,write,admin
  rate_limit   BIGINT NOT NULL DEFAULT 120,          -- בקשות לדקה
  last_used_at TEXT,
  expires_at   TEXT,
  revoked_at   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS devices (

  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT    NOT NULL,
  label       TEXT,
  platform    TEXT,
  trusted     BIGINT NOT NULL DEFAULT 0,
  push_token  TEXT,
  first_seen  TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  last_seen   TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (user_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS plans (

  code             TEXT    PRIMARY KEY,               -- free | plus
  name_he          TEXT    NOT NULL,
  name_en          TEXT    NOT NULL,
  tagline          TEXT,
  price_ils        DOUBLE PRECISION    NOT NULL DEFAULT 0,
  old_price_ils    DOUBLE PRECISION,
  currency         TEXT    NOT NULL DEFAULT 'ILS',
  billing_period   TEXT    NOT NULL DEFAULT 'monthly',
  max_streams      BIGINT NOT NULL DEFAULT 1,
  max_profiles     BIGINT NOT NULL DEFAULT 2,
  max_quality      TEXT    NOT NULL DEFAULT '720p',
  downloads_allowed BIGINT NOT NULL DEFAULT 0,
  ads_enabled      BIGINT NOT NULL DEFAULT 1,
  ads_free_bypass  BIGINT NOT NULL DEFAULT 0,
  trial_days       BIGINT NOT NULL DEFAULT 0,
  early_access     BIGINT NOT NULL DEFAULT 0,
  features_json    TEXT    NOT NULL DEFAULT '[]',
  badge_color      TEXT    NOT NULL DEFAULT '#8b8b8b',
  sort_order       BIGINT NOT NULL DEFAULT 0,
  is_active        BIGINT NOT NULL DEFAULT 1,
  updated_at       TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS subscriptions (

  id                 BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code          TEXT    NOT NULL REFERENCES plans(code),
  status             TEXT    NOT NULL DEFAULT 'active', -- trialing|active|past_due|canceled|expired
  started_at         TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  current_period_end TEXT,
  trial_end          TEXT,
  cancel_at_period_end BIGINT NOT NULL DEFAULT 0,
  canceled_at        TEXT,
  provider           TEXT    NOT NULL DEFAULT 'manual',
  external_id        TEXT,
  created_at         TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at         TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  CHECK (status IN ('trialing','active','past_due','canceled','expired'))
);

CREATE TABLE IF NOT EXISTS payments (

  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id BIGINT REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount          DOUBLE PRECISION    NOT NULL,
  currency        TEXT    NOT NULL DEFAULT 'ILS',
  status          TEXT    NOT NULL DEFAULT 'paid',     -- pending|paid|failed|refunded
  provider        TEXT    NOT NULL DEFAULT 'manual',
  external_id     TEXT,
  invoice_no      TEXT    UNIQUE,
  vat_amount      DOUBLE PRECISION    NOT NULL DEFAULT 0,
  meta            TEXT,
  created_at      TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS coupons (

  id          BIGSERIAL PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,
  kind        TEXT    NOT NULL DEFAULT 'percent',      -- percent | fixed | days
  value       DOUBLE PRECISION    NOT NULL DEFAULT 0,
  plan_code   TEXT,
  max_uses    BIGINT NOT NULL DEFAULT 0,              -- 0 = ללא הגבלה
  uses        BIGINT NOT NULL DEFAULT 0,
  per_user    BIGINT NOT NULL DEFAULT 1,
  starts_at   TEXT,
  expires_at  TEXT,
  is_active   BIGINT NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (

  id         BIGSERIAL PRIMARY KEY,
  coupon_id  BIGINT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (coupon_id, user_id)
);

CREATE TABLE IF NOT EXISTS genres (

  id       BIGSERIAL PRIMARY KEY,
  slug     TEXT    NOT NULL UNIQUE,
  name_he  TEXT    NOT NULL,
  icon     TEXT,
  color    TEXT    NOT NULL DEFAULT '#f5b301',
  sort     BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS titles (

  id             BIGSERIAL PRIMARY KEY,
  kind           TEXT    NOT NULL,                    -- movie | series
  slug           TEXT    NOT NULL UNIQUE,
  name_he        TEXT    NOT NULL,
  name_en        TEXT,
  original_name  TEXT,
  tagline        TEXT,
  overview       TEXT,
  ai_summary     TEXT,
  year           BIGINT,
  release_date   TEXT,
  end_date       TEXT,
  runtime_min    BIGINT,
  seasons_count  BIGINT NOT NULL DEFAULT 0,
  episodes_count BIGINT NOT NULL DEFAULT 0,
  maturity       TEXT    NOT NULL DEFAULT '12+',
  country        TEXT,
  language       TEXT    NOT NULL DEFAULT 'he',
  director       TEXT,
  writer         TEXT,
  cast_text      TEXT,
  studios        TEXT,
  poster_url     TEXT,
  backdrop_url   TEXT,
  logo_url        TEXT,
  trailer_url    TEXT,
  color          TEXT    NOT NULL DEFAULT '#f5b301',  -- צבע דומיננטי לפוסטר-גרדיאנט
  rating_imdb    DOUBLE PRECISION,
  rating_site    DOUBLE PRECISION,
  votes_count    BIGINT NOT NULL DEFAULT 0,
  views_count    BIGINT NOT NULL DEFAULT 0,
  likes_count    BIGINT NOT NULL DEFAULT 0,
  popularity     DOUBLE PRECISION    NOT NULL DEFAULT 0,
  trending_score DOUBLE PRECISION    NOT NULL DEFAULT 0,
  quality_max    TEXT    NOT NULL DEFAULT '1080p',
  audio_langs    TEXT    NOT NULL DEFAULT 'he,en',
  subtitle_langs TEXT    NOT NULL DEFAULT 'he,en,ru,ar',
  awards         TEXT,
  trivia         TEXT,
  content_warnings TEXT,
  keywords       TEXT,
  plan_access    TEXT    NOT NULL DEFAULT 'free',     -- free | plus   ← אדמין מחליט
  status         TEXT    NOT NULL DEFAULT 'draft',    -- draft | scheduled | published | archived
  is_featured    BIGINT NOT NULL DEFAULT 0,
  is_original    BIGINT NOT NULL DEFAULT 0,
  is_downloadable BIGINT NOT NULL DEFAULT 0,
  allow_comments BIGINT NOT NULL DEFAULT 1,
  age_rating_age BIGINT NOT NULL DEFAULT 12,
  seo_title      TEXT,
  seo_description TEXT,
  published_at   TEXT,
  scheduled_at   TEXT,
  tmdb_id        BIGINT,
  imdb_id        TEXT,
  source_note    TEXT,
  created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at     TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  deleted_at     TEXT,
  CHECK (kind IN ('movie','series')),
  CHECK (plan_access IN ('free','plus')),
  CHECK (status IN ('draft','scheduled','published','archived'))
);

CREATE TABLE IF NOT EXISTS title_genres (

  title_id BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  genre_id BIGINT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (title_id, genre_id)
);

CREATE TABLE IF NOT EXISTS seasons (

  id            BIGSERIAL PRIMARY KEY,
  title_id      BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  number        BIGINT NOT NULL,
  name_he       TEXT,
  overview      TEXT,
  poster_url    TEXT,
  year          BIGINT,
  episodes_count BIGINT NOT NULL DEFAULT 0,
  plan_access   TEXT    NOT NULL DEFAULT 'inherit',   -- inherit | free | plus
  trailer_url   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (title_id, number)
);

CREATE TABLE IF NOT EXISTS episodes (

  id            BIGSERIAL PRIMARY KEY,
  title_id      BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season_id     BIGINT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  season_number BIGINT NOT NULL DEFAULT 1,
  number        BIGINT NOT NULL,
  name_he       TEXT    NOT NULL,
  name_en       TEXT,
  overview      TEXT,
  runtime_sec   BIGINT NOT NULL DEFAULT 0,
  air_date      TEXT,
  thumb_url     TEXT,
  video_url     TEXT,
  video_asset_id BIGINT REFERENCES media_assets(id) ON DELETE SET NULL,
  subtitle_langs TEXT   NOT NULL DEFAULT 'he,en',
  audio_langs   TEXT    NOT NULL DEFAULT 'he,en',
  plan_access   TEXT    NOT NULL DEFAULT 'inherit',   -- inherit | free | plus   ← אדמין מחליט
  intro_start_sec  BIGINT,
  intro_end_sec    BIGINT,
  credits_start_sec BIGINT,
  recap_end_sec    BIGINT,
  is_premiere   BIGINT NOT NULL DEFAULT 0,
  is_finale     BIGINT NOT NULL DEFAULT 0,
  is_filler     BIGINT NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'draft',
  views_count   BIGINT NOT NULL DEFAULT 0,
  created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  deleted_at    TEXT,
  UNIQUE (season_id, number),
  CHECK (status IN ('draft','scheduled','published','archived'))
);

CREATE TABLE IF NOT EXISTS people (

  id         BIGSERIAL PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  name_he    TEXT,
  role_hint  TEXT,
  photo_url  TEXT,
  bio        TEXT,
  birth_date TEXT,
  birth_place TEXT,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS credits (

  id         BIGSERIAL PRIMARY KEY,
  person_id  BIGINT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title_id   BIGINT REFERENCES titles(id) ON DELETE CASCADE,
  episode_id BIGINT REFERENCES episodes(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'actor',        -- actor|director|writer|producer|composer
  character  TEXT,
  sort_order BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS title_relations (

  title_id   BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  related_id BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL DEFAULT 'similar',      -- similar|sequel|prequel|spinoff|remake
  PRIMARY KEY (title_id, related_id, kind)
);

CREATE TABLE IF NOT EXISTS media_assets (

  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT    NOT NULL,                      -- video|image|subtitle|audio|trailer
  storage      TEXT    NOT NULL DEFAULT 'local',      -- local|s3|r2|external
  path         TEXT    NOT NULL,                      -- נתיב יחסי בתוך storage/ (לא חשוף ללקוח!)
  public_url   TEXT,                                  -- לקישורים חיצוניים בלבד
  mime         TEXT    NOT NULL DEFAULT 'application/octet-stream',
  bytes        BIGINT NOT NULL DEFAULT 0,
  duration_sec DOUBLE PRECISION,
  width        BIGINT,
  height       BIGINT,
  sha256       TEXT,                                  -- dedup + זיהוי קובץ זהה
  original_name TEXT,
  title_id     BIGINT REFERENCES titles(id) ON DELETE SET NULL,
  episode_id   BIGINT REFERENCES episodes(id) ON DELETE SET NULL,
  visibility   TEXT    NOT NULL DEFAULT 'private',    -- private|unlisted|public
  scan_status  TEXT    NOT NULL DEFAULT 'clean',      -- clean|pending|infected
  uploaded_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  deleted_at   TEXT,
  CHECK (kind IN ('video','image','subtitle','audio','trailer')),
  CHECK (visibility IN ('private','unlisted','public'))
);

CREATE TABLE IF NOT EXISTS subtitle_tracks (

  id         BIGSERIAL PRIMARY KEY,
  title_id   BIGINT REFERENCES titles(id) ON DELETE CASCADE,
  episode_id BIGINT REFERENCES episodes(id) ON DELETE CASCADE,
  lang       TEXT    NOT NULL DEFAULT 'he',
  label      TEXT    NOT NULL DEFAULT 'עברית',
  format     TEXT    NOT NULL DEFAULT 'vtt',          -- vtt|srt|ass
  url        TEXT,
  asset_id   BIGINT REFERENCES media_assets(id) ON DELETE SET NULL,
  is_default BIGINT NOT NULL DEFAULT 0,
  is_forced  BIGINT NOT NULL DEFAULT 0,
  is_sdh     BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS audio_tracks (

  id         BIGSERIAL PRIMARY KEY,
  title_id   BIGINT REFERENCES titles(id) ON DELETE CASCADE,
  episode_id BIGINT REFERENCES episodes(id) ON DELETE CASCADE,
  lang       TEXT    NOT NULL DEFAULT 'he',
  label      TEXT    NOT NULL,
  codec      TEXT    NOT NULL DEFAULT 'aac',
  url        TEXT,
  is_default BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS live_channels (

  id          BIGSERIAL PRIMARY KEY,
  number      BIGINT,
  name_he     TEXT    NOT NULL,
  logo_url    TEXT,
  stream_url  TEXT,
  category    TEXT    DEFAULT 'כללי',
  plan_access TEXT    NOT NULL DEFAULT 'plus',
  epg_json    TEXT,
  is_active   BIGINT NOT NULL DEFAULT 1,
  sort_order  BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS watch_progress (

  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id   BIGINT REFERENCES profiles(id) ON DELETE CASCADE,
  title_id     BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id   BIGINT REFERENCES episodes(id) ON DELETE CASCADE,
  position_sec DOUBLE PRECISION    NOT NULL DEFAULT 0,
  duration_sec DOUBLE PRECISION    NOT NULL DEFAULT 0,
  percent      DOUBLE PRECISION    NOT NULL DEFAULT 0,
  completed    BIGINT NOT NULL DEFAULT 0,
  device       TEXT,
  updated_at   TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (user_id, profile_id, episode_id),
  UNIQUE (user_id, profile_id, title_id, episode_id)
);

CREATE TABLE IF NOT EXISTS watchlist (

  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id BIGINT REFERENCES profiles(id) ON DELETE CASCADE,
  title_id   BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL DEFAULT 'list',         -- list|like|dislike|hidden|notify
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (user_id, profile_id, title_id, kind)
);

CREATE TABLE IF NOT EXISTS ratings (

  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id   BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  stars      BIGINT NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (user_id, title_id),
  CHECK (stars BETWEEN 1 AND 10)
);

CREATE TABLE IF NOT EXISTS reviews (

  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id     BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  headline     TEXT,
  body         TEXT    NOT NULL,
  stars        BIGINT,
  has_spoilers BIGINT NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'approved',   -- pending|approved|rejected
  likes        BIGINT NOT NULL DEFAULT 0,
  reports      BIGINT NOT NULL DEFAULT 0,
  moderated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  moderated_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at   TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  CHECK (status IN ('pending','approved','rejected'))
);

CREATE TABLE IF NOT EXISTS comments (

  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id   BIGINT REFERENCES titles(id) ON DELETE CASCADE,
  episode_id BIGINT REFERENCES episodes(id) ON DELETE CASCADE,
  parent_id  BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'approved',
  likes      BIGINT NOT NULL DEFAULT 0,
  reports    BIGINT NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS notifications (

  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL DEFAULT 'info',
  title      TEXT    NOT NULL,
  body       TEXT,
  link       TEXT,
  image_url  TEXT,
  read_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS collections (

  id          BIGSERIAL PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  name_he     TEXT    NOT NULL,
  description TEXT,
  cover_url   TEXT,
  layout      TEXT    NOT NULL DEFAULT 'row',         -- row|hero|grid|top10
  plan_access TEXT    NOT NULL DEFAULT 'free',
  is_public   BIGINT NOT NULL DEFAULT 1,
  is_auto     BIGINT NOT NULL DEFAULT 0,
  rule_json   TEXT,                                   -- כללים אוטומטיים (ז'אנר, שנה...)
  sort_order  BIGINT NOT NULL DEFAULT 0,
  active_from TEXT,
  active_to   TEXT,
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS collection_titles (

  collection_id BIGINT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  title_id      BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  sort_order    BIGINT NOT NULL DEFAULT 0,
  pinned_until  TEXT,
  PRIMARY KEY (collection_id, title_id)
);

CREATE TABLE IF NOT EXISTS promos (

  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT    NOT NULL DEFAULT 'banner',      -- banner|popup|strip|hero
  title       TEXT    NOT NULL,
  subtitle    TEXT,
  image_url   TEXT,
  cta_text    TEXT,
  cta_url     TEXT,
  plan_access TEXT    NOT NULL DEFAULT 'free',
  audience    TEXT    NOT NULL DEFAULT 'all',         -- all|free|plus|new|churned
  starts_at   TEXT,
  ends_at     TEXT,
  is_active   BIGINT NOT NULL DEFAULT 1,
  sort_order  BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feature_flags (

  key         TEXT    PRIMARY KEY,
  enabled     BIGINT NOT NULL DEFAULT 1,
  rollout_pct BIGINT NOT NULL DEFAULT 100,
  description TEXT,
  updated_at  TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS settings (

  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                           -- JSON
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_log (

  id            BIGSERIAL PRIMARY KEY,
  actor_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_email   TEXT,
  action        TEXT    NOT NULL,                     -- title.create, user.plan_change...
  entity        TEXT,
  entity_id     TEXT,
  severity      TEXT    NOT NULL DEFAULT 'info',      -- info|warning|critical
  before_json   TEXT,
  after_json    TEXT,
  ip            TEXT,
  user_agent    TEXT,
  request_id    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS rate_limits (

  bucket       TEXT    NOT NULL,
  window_start TEXT    NOT NULL,
  hits         BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE TABLE IF NOT EXISTS security_events (

  id         BIGSERIAL PRIMARY KEY,
  kind       TEXT    NOT NULL,                        -- csrf_fail|rate_limit|sqli_attempt|...
  severity   TEXT    NOT NULL DEFAULT 'warning',
  ip         TEXT,
  user_id    BIGINT,
  detail     TEXT,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS analytics_events (

  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT,
  profile_id BIGINT,
  session_id TEXT,
  kind       TEXT    NOT NULL,                        -- play|pause|seek|finish|pageview|search
  title_id   BIGINT,
  episode_id BIGINT,
  meta       TEXT,
  ip_hash    TEXT,                                    -- IP מגובב (אנונימי, GDPR)
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS title_views_daily (

  day      TEXT    NOT NULL,
  title_id BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  views    BIGINT NOT NULL DEFAULT 0,
  minutes  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, title_id)
);

CREATE TABLE IF NOT EXISTS reports (

  id           BIGSERIAL PRIMARY KEY,
  reporter_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  entity       TEXT    NOT NULL,                      -- review|comment|title|user
  entity_id    BIGINT NOT NULL,
  reason       TEXT    NOT NULL,
  detail       TEXT,
  status       TEXT    NOT NULL DEFAULT 'open',
  handled_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  handled_at   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS support_tickets (

  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  email      TEXT,
  subject    TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  priority   TEXT    NOT NULL DEFAULT 'normal',
  status     TEXT    NOT NULL DEFAULT 'open',
  assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS downloads (

  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id BIGINT REFERENCES profiles(id) ON DELETE CASCADE,
  title_id   BIGINT REFERENCES titles(id) ON DELETE CASCADE,
  episode_id BIGINT REFERENCES episodes(id) ON DELETE CASCADE,
  device_id  BIGINT REFERENCES devices(id) ON DELETE SET NULL,
  quality    TEXT    NOT NULL DEFAULT '720p',
  token_hash TEXT,
  status     TEXT    NOT NULL DEFAULT 'ready',
  expires_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS watch_parties (

  id          TEXT    PRIMARY KEY,                    -- קוד הצטרפות
  host_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id    BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id  BIGINT REFERENCES episodes(id) ON DELETE CASCADE,
  position_sec DOUBLE PRECISION   NOT NULL DEFAULT 0,
  is_playing  BIGINT NOT NULL DEFAULT 0,
  settings    TEXT    NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  ends_at     TEXT
);

CREATE TABLE IF NOT EXISTS watch_party_members (

  party_id  TEXT    NOT NULL REFERENCES watch_parties(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  PRIMARY KEY (party_id, user_id)
);

CREATE TABLE IF NOT EXISTS badges (

  code     TEXT PRIMARY KEY,
  name_he  TEXT NOT NULL,
  icon     TEXT,
  points   BIGINT NOT NULL DEFAULT 10,
  rule_json TEXT
);

CREATE TABLE IF NOT EXISTS user_badges (

  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code TEXT   NOT NULL REFERENCES badges(code) ON DELETE CASCADE,
  earned_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  PRIMARY KEY (user_id, badge_code)
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (

  id         BIGSERIAL PRIMARY KEY,
  email_norm TEXT NOT NULL UNIQUE,
  source     TEXT,
  confirmed  BIGINT NOT NULL DEFAULT 0,
  token_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS import_jobs (

  id         BIGSERIAL PRIMARY KEY,
  source     TEXT    NOT NULL,                        -- csv|json|tmdb|folder
  status     TEXT    NOT NULL DEFAULT 'queued',
  total      BIGINT NOT NULL DEFAULT 0,
  processed  BIGINT NOT NULL DEFAULT 0,
  failed     BIGINT NOT NULL DEFAULT 0,
  log        TEXT,
  started_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email_norm, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_titles_updated ON titles(updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_title_genres_genre ON title_genres(genre_id);
CREATE INDEX IF NOT EXISTS idx_seasons_title ON seasons(title_id, number);
CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes(season_id, number);
CREATE INDEX IF NOT EXISTS idx_credits_person ON credits(person_id);
CREATE INDEX IF NOT EXISTS idx_assets_title ON media_assets(title_id);
CREATE INDEX IF NOT EXISTS idx_subs_title ON subtitle_tracks(title_id, episode_id);
CREATE INDEX IF NOT EXISTS idx_progress_title ON watch_progress(title_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id, kind, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_reviews_title ON reviews(title_id, status, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_comments_title ON comments(title_id, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_sec_events ON security_events(created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_analytics_title ON analytics_events(title_id, created_at DESC NULLS LAST);

-- ── חיפוש מלא (מחליף את FTS5 של SQLite) ─────────────────────────────────
--  ב-SQLite החיפוש עובד על טבלת fts5 עם tokenizer עברי.
--  ב-Postgres אפשר לבנות tsvector מהשדות המתורגמים, ולהיעזר ב-pg_trgm
--  לחיפוש "מכיל" מהיר בעברית (חיפוש עברי מדויק דורש מילון עברי או trgm):
--
--    CREATE EXTENSION IF NOT EXISTS pg_trgm;
--    ALTER TABLE titles ADD COLUMN IF NOT EXISTS search_vec tsvector
--      GENERATED ALWAYS AS (
--        to_tsvector('simple', coalesce(name_he,'') || ' ' || coalesce(name_en,'') || ' ' || coalesce(overview,''))
--      ) STORED;
--    CREATE INDEX IF NOT EXISTS idx_titles_search_trgm ON titles USING gin (name_he gin_trgm_ops);
--    CREATE INDEX IF NOT EXISTS idx_titles_search_vec  ON titles USING gin (search_vec);
--
--  בינתיים, שכבת ה-DB של האפליקציה (src/lib/db.ts → searchTitles) כבר נופלת
--  אוטומטית ל-LIKE כשטבלת החיפוש אינה זמינה, ולכן המעבר לא ישבור חיפוש.

-- ── נתונים ראשוניים מינימליים (המסלולים) ─────────────────────────────────
INSERT INTO plans (code, name_he, name_en, tagline, price_ils, old_price_ils, max_streams, max_profiles,
                   max_quality, downloads_allowed, ads_enabled, ads_free_bypass, trial_days, early_access,
                   features_json, badge_color, sort_order, is_active)
VALUES
  ('free', 'חינם', 'Free', 'מתחילים לצפות בלי לשלם — עם פרסומות', 0, NULL, 1, 2, '720p', 0, 1, 0, 0, 0, '[]', '#8b8b8b', 1, 1),
  ('plus', 'פלוס', 'Plus', 'כל התוכן, בלי פרסומות, ב-4K', 39.9, 59.9, 4, 5, '4K', 1, 0, 1, 7, 1, '[]', '#f5b301', 2, 1)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- בדיקת שלמות אחרי ההרצה:
--   SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
--   SELECT code, name_he, price_ils FROM plans ORDER BY sort_order;

