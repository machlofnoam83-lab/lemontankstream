#!/usr/bin/env node
/**
 * זריעת מסד הנתונים: סכימה מלאה + נתוני דמו עשירים.
 *
 *   node scripts/seed.mjs            → יוצר את המסד אם חסר, ומזריע רק אם ריק
 *   node scripts/seed.mjs --reset    → מוחק את קובץ המסד ומתחיל מאפס
 *   node scripts/seed.mjs --demo     → מוסיף גם כותרים/צפיות לדמו (ברירת מחדל: כן)
 *
 * הקובץ קורא את אותה סכימה שמשמשת את האפליקציה (src/lib/schema.ts) —
 * מקור אמת אחד, בלי סכימה כפולה שעלולה להתבדר.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = new Set(process.argv.slice(2));
const reset = args.has("--reset");

/* ── מיקום המסד ─────────────────────────────────────────────────────────── */
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const dbFile = path.resolve(process.cwd(), process.env.DATABASE_FILE ?? "./data/lemontank.db");
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

if (reset && fs.existsSync(dbFile)) {
  fs.rmSync(dbFile);
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(dbFile + suffix)) fs.rmSync(dbFile + suffix);
  }
  console.log(`🗑️  נמחק ${path.relative(process.cwd(), dbFile)}`);
}

/* ── הסכימה מתוך src/lib/schema.ts ─────────────────────────────────────── */
const schemaTs = fs.readFileSync(path.join(process.cwd(), "src/lib/schema.ts"), "utf8");
const match = schemaTs.match(/export const SCHEMA_SQL = \/\* sql \*\/ `([\s\S]*?)`;/);
if (!match) {
  console.error("❌ לא נמצאה SCHEMA_SQL ב-src/lib/schema.ts");
  process.exit(1);
}
const SCHEMA_SQL = match[1];

/* ── סיסמאות בפורמט של האפליקציה: scrypt$N$r$p$salt$hash ────────────────── */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password.normalize("NFKC"), salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/* ── חיבור והחלת סכימה ─────────────────────────────────────────────────── */
const db = new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");
db.exec(SCHEMA_SQL);

const has = (sql, params = []) => !!db.prepare(sql).get(...params);
const val = async () => {};

const alreadySeeded = has("SELECT 1 FROM users LIMIT 1");

if (alreadySeeded && !reset) {
  console.log("ℹ️  המסד כבר מכיל נתונים — מדלג על הזריעה.");
  console.log("   להפעלה מחדש מלאה: node scripts/seed.mjs --reset");
  report();
  db.close();
  process.exit(0);
}

const insert = (sql, params = []) => {
  const info = db.prepare(sql).run(...params);
  return Number(info.lastInsertRowid);
};

const now = () => new Date().toISOString();
const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const nowIso = now();

console.log("🌱 מזריע נתונים…");

/* ── 1. מסלולי מנוי ────────────────────────────────────────────────────── */
const plans = [
  {
    code: "free",
    name_he: "חינם",
    name_en: "Free",
    tagline: "מתחילים לצפות בלי לשלם — עם פרסומות",
    price: 0,
    old_price: null,
    streams: 1,
    profiles: 2,
    quality: "720p",
    downloads: 0,
    ads: 1,
    bypass: 0,
    trial: 0,
    early: 0,
    features: ["קטלוג עצום של סרטים וסדרות", "כתוביות בעברית", "פרופיל אחד לכל המשפחה", "איכות HD 720p"],
    color: "#8b8b8b",
    sort: 1,
  },
  {
    code: "plus",
    name_he: "פלוס",
    name_en: "Plus",
    tagline: "כל התוכן, בלי פרסומות, ב-4K ובארבעה מסכים",
    price: 39.9,
    old_price: 59.9,
    streams: 4,
    profiles: 5,
    quality: "4K",
    downloads: 1,
    ads: 0,
    bypass: 1,
    trial: 7,
    early: 1,
    features: [
      "כל הסרטים והסדרות, כולל תוכן פלוס",
      "ללא פרסומות בכלל",
      "איכות 4K + Dolby",
      "הורדות לצפייה אופליין",
      "4 מסכים במקביל",
      "עד 5 פרופילים, כולל פרופיל ילדים",
      "גישה מוקדמת לפרקים חדשים",
      "מסיבות צפייה עם חברים",
    ],
    color: "#f5b301",
    sort: 2,
  },
];

