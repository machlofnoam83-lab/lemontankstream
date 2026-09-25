#!/usr/bin/env node
/**
 * זריעת מסד הנתונים: סכימה מלאה + התשתית של המערכת (מסלולים, ז'אנרים, חשבון מנהל).
 *
 *   node scripts/seed.mjs                 → מתקין מערכת **נקייה מתוכן** (ברירת מחדל)
 *   node scripts/seed.mjs --reset         → מוחק את קובץ המסד ומתחיל מאפס
 *   node scripts/seed.mjs --demo          → מוסיף גם נתוני דמו להתרשמות
 *   node scripts/seed.mjs --reset --demo  → התקנה נקייה + תוכן לדוגמה
 *
 * המערכת לא מכניסה תוכן משלה: כל הסרטים, הסדרות, הפרקים והערוצים שאתה רואה
 * באתר הם מה שאתה הוספת בפאנל (/admin). עם --demo נטענים נתוני דוגמה בלבד,
 * ואפשר למחוק אותם בכל רגע:  node scripts/clear-content.mjs --yes --users
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
/** תוכן לדוגמה נטען רק בבקשה מפורשת — ברירת המחדל היא אתר ריק שמחכה לתוכן אמיתי */
const withDemo = (args.has("--demo") || process.env.SEED_DEMO === "1") && !args.has("--clean");

/* ── מיקום המסד ─────────────────────────────────────────────────────────── */
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    // הסרת גרשיים עוטפים — בדיוק כמו ש-Next טוען את .env.local
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
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
  console.log("   להתקנה נקייה מחדש:   node scripts/seed.mjs --reset");
  console.log("   למחיקת התוכן בלבד:   node scripts/clear-content.mjs --yes");
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

console.log(withDemo ? "🌱 מתקין מערכת + נתוני דמו…" : "🌱 מתקין מערכת נקייה מתוכן…");

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

if (withDemo) {
  const { seedDemoUsers, seedDemoContent } = await import("./seed-demo.mjs");
  const userIds = seedDemoUsers({ db, insert, daysAgo, hashPassword });
  seedDemoContent({ db, insert, daysAgo, genreIds, adminId, userIds, crypto });
  console.log(`👤 נוצרו ${userIds.length} משתמשי דמו (סיסמה: Demo-Pass-2026!)`);
} else {
  console.log("ℹ️  לא נוצר תוכן לדוגמה — הקטלוג ריק ומחכה לתוכן שלך.");
  console.log("   להתרשמות עם נתוני דמו:  node scripts/seed.mjs --reset --demo");
}

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
console.log("✅ ההתקנה הושלמה");
console.log(`   קובץ מסד: ${path.relative(process.cwd(), dbFile)}`);
console.log("");
console.log("🔑 כניסת מנהל:");
console.log(`   דוא"ל:  ${adminEmail}`);
console.log(`   סיסמה: ${adminPassword}`);
console.log("");

if (withDemo) {
  console.log("👤 משתמשי דמו (סיסמה לכולם: Demo-Pass-2026!):");
  for (const email of ["family@example.com", "noa@example.com", "yossi@example.com", "guest@example.com"]) {
    console.log(`   ${email}`);
  }
  console.log("");
  console.log("🗑️  למחיקת כל נתוני הדמו (וגם משתמשי הדמו):");
  console.log("   node scripts/clear-content.mjs --yes --users");
} else {
  console.log("📥 הקטלוג ריק — עכשיו אתה מוסיף את התוכן:");
  console.log("   סרט      →  /admin/titles/new");
  console.log("   סדרה     →  /admin/titles/new  → ואז “ניהול פרקים” להעלאת פרקים ווידאו");
  console.log("   שידור חי  →  /admin/live");
  console.log("");
  console.log("   רוצה לראות קודם איך זה נראה עם תוכן?  node scripts/seed.mjs --reset --demo");
}

console.log("");
console.log("▶️  הרצה: npm run dev   →  http://localhost:3000");
