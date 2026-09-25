/**
 * LemonTank Stream — סכימת מסד הנתונים (Single source of truth)
 *
 * מנוע: SQLite (מובנה ב-Node 22 דרך `node:sqlite`) — חינם, ללא הגבלת גודל/שורות,
 * קובץ אחד, אפס התקנה. הפרויקט תומך גם ב-PostgreSQL חינמי בענן (Neon/Supabase) —
 * ראו sql/schema.postgres.sql ו-DEPLOY.md.
 *
 * עקרונות:
 *  1. כל הטבלאות STRICT → SQLite אוכף טיפוסים, אי אפשר להזריק טיפוס שגוי (הגנת integrity).
 *  2. כל שאילתה באפליקציה עוברת parameter binding — אין string concatenation של SQL.
 *  3. ON DELETE CASCADE לנתונים תלויים, RESTRICT למחיקות מסוכנות.
 *  4. טריגרים מעדכנים updated_at אוטומטית ומונעים שינוי שדות מוגנים.
 */

export const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = /* sql */ `
PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════════════════════════════════════════
--  1. משתמשים, פרופילים, אימות והרשאות
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
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
  email_verified     INTEGER NOT NULL DEFAULT 0,
  twofa_secret       TEXT,
  twofa_enabled      INTEGER NOT NULL DEFAULT 0,
  failed_logins      INTEGER NOT NULL DEFAULT 0,
  locked_until       TEXT,
  last_login_at      TEXT,
  last_login_ip      TEXT,
  last_login_ua      TEXT,
  marketing_opt_in   INTEGER NOT NULL DEFAULT 0,
  referral_code      TEXT    UNIQUE,
  referred_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  coins              INTEGER NOT NULL DEFAULT 0,
  mature_allowed     INTEGER NOT NULL DEFAULT 1,
  max_profiles       INTEGER NOT NULL DEFAULT 5,
  tombstones         TEXT,                             -- JSON: רשומות שנמחקו לצורך GDPR
  notes              TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at         TEXT,
  CHECK (role IN ('user','editor','admin','owner')),
  CHECK (status IN ('active','suspended','banned','pending')),
  CHECK (plan_code IN ('free','plus'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_users_plan   ON users(plan_code);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code) WHERE referral_code IS NOT NULL;

-- פרופילים (כמו Netflix): פרופיל ילדים, PIN, מגבלת גיל
CREATE TABLE IF NOT EXISTS profiles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  avatar_url     TEXT,
  color          TEXT    NOT NULL DEFAULT '#f5b301',
  is_kid         INTEGER NOT NULL DEFAULT 0,
  maturity_limit TEXT    NOT NULL DEFAULT '18+',
  pin_hash       TEXT,
  autoplay       INTEGER NOT NULL DEFAULT 1,
  autoplay_next  INTEGER NOT NULL DEFAULT 1,
  lang_audio     TEXT    NOT NULL DEFAULT 'he',
  lang_subs      TEXT    NOT NULL DEFAULT 'he',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, name)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);

-- סשנים: טוקן אטום חד-פעמי, נשמר כ-SHA-256 בלבד. מאפשר ביטול מיידי מרחוק.
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT    PRIMARY KEY,                  -- מזהה סשן (אקראי)
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id    INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  token_hash    TEXT    NOT NULL UNIQUE,              -- SHA-256(token) — הטוקן עצמו לא נשמר
  csrf_secret   TEXT    NOT NULL,
  ip            TEXT,
  user_agent    TEXT,
  device_label  TEXT,
  is_trusted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT    NOT NULL,
  revoked_at    TEXT,
  revoked_reason TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ניסיונות התחברות (הגנה מפני brute-force + מידע פורנזי)
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email_norm TEXT,
  ip         TEXT,
  user_agent TEXT,
  success    INTEGER NOT NULL,
  reason     TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email_norm, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip    ON login_attempts(ip, created_at);

-- טוקנים חד-פעמיים: איפוס סיסמה, אימות מייל, הזמנות, 2FA
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,                       -- reset | verify | invite | unlock | 2fa_login
  token_hash  TEXT    NOT NULL UNIQUE,
  payload     TEXT,                                   -- JSON
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT    NOT NULL,
  used_at     TEXT,
  ip          TEXT,
  CHECK (kind IN ('reset','verify','invite','unlock','2fa_login','email_change'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, kind);

-- מפתחות API (לאינטגרציות / אפליקציות צד-שלישי)
CREATE TABLE IF NOT EXISTS api_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  prefix       TEXT    NOT NULL,                      -- מוצג למשתמש (lt_live_ab12)
  key_hash     TEXT    NOT NULL UNIQUE,               -- SHA-256
  scopes       TEXT    NOT NULL DEFAULT 'read',       -- CSV: read,write,admin
  rate_limit   INTEGER NOT NULL DEFAULT 120,          -- בקשות לדקה
  last_used_at TEXT,
  expires_at   TEXT,
  revoked_at   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- מכשירים מהימנים (מאפשר "זכור מכשיר" ל-2FA + ניהול מכשירים)
CREATE TABLE IF NOT EXISTS devices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT    NOT NULL,
  label       TEXT,
  platform    TEXT,
  trusted     INTEGER NOT NULL DEFAULT 0,
  push_token  TEXT,
  first_seen  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, fingerprint)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
--  2. מנויים ותשלומים
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plans (
  code             TEXT    PRIMARY KEY,               -- free | plus
  name_he          TEXT    NOT NULL,
  name_en          TEXT    NOT NULL,
  tagline          TEXT,
  price_ils        REAL    NOT NULL DEFAULT 0,
  old_price_ils    REAL,
  currency         TEXT    NOT NULL DEFAULT 'ILS',
  billing_period   TEXT    NOT NULL DEFAULT 'monthly',
  max_streams      INTEGER NOT NULL DEFAULT 1,
  max_profiles     INTEGER NOT NULL DEFAULT 2,
  max_quality      TEXT    NOT NULL DEFAULT '720p',
  downloads_allowed INTEGER NOT NULL DEFAULT 0,
  ads_enabled      INTEGER NOT NULL DEFAULT 1,
  ads_free_bypass  INTEGER NOT NULL DEFAULT 0,
  trial_days       INTEGER NOT NULL DEFAULT 0,
  early_access     INTEGER NOT NULL DEFAULT 0,
  features_json    TEXT    NOT NULL DEFAULT '[]',
  badge_color      TEXT    NOT NULL DEFAULT '#8b8b8b',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS subscriptions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code          TEXT    NOT NULL REFERENCES plans(code),
  status             TEXT    NOT NULL DEFAULT 'active', -- trialing|active|past_due|canceled|expired
  started_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  current_period_end TEXT,
  trial_end          TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at        TEXT,
  provider           TEXT    NOT NULL DEFAULT 'manual',
  external_id        TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (status IN ('trialing','active','past_due','canceled','expired'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id, status);

CREATE TABLE IF NOT EXISTS payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount          REAL    NOT NULL,
  currency        TEXT    NOT NULL DEFAULT 'ILS',
  status          TEXT    NOT NULL DEFAULT 'paid',     -- pending|paid|failed|refunded
  provider        TEXT    NOT NULL DEFAULT 'manual',
  external_id     TEXT,
  invoice_no      TEXT    UNIQUE,
  vat_amount      REAL    NOT NULL DEFAULT 0,
  meta            TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);

CREATE TABLE IF NOT EXISTS coupons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,
  kind        TEXT    NOT NULL DEFAULT 'percent',      -- percent | fixed | days
  value       REAL    NOT NULL DEFAULT 0,
  plan_code   TEXT,
  max_uses    INTEGER NOT NULL DEFAULT 0,              -- 0 = ללא הגבלה
  uses        INTEGER NOT NULL DEFAULT 0,
  per_user    INTEGER NOT NULL DEFAULT 1,
  starts_at   TEXT,
  expires_at  TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id  INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (coupon_id, user_id)
) STRICT;

-- ═══════════════════════════════════════════════════════════════════════════
--  3. קטלוג: סרטים, סדרות, עונות, פרקים
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS genres (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug     TEXT    NOT NULL UNIQUE,
  name_he  TEXT    NOT NULL,
  icon     TEXT,
  color    TEXT    NOT NULL DEFAULT '#f5b301',
  sort     INTEGER NOT NULL DEFAULT 0
) STRICT;

-- טבלת הכותרים המאוחדת: kind='movie' או kind='series'
CREATE TABLE IF NOT EXISTS titles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kind           TEXT    NOT NULL,                    -- movie | series
  slug           TEXT    NOT NULL UNIQUE,
  name_he        TEXT    NOT NULL,
  name_en        TEXT,
  original_name  TEXT,
  tagline        TEXT,
  overview       TEXT,
  ai_summary     TEXT,
  year           INTEGER,
  release_date   TEXT,
  end_date       TEXT,
  runtime_min    INTEGER,
  seasons_count  INTEGER NOT NULL DEFAULT 0,
  episodes_count INTEGER NOT NULL DEFAULT 0,
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
  rating_imdb    REAL,
  rating_site    REAL,
  votes_count    INTEGER NOT NULL DEFAULT 0,
  views_count    INTEGER NOT NULL DEFAULT 0,
  likes_count    INTEGER NOT NULL DEFAULT 0,
  popularity     REAL    NOT NULL DEFAULT 0,
  trending_score REAL    NOT NULL DEFAULT 0,
  quality_max    TEXT    NOT NULL DEFAULT '1080p',
  audio_langs    TEXT    NOT NULL DEFAULT 'he,en',
  subtitle_langs TEXT    NOT NULL DEFAULT 'he,en,ru,ar',
  awards         TEXT,
  trivia         TEXT,
  content_warnings TEXT,
  keywords       TEXT,
  plan_access    TEXT    NOT NULL DEFAULT 'free',     -- free | plus   ← אדמין מחליט
  status         TEXT    NOT NULL DEFAULT 'draft',    -- draft | scheduled | published | archived
  is_featured    INTEGER NOT NULL DEFAULT 0,
  is_original    INTEGER NOT NULL DEFAULT 0,
  is_downloadable INTEGER NOT NULL DEFAULT 0,
  allow_comments INTEGER NOT NULL DEFAULT 1,
  age_rating_age INTEGER NOT NULL DEFAULT 12,
  seo_title      TEXT,
  seo_description TEXT,
  published_at   TEXT,
  scheduled_at   TEXT,
  tmdb_id        INTEGER,
  imdb_id        TEXT,
  source_note    TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT,
  CHECK (kind IN ('movie','series')),
  CHECK (plan_access IN ('free','plus')),
  CHECK (status IN ('draft','scheduled','published','archived'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_titles_kind    ON titles(kind, status);
CREATE INDEX IF NOT EXISTS idx_titles_plan    ON titles(plan_access, status);
CREATE INDEX IF NOT EXISTS idx_titles_year    ON titles(year);
CREATE INDEX IF NOT EXISTS idx_titles_trend   ON titles(trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_titles_updated ON titles(updated_at DESC);

CREATE TABLE IF NOT EXISTS title_genres (
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (title_id, genre_id)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_title_genres_genre ON title_genres(genre_id);

CREATE TABLE IF NOT EXISTS seasons (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id      INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  name_he       TEXT,
  overview      TEXT,
  poster_url    TEXT,
  year          INTEGER,
  episodes_count INTEGER NOT NULL DEFAULT 0,
  plan_access   TEXT    NOT NULL DEFAULT 'inherit',   -- inherit | free | plus
  trailer_url   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (title_id, number)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_seasons_title ON seasons(title_id, number);

CREATE TABLE IF NOT EXISTS episodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id      INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season_id     INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL DEFAULT 1,
  number        INTEGER NOT NULL,
  name_he       TEXT    NOT NULL,
  name_en       TEXT,
  overview      TEXT,
  runtime_sec   INTEGER NOT NULL DEFAULT 0,
  air_date      TEXT,
  thumb_url     TEXT,
  video_url     TEXT,
  video_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  subtitle_langs TEXT   NOT NULL DEFAULT 'he,en',
  audio_langs   TEXT    NOT NULL DEFAULT 'he,en',
  plan_access   TEXT    NOT NULL DEFAULT 'inherit',   -- inherit | free | plus   ← אדמין מחליט
  intro_start_sec  INTEGER,
  intro_end_sec    INTEGER,
  credits_start_sec INTEGER,
  recap_end_sec    INTEGER,
  is_premiere   INTEGER NOT NULL DEFAULT 0,
  is_finale     INTEGER NOT NULL DEFAULT 0,
  is_filler     INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'draft',
  views_count   INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT,
  UNIQUE (season_id, number),
  CHECK (status IN ('draft','scheduled','published','archived'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_episodes_title  ON episodes(title_id);
CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes(season_id, number);

-- אנשי קולנוע + קרדיטים (לדף "שחקנים ות crew")
CREATE TABLE IF NOT EXISTS people (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  name_he    TEXT,
  role_hint  TEXT,
  photo_url  TEXT,
  bio        TEXT,
  birth_date TEXT,
  birth_place TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS credits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title_id   INTEGER REFERENCES titles(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'actor',        -- actor|director|writer|producer|composer
  character  TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX IF NOT EXISTS idx_credits_title  ON credits(title_id);
CREATE INDEX IF NOT EXISTS idx_credits_person ON credits(person_id);

-- קשרים בין כותרים: סרטי המשך, דומה ל-, ספין-אוף
CREATE TABLE IF NOT EXISTS title_relations (
  title_id   INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  related_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL DEFAULT 'similar',      -- similar|sequel|prequel|spinoff|remake
  PRIMARY KEY (title_id, related_id, kind)
) STRICT;

-- ═══════════════════════════════════════════════════════════════════════════
--  4. מדיה: קבצים, כתוביות, פסי אודיו, ערוצי שידור חיים
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS media_assets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT    NOT NULL,                      -- video|image|subtitle|audio|trailer
  storage      TEXT    NOT NULL DEFAULT 'local',      -- local|s3|r2|external
  path         TEXT    NOT NULL,                      -- נתיב יחסי בתוך storage/ (לא חשוף ללקוח!)
  public_url   TEXT,                                  -- לקישורים חיצוניים בלבד
  mime         TEXT    NOT NULL DEFAULT 'application/octet-stream',
  bytes        INTEGER NOT NULL DEFAULT 0,
  duration_sec REAL,
  width        INTEGER,
  height       INTEGER,
  sha256       TEXT,                                  -- dedup + זיהוי קובץ זהה
  original_name TEXT,
  title_id     INTEGER REFERENCES titles(id) ON DELETE SET NULL,
  episode_id   INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  visibility   TEXT    NOT NULL DEFAULT 'private',    -- private|unlisted|public
  scan_status  TEXT    NOT NULL DEFAULT 'clean',      -- clean|pending|infected
  uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT,
  CHECK (kind IN ('video','image','subtitle','audio','trailer')),
  CHECK (visibility IN ('private','unlisted','public'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_assets_title ON media_assets(title_id);
CREATE INDEX IF NOT EXISTS idx_assets_sha   ON media_assets(sha256);

CREATE TABLE IF NOT EXISTS subtitle_tracks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id   INTEGER REFERENCES titles(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  lang       TEXT    NOT NULL DEFAULT 'he',
  label      TEXT    NOT NULL DEFAULT 'עברית',
  format     TEXT    NOT NULL DEFAULT 'vtt',          -- vtt|srt|ass
  url        TEXT,
  asset_id   INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_forced  INTEGER NOT NULL DEFAULT 0,
  is_sdh     INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_subs_title ON subtitle_tracks(title_id, episode_id);

CREATE TABLE IF NOT EXISTS audio_tracks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id   INTEGER REFERENCES titles(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  lang       TEXT    NOT NULL DEFAULT 'he',
  label      TEXT    NOT NULL,
  codec      TEXT    NOT NULL DEFAULT 'aac',
  url        TEXT,
  is_default INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS live_channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  number      INTEGER,
  name_he     TEXT    NOT NULL,
  logo_url    TEXT,
  stream_url  TEXT,
  category    TEXT    DEFAULT 'כללי',
  plan_access TEXT    NOT NULL DEFAULT 'plus',
  epg_json    TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
) STRICT;

-- ═══════════════════════════════════════════════════════════════════════════
--  5. צפייה, רשימות, דירוגים, תגובות
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS watch_progress (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id   INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
  title_id     INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id   INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  position_sec REAL    NOT NULL DEFAULT 0,
  duration_sec REAL    NOT NULL DEFAULT 0,
  percent      REAL    NOT NULL DEFAULT 0,
  completed    INTEGER NOT NULL DEFAULT 0,
  device       TEXT,
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, profile_id, episode_id),
  UNIQUE (user_id, profile_id, title_id, episode_id)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_progress_user  ON watch_progress(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_title ON watch_progress(title_id);

CREATE TABLE IF NOT EXISTS watchlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
  title_id   INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL DEFAULT 'list',         -- list|like|dislike|hidden|notify
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, profile_id, title_id, kind)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS ratings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id   INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  stars      INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, title_id),
  CHECK (stars BETWEEN 1 AND 10)
) STRICT;

CREATE TABLE IF NOT EXISTS reviews (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id     INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  headline     TEXT,
  body         TEXT    NOT NULL,
  stars        INTEGER,
  has_spoilers INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'approved',   -- pending|approved|rejected
  likes        INTEGER NOT NULL DEFAULT 0,
  reports      INTEGER NOT NULL DEFAULT 0,
  moderated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  moderated_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (status IN ('pending','approved','rejected'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_reviews_title ON reviews(title_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id   INTEGER REFERENCES titles(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'approved',
  likes      INTEGER NOT NULL DEFAULT 0,
  reports    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_comments_title ON comments(title_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL DEFAULT 'info',
  title      TEXT    NOT NULL,
  body       TEXT,
  link       TEXT,
  image_url  TEXT,
  read_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

-- ═══════════════════════════════════════════════════════════════════════════
--  6. אוצרות תוכן, קמפיינים, תכונות
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  name_he     TEXT    NOT NULL,
  description TEXT,
  cover_url   TEXT,
  layout      TEXT    NOT NULL DEFAULT 'row',         -- row|hero|grid|top10
  plan_access TEXT    NOT NULL DEFAULT 'free',
  is_public   INTEGER NOT NULL DEFAULT 1,
  is_auto     INTEGER NOT NULL DEFAULT 0,
  rule_json   TEXT,                                   -- כללים אוטומטיים (ז'אנר, שנה...)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active_from TEXT,
  active_to   TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS collection_titles (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  title_id      INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  pinned_until  TEXT,
  PRIMARY KEY (collection_id, title_id)
) STRICT;

CREATE TABLE IF NOT EXISTS promos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
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
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT    PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 1,
  rollout_pct INTEGER NOT NULL DEFAULT 100,
  description TEXT,
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                           -- JSON
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
) STRICT;

-- ═══════════════════════════════════════════════════════════════════════════
--  7. אבטחה, ביקורת, אנליטיקה
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT    NOT NULL,
  window_start TEXT    NOT NULL,
  hits         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
) STRICT;

CREATE TABLE IF NOT EXISTS security_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL,                        -- csrf_fail|rate_limit|sqli_attempt|...
  severity   TEXT    NOT NULL DEFAULT 'warning',
  ip         TEXT,
  user_id    INTEGER,
  detail     TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_sec_events ON security_events(created_at DESC);

-- ── חסימות IP ───────────────────────────────────────────────────────────────
-- נכתב גם ע"י שער האבטחה (security/store.mjs) לפני ש-Next נטען.
CREATE TABLE IF NOT EXISTS ip_bans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT    NOT NULL,
  ip_hash     TEXT,
  reason      TEXT    NOT NULL,
  category    TEXT    NOT NULL,                        -- sqli|xss|honeypot|tool|flood|brute|...
  severity    TEXT    NOT NULL DEFAULT 'warning',
  strikes     INTEGER NOT NULL DEFAULT 1,              -- כל חזרה מכפילה את זמן החסימה
  hits        INTEGER NOT NULL DEFAULT 0,
  path        TEXT,
  method      TEXT,
  user_agent  TEXT,
  action      TEXT,
  auto        INTEGER NOT NULL DEFAULT 1,              -- 1 = נחסם אוטומטית ע"י המנוע
  permanent   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT,
  lifted_at   TEXT,
  lifted_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_ip_bans_ip      ON ip_bans(ip, expires_at);
CREATE INDEX IF NOT EXISTS idx_ip_bans_active  ON ip_bans(lifted_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_ip_bans_created ON ip_bans(created_at DESC);

-- ── הגדרות מערכת האבטחה (נשלטות מהפאנל) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

-- ── מונים לחלונות זמן (הגבלת קצב, ניקוד איומים, כשלי התחברות) ────────────────
CREATE TABLE IF NOT EXISTS security_counters (
  key        TEXT PRIMARY KEY,
  value      INTEGER NOT NULL DEFAULT 0,
  window_end TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS analytics_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  profile_id INTEGER,
  session_id TEXT,
  kind       TEXT    NOT NULL,                        -- play|pause|seek|finish|pageview|search
  title_id   INTEGER,
  episode_id INTEGER,
  meta       TEXT,
  ip_hash    TEXT,                                    -- IP מגובב (אנונימי, GDPR)
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_analytics_kind  ON analytics_events(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_title ON analytics_events(title_id, created_at DESC);

CREATE TABLE IF NOT EXISTS title_views_daily (
  day      TEXT    NOT NULL,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  views    INTEGER NOT NULL DEFAULT 0,
  minutes  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, title_id)
) STRICT;

CREATE TABLE IF NOT EXISTS reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entity       TEXT    NOT NULL,                      -- review|comment|title|user
  entity_id    INTEGER NOT NULL,
  reason       TEXT    NOT NULL,
  detail       TEXT,
  status       TEXT    NOT NULL DEFAULT 'open',
  handled_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  handled_at   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS support_tickets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email      TEXT,
  subject    TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  priority   TEXT    NOT NULL DEFAULT 'normal',
  status     TEXT    NOT NULL DEFAULT 'open',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

-- הורדות אופליין (Plus) — כולל תפוגה ואימות מכשיר
CREATE TABLE IF NOT EXISTS downloads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
  title_id   INTEGER REFERENCES titles(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  device_id  INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  quality    TEXT    NOT NULL DEFAULT '720p',
  token_hash TEXT,
  status     TEXT    NOT NULL DEFAULT 'ready',
  expires_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

-- מסיבות צפייה משותפות (Watch Party)
CREATE TABLE IF NOT EXISTS watch_parties (
  id          TEXT    PRIMARY KEY,                    -- קוד הצטרפות
  host_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id    INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id  INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  position_sec REAL   NOT NULL DEFAULT 0,
  is_playing  INTEGER NOT NULL DEFAULT 0,
  settings    TEXT    NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ends_at     TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS watch_party_members (
  party_id  TEXT    NOT NULL REFERENCES watch_parties(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (party_id, user_id)
) STRICT;

-- גיימיפיקציה: תגים ונקודות
CREATE TABLE IF NOT EXISTS badges (
  code     TEXT PRIMARY KEY,
  name_he  TEXT NOT NULL,
  icon     TEXT,
  points   INTEGER NOT NULL DEFAULT 10,
  rule_json TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS user_badges (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code TEXT   NOT NULL REFERENCES badges(code) ON DELETE CASCADE,
  earned_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, badge_code)
) STRICT;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email_norm TEXT NOT NULL UNIQUE,
  source     TEXT,
  confirmed  INTEGER NOT NULL DEFAULT 0,
  token_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS import_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source     TEXT    NOT NULL,                        -- csv|json|tmdb|folder
  status     TEXT    NOT NULL DEFAULT 'queued',
  total      INTEGER NOT NULL DEFAULT 0,
  processed  INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  log        TEXT,
  started_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT
) STRICT;

-- ═══════════════════════════════════════════════════════════════════════════
--  8. חיפוש מלא (FTS5) — עברית + אנגלית
-- ═══════════════════════════════════════════════════════════════════════════

CREATE VIRTUAL TABLE IF NOT EXISTS titles_fts USING fts5(
  name_he, name_en, overview, cast_text, keywords,
  content='titles', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS titles_fts_ai AFTER INSERT ON titles BEGIN
  INSERT INTO titles_fts(rowid, name_he, name_en, overview, cast_text, keywords)
  VALUES (new.id, new.name_he, new.name_en, new.overview, new.cast_text, new.keywords);
END;
CREATE TRIGGER IF NOT EXISTS titles_fts_ad AFTER DELETE ON titles BEGIN
  INSERT INTO titles_fts(titles_fts, rowid, name_he, name_en, overview, cast_text, keywords)
  VALUES ('delete', old.id, old.name_he, old.name_en, old.overview, old.cast_text, old.keywords);
END;
CREATE TRIGGER IF NOT EXISTS titles_fts_au AFTER UPDATE ON titles BEGIN
  INSERT INTO titles_fts(titles_fts, rowid, name_he, name_en, overview, cast_text, keywords)
  VALUES ('delete', old.id, old.name_he, old.name_en, old.overview, old.cast_text, old.keywords);
  INSERT INTO titles_fts(rowid, name_he, name_en, overview, cast_text, keywords)
  VALUES (new.id, new.name_he, new.name_en, new.overview, new.cast_text, new.keywords);
END;

-- ═══════════════════════════════════════════════════════════════════════════
--  9. טריגרים: updated_at אוטומטי + הגנה על שדות מוגנים
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER IF NOT EXISTS trg_users_updated AFTER UPDATE ON users
  WHEN new.updated_at = old.updated_at
  BEGIN UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id; END;

CREATE TRIGGER IF NOT EXISTS trg_titles_updated AFTER UPDATE ON titles
  WHEN new.updated_at = old.updated_at
  BEGIN UPDATE titles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id; END;

CREATE TRIGGER IF NOT EXISTS trg_episodes_updated AFTER UPDATE ON episodes
  WHEN new.updated_at = old.updated_at
  BEGIN UPDATE episodes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id; END;

CREATE TRIGGER IF NOT EXISTS trg_subs_updated AFTER UPDATE ON subscriptions
  WHEN new.updated_at = old.updated_at
  BEGIN UPDATE subscriptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id; END;

-- שמירה על מונה פרקים מדויק בכל הוספה/מחיקה של פרק
CREATE TRIGGER IF NOT EXISTS trg_episodes_ai AFTER INSERT ON episodes BEGIN
  UPDATE seasons SET episodes_count = episodes_count + 1 WHERE id = new.season_id;
  UPDATE titles SET episodes_count = episodes_count + 1 WHERE id = new.title_id;
END;
CREATE TRIGGER IF NOT EXISTS trg_episodes_ad AFTER DELETE ON episodes BEGIN
  UPDATE seasons SET episodes_count = MAX(0, episodes_count - 1) WHERE id = old.season_id;
  UPDATE titles SET episodes_count = MAX(0, episodes_count - 1) WHERE id = old.title_id;
END;

-- הגנה על שדות קריטיים: אי אפשר לשנות role/plan_code דרך עדכון שגרתי
CREATE TRIGGER IF NOT EXISTS trg_users_protect_role BEFORE UPDATE OF role ON users
  WHEN new.role NOT IN ('user','editor','admin','owner')
  BEGIN SELECT RAISE(ABORT, 'invalid role'); END;
`;

/** טבלאות שמוגשות לסטטיסטיקות/ניהול ומשמשות לבדיקת שלמות */
export const coreTables = [
  "users", "profiles", "sessions", "plans", "subscriptions", "payments",
  "titles", "genres", "title_genres", "seasons", "episodes", "media_assets",
  "watch_progress", "watchlist", "ratings", "reviews", "comments",
  "notifications", "collections", "collection_titles", "promos", "feature_flags",
  "settings", "audit_log", "security_events", "ip_bans", "security_settings", "security_counters", "analytics_events",
  "title_views_daily", "reports", "support_tickets", "downloads",
  "watch_parties", "badges", "user_badges", "coupons", "live_channels",
  "subtitle_tracks", "audio_tracks", "people", "credits", "title_relations",
  "api_keys", "devices", "auth_tokens", "import_jobs",
] as const;