for (const p of plans) {
  insert(
    `INSERT OR REPLACE INTO plans(code, name_he, name_en, tagline, price_ils, old_price_ils, currency, billing_period,
       max_streams, max_profiles, max_quality, downloads_allowed, ads_enabled, ads_free_bypass, trial_days, early_access,
       features_json, badge_color, sort_order, is_active)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [p.code, p.name_he, p.name_en, p.tagline, p.price, p.old_price, "ILS", "monthly", p.streams, p.profiles, p.quality,
      p.downloads, p.ads, p.bypass, p.trial, p.early, JSON.stringify(p.features), p.color, p.sort, 1],
  );
}

/* ── 2. ז'אנרים ────────────────────────────────────────────────────────── */
const genres = [
  ["action", "פעולה", "💥", "#ff5252"],
  ["comedy", "קומדיה", "😂", "#ffb300"],
  ["drama", "דרמה", "🎭", "#7e57c2"],
  ["thriller", "מתח", "🔪", "#5c6bc0"],
  ["scifi", "מדע בדיוני", "🚀", "#26c6da"],
  ["horror", "אימה", "👻", "#8e24aa"],
  ["romance", "רומנטיקה", "💞", "#ec407a"],
  ["animation", "אנימציה", "🎨", "#42a5f5"],
  ["kids", "ילדים", "🧸", "#66bb6a"],
  ["documentary", "דוקומנטרי", "🎥", "#8d6e63"],
  ["israeli", "ישראלית", "🇮🇱", "#29b6f6"],
  ["anime", "אנימה", "🍥", "#ff7043"],
];

const genreIds = {};
for (const [slug, nameHe, icon, color] of genres) {
  const genreRow = db
    .prepare("INSERT INTO genres(slug, name_he, icon, color, sort) VALUES(?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name_he=excluded.name_he RETURNING id")
    .get(slug, nameHe, icon, color, Object.keys(genreIds).length + 1);
  genreIds[slug] = genreRow.id;
}

/* ── 3. מנהל ומשתמשי דמו ───────────────────────────────────────────────── */
const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@lemontank.local").toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-2026!";
const adminName = process.env.SEED_ADMIN_NAME ?? "מנהל המערכת";

const adminId = insert(
  `INSERT INTO users(email, email_norm, password_hash, name, role, status, plan_code, email_verified, max_profiles, created_at)
   VALUES(?,?,?,?,?,?,?,?,?,?)`,
  [adminEmail, adminEmail, hashPassword(adminPassword), adminName, "owner", "active", "plus", 1, 5, daysAgo(120)],
);

const demoUsers = [
  ["family@example.com", "משפחת כהן", "plus", 1],
  ["noa@example.com", "נועה לוי", "plus", 0],
  ["yossi@example.com", "יוסי מזרחי", "free", 1],
  ["guest@example.com", "אורח דמו", "free", 0],
];
const userIds = [];
for (const [email, name, planCode, verified] of demoUsers) {
  const id = insert(
    `INSERT INTO users(email, email_norm, password_hash, name, role, status, plan_code, email_verified, max_profiles, created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [email, email, hashPassword("Demo-Pass-2026!"), name, "user", "active", planCode, verified, planCode === "plus" ? 5 : 2, daysAgo(40 + userIds.length * 7)],
  );
  userIds.push(id);

  if (planCode === "plus") {
    insert(
      `INSERT INTO subscriptions(user_id, plan_code, status, started_at, current_period_end, provider)
       VALUES(?,?,?,?,?,?)`,
      [id, "plus", "active", daysAgo(30), new Date(Date.now() + 30 * 86_400_000).toISOString(), "manual"],
    );
    const payId = insert(
      `INSERT INTO payments(user_id, amount, currency, status, provider, vat_amount, created_at)
       VALUES(?,?,?,?,?,?,?)`,
      [id, 39.9, "ILS", "paid", "manual", Number((39.9 - 39.9 / 1.18).toFixed(2)), daysAgo(5)],
    );
    db.prepare("UPDATE payments SET invoice_no = ? WHERE id = ?").run(
      `LT-${new Date().getFullYear()}-${String(payId).padStart(6, "0")}`,
      payId,
    );
  }
}

/* ── 4. קטלוג לדוגמה ───────────────────────────────────────────────────── */
const titles = [
  { kind: "movie", slug: "the-last-signal", he: "האות האחרון", en: "The Last Signal", year: 2025, runtime: 118, maturity: "16+", plan: "plus", poster: "/posters/poster-1.svg", overview: "חוקרת תקשורת קולטת אות מסתורי מלוויין ישן — ומגלה שהאות נשלח מהיום שאחרי.", genres: ["scifi", "thriller"], featured: 1, rating: 8.4 },
  { kind: "movie", slug: "tzafon-tel-aviv", he: "צפון תל אביב", en: "North Tel Aviv", year: 2024, runtime: 104, maturity: "12+", plan: "free", poster: "/posters/poster-2.svg", overview: "קומדיה רומנטית על שני שכנים שלא מפסיקים לריב — עד שהמעלית נתקעת.", genres: ["comedy", "romance", "israeli"], featured: 1, rating: 7.6 },
  { kind: "movie", slug: "harel-har", he: "רעם בהרים", en: "Thunder in the Hills", year: 2023, runtime: 131, maturity: "16+", plan: "plus", poster: "/posters/poster-3.svg", overview: "סיפור אמיתי על יחידת חילוץ אחת, לילה אחד, ומפולת ששינתה את חייהם.", genres: ["drama", "israeli", "action"], featured: 0, rating: 8.9 },
  { kind: "movie", slug: "chavat-hakochavim", he: "חוות הכוכבים", en: "Star Farm", year: 2025, runtime: 92, maturity: "0+", plan: "free", poster: "/posters/poster-4.svg", overview: "הרפתקה מצוירת לילדים על חבורת חיות שמגלות חללית ישנה באסם.", genres: ["animation", "kids"], featured: 1, rating: 8.1 },
  { kind: "series", slug: "mershak-hair", he: "מרשק העיר", en: "City Network", year: 2025, maturity: "16+", plan: "plus", poster: "/posters/poster-5.svg", overview: "דרמת פשע על בלשית שמנהלת חקירה נגד ארגון שנוגע בכל פינה בעיר.", genres: ["drama", "thriller", "israeli"], seasons: 2, featured: 0, rating: 8.7 },
  { kind: "series", slug: "shkufim", he: "שקופים", en: "Invisible", year: 2024, maturity: "12+", plan: "free", poster: "/posters/poster-6.svg", overview: "סדרת קומדיה על עובדי הייטק שעובדים על מוצר שאף אחד לא צריך.", genres: ["comedy", "israeli"], seasons: 1, featured: 0, rating: 7.4 },
];

const titleIds = [];
const episodeRefs = [];

for (const t of titles) {
  const id = insert(
    `INSERT INTO titles(kind, slug, name_he, name_en, overview, year, runtime_min, maturity, plan_access, status,
       poster_url, backdrop_url, is_featured, trending_score, rating_site, votes_count, views_count,
       seasons_count, episodes_count, published_at, created_by, created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [t.kind, t.slug, t.he, t.en, t.overview, t.year, t.runtime ?? null, t.maturity, t.plan, "published",
      t.poster, t.poster, t.featured, 70 + Math.random() * 20, t.rating, 120 + Math.floor(Math.random() * 800),
      Math.floor(300 + Math.random() * 9000), t.kind === "series" ? (t.seasons ?? 1) : 0, 0,
      daysAgo(20), adminId, daysAgo(60)],
  );
  titleIds.push(id);

  for (const g of t.genres) {
    const gid = genreIds[g];
    if (gid) db.prepare("INSERT OR IGNORE INTO title_genres(title_id, genre_id) VALUES(?,?)").run(id, gid);
  }

  if (t.kind === "series") {
    for (let seasonNo = 1; seasonNo <= (t.seasons ?? 1); seasonNo++) {
      const seasonId = insert(
        `INSERT INTO seasons(title_id, number, name_he, overview, year, plan_access)
         VALUES(?,?,?,?,?,?)`,
        [id, seasonNo, `עונה ${seasonNo}`, `עונתה ה-${seasonNo} של ${t.he}`, t.year, "inherit"],
      );

      const epCount = 6 + Math.floor(Math.random() * 3);
      for (let ep = 1; ep <= epCount; ep++) {
        const epId = insert(
          `INSERT INTO episodes(title_id, season_id, season_number, number, name_he, overview, runtime_sec, air_date,
             thumb_url, plan_access, status, views_count, intro_start_sec, intro_end_sec, created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, seasonId, seasonNo, ep, `פרק ${ep}`, `המשך העלילה של ${t.he} — פרק ${ep}.`,
            (28 + Math.floor(Math.random() * 20)) * 60, daysAgo(60 - ep * 3),
            t.poster, ep <= 1 ? "free" : "inherit", "published", Math.floor(50 + Math.random() * 2500), 12, 62, daysAgo(50)],
        );
        episodeRefs.push({ id: epId, titleId: id });
      }
    }
  }
}

db.prepare("UPDATE titles SET episodes_count = (SELECT COUNT(*) FROM episodes e WHERE e.title_id = titles.id)").run();
db.prepare("UPDATE seasons SET episodes_count = (SELECT COUNT(*) FROM episodes e WHERE e.season_id = seasons.id)").run();

/* ── 5. אוספים ─────────────────────────────────────────────────────────── */
const collections = [
  ["מומלצים השבוע", "weekly-picks", "row", "free", 1],
  ["חדש בפלטפורמה", "new-arrivals", "row", "free", 2],
  ["עשרת הגדולים", "top-10", "top10", "free", 3],
  ["יצירות ישראליות", "israeli-originals", "grid", "free", 4],
  ["ג'וקים לפלוס", "plus-spotlight", "spotlight", "plus", 5],
];
for (const [name, slug, layout, planAccess, sort] of collections) {
  const cid = insert(
    `INSERT INTO collections(slug, name_he, description, layout, plan_access, is_public, sort_order, created_by)
     VALUES(?,?,?,?,?,?,?,?)`,
    [slug, name, `אוסף "${name}" בעמוד הבית`, layout, planAccess, 1, sort, adminId],
  );
  const picks = [...titleIds].sort(() => Math.random() - 0.5).slice(0, Math.min(4, titleIds.length));
  picks.forEach((tid, i) => db.prepare("INSERT OR IGNORE INTO collection_titles(collection_id, title_id, sort_order) VALUES(?,?,?)").run(cid, tid, i));
}

/* ── 6. קמפיין וקופונים ────────────────────────────────────────────────── */
insert(
  `INSERT INTO promos(kind, title, subtitle, cta_text, cta_url, plan_access, audience, starts_at, ends_at, is_active, sort_order)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  ["banner", "7 ימים של פלוס במתנה 🍋", "כל התוכן, בלי פרסומות, ב-4K — ניסיון חינם לבלי התחייבות", "התחל ניסיון", "/plans", "all", "all", daysAgo(3), new Date(Date.now() + 30 * 86_400_000).toISOString(), 1, 1],
);
insert(
  `INSERT INTO promos(kind, title, subtitle, cta_text, cta_url, plan_access, audience, starts_at, ends_at, is_active, sort_order)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  ["strip", "סדרה חדשה כל שבוע", "עונה שלמה זמינה למנויי פלוס — פרקים חדשים בימי חמישי", "לקטלוג החדש", "/new", "all", "all", daysAgo(1), null, 1, 2],
);

insert(
  `INSERT INTO coupons(code, kind, value, plan_code, max_uses, per_user, expires_at, is_active)
   VALUES(?,?,?,?,?,?,?,?)`,
  ["LEMON20", "percent", 20, null, 0, 1, new Date(Date.now() + 90 * 86_400_000).toISOString(), 1],
);
insert(
  `INSERT INTO coupons(code, kind, value, plan_code, max_uses, per_user, expires_at, is_active)
   VALUES(?,?,?,?,?,?,?,?)`,
  ["FREE30", "days", 30, "plus", 100, 1, new Date(Date.now() + 30 * 86_400_000).toISOString(), 1],
);

/* ── 7. ערוצי שידור חי ─────────────────────────────────────────────────── */
const channels = [
  [1, "ערוץ החדשות 24", "חדשות", "plus", "📰"],
  [2, "ספורט לייב", "ספורט", "plus", "⚽"],
  [3, "ערוץ הילדים", "ילדים", "free", "🧸"],
  [4, "קולנוע קלאסי", "סרטים", "free", "🎬"],
  [5, "מוזיקה עברית", "מוזיקה", "plus", "🎵"],
  [6, "דוקו ישראלי", "דוקומנטרי", "free", "🎥"],
];
channels.forEach(([number, name, category, planAccess, emoji], i) => {
  insert(
    `INSERT INTO live_channels(number, name_he, logo_url, stream_url, category, plan_access, epg_json, is_active, sort_order)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [number, name, null, null, category, planAccess,
      JSON.stringify([
        { time: "20:00", until: "21:00", title: `${emoji} ${name} — מהדורה מרכזית` },
        { time: "21:00", until: "22:30", title: "שידור מיוחד" },
      ]), 1, i],
  );
});

/* ── 8. התראות, דירוגים והתקדמות צפייה לדמו ─────────────────────────────── */
for (const uid of userIds) {
  insert("INSERT INTO notifications(user_id, kind, title, body, created_at) VALUES(?,?,?,?,?)", [
    uid, "content", "🍋 ברוך הבא ל-LemonTank Stream", "הקטלוג מתעדכן כל שבוע — הוסף כותרים לרשימה שלך כדי לא לפספס.", daysAgo(2),
  ]);
  insert("INSERT INTO notifications(user_id, kind, title, body, read_at, created_at) VALUES(?,?,?,?,?,?)", [
    uid, "plan", "מנוי פלוס התחדש", "החיוב הבא בעוד 30 יום. אפשר לבטל בכל רגע.", daysAgo(1), daysAgo(3),
  ]);
  insert("INSERT INTO watchlist(user_id, title_id, kind, created_at) VALUES(?,?,?,?)", [uid, titleIds[0], "list", daysAgo(4)]);
  insert("INSERT INTO watchlist(user_id, title_id, kind, created_at) VALUES(?,?,?,?)", [uid, titleIds[2], "like", daysAgo(6)]);
}

for (const tid of titleIds.slice(0, 4)) {
  insert("INSERT INTO ratings(user_id, title_id, stars, created_at) VALUES(?,?,?,?)", [userIds[0], tid, 8 + Math.floor(Math.random() * 3), daysAgo(5)]);
  insert(
    "INSERT INTO reviews(user_id, title_id, headline, body, stars, status, created_at) VALUES(?,?,?,?,?,?,?)",
    [userIds[0], tid, "שווה צפייה", "הפקה מרשימה והדמויות מרגישות אמיתיות. מומלץ בחום!", 9, "approved", daysAgo(4)],
  );
}

if (episodeRefs.length) {
  const first = episodeRefs[0];
  insert(
    `INSERT INTO watch_progress(user_id, profile_id, title_id, episode_id, position_sec, duration_sec, percent, updated_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    [userIds[0], null, first.titleId, first.id, 420, 2400, 0.175, daysAgo(1)],
  );
  const second = episodeRefs[Math.min(3, episodeRefs.length - 1)];
  insert(
    `INSERT INTO watch_progress(user_id, profile_id, title_id, episode_id, position_sec, duration_sec, percent, updated_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    [userIds[1], null, second.titleId, second.id, 900, 2400, 0.375, daysAgo(2)],
  );
}

/* ── 9. צפיות יומיות לדמו של האנליטיקה ─────────────────────────────────── */
for (let d = 13; d >= 0; d--) {
  const day = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
  for (const tid of titleIds) {
    const views = Math.floor(40 + Math.random() * 400 * (1 - d / 20));
    const minutes = views * Math.floor(25 + Math.random() * 60);
    db.prepare("INSERT OR REPLACE INTO title_views_daily(day, title_id, views, minutes) VALUES(?,?,?,?)").run(day, tid, views, minutes);
  }
}

/* ── 10. אירועים, מכשירים וסשנים לדמו ──────────────────────────────────── */
for (let d = 6; d >= 0; d--) {
  const count = 4 + Math.floor(Math.random() * 6);
  for (let i = 0; i < count; i++) {
    db.prepare(
      `INSERT INTO analytics_events(user_id, kind, title_id, episode_id, meta, ip_hash, created_at)
       VALUES(?,?,?,?,?,?,?)`,
    ).run(userIds[Math.floor(Math.random() * userIds.length)], Math.random() > 0.4 ? "play" : "finish",
      titleIds[Math.floor(Math.random() * titleIds.length)], null, null,
      crypto.randomBytes(16).toString("hex"), daysAgo(d));
  }
}

for (const [i, uid] of userIds.entries()) {
  db.prepare(
    `INSERT INTO devices(user_id, fingerprint, label, platform, trusted, first_seen, last_seen)
     VALUES(?,?,?,?,?,?,?)`,
  ).run(uid, crypto.randomBytes(16).toString("hex"), ["iPhone 15", "Samsung TV", "MacBook Pro", "Android TV"][i % 4],
    ["iOS", "Tizen", "macOS", "Android"][i % 4], 1, daysAgo(30), daysAgo(1));
}

/* ── 11. בקשות תמיכה ופניות תוכן ───────────────────────────────────────── */
insert(
  "INSERT INTO support_tickets(user_id, email, subject, body, priority, status, created_at) VALUES(?,?,?,?,?,?,?)",
  [userIds[2], "yossi@example.com", "הפרק לא נטען בטלוויזיה", "במסך Android TV הפרק השני נתקע אחרי 3 דקות.", "normal", "open", daysAgo(1)],
);
insert(
  "INSERT INTO support_tickets(user_id, email, subject, body, priority, status, created_at) VALUES(?,?,?,?,?,?,?)",
  [userIds[0], "family@example.com", "בקשה להוסיף סרט", "אפשר להוסיף את הסרט שביקשנו? תודה!", "low", "open", daysAgo(3)],
);

/* ── דוח ───────────────────────────────────────────────────────────────── */
function report() {
  const tables = ["users", "titles", "seasons", "episodes", "genres", "collections", "promos", "coupons", "live_channels", "plans", "notifications"];
  console.log("");
  console.log("📦 תוכן המסד:");
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get();
    console.log(`   ${t.padEnd(16)} ${row.c}`);
  }
}

report();
db.close();

console.log("");
console.log("✅ הזריעה הושלמה");
console.log(`   קובץ מסד: ${path.relative(process.cwd(), dbFile)}`);
console.log("");
console.log("🔑 כניסת מנהל:");
console.log(`   דוא\"ל:  ${adminEmail}`);
console.log(`   סיסמה: ${adminPassword}`);
console.log("");
console.log("👤 משתמשי דמו (סיסמה לכולם: Demo-Pass-2026!):");
for (const [email] of demoUsers) console.log(`   ${email}`);
console.log("");
console.log("▶️  הרצה: npm run dev   →  http://localhost:3000");
void val;
