#!/usr/bin/env node
/**
 * ניקוי תוכן — מוחק את הקטלוג והשידורים מהאתר כדי להתחיל מאפס.
 *
 *   node scripts/clear-content.mjs                 → מציג מה *יֵימחק* (יבש, לא נוגע בכלום)
 *   node scripts/clear-content.mjs --yes           → מבצע (שומר על משתמשים)
 *   node scripts/clear-content.mjs --yes --users   → גם מוחק משתמשים שאינם מנהלים
 *   node scripts/clear-content.mjs --yes --keep-users --keep-media
 *
 * מה נמחק כברירת מחדל:
 *   כותרים (סרטים וסדרות) → עונות → פרקים, ז'אנרים של כותרים, אוספים, קמפיינים,
 *   ערוצי שידור חי, קופונים, דירוגים, ביקורות, תגובות, רשימות, התקדמות צפייה,
 *   הורדות, מסיבות צפייה, צפיות יומיות ואירועי אנליטיקה, ומדיה שהועלתה.
 *
 * מה *לא* נמחק (בכוונה):
 *   • יומן הביקורת (audit_log) — היסטוריה שאינה ניתנת למחיקה, לצורכי ביקורת.
 *   • המסלולים (plans), הז'אנרים (genres), הגדרות המערכת והמתגים.
 *   • חשבון המנהל — כדי שלא תישאר בלי דרך להיכנס לפאנל.
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = new Set(process.argv.slice(2));
const run = args.has("--yes");
const withUsers = args.has("--users");
const keepMedia = args.has("--keep-media");

/* ── טעינת .env.local (כמו בסקריפט הזריעה) ─────────────────────────────────── */
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const dbFile = path.resolve(process.cwd(), process.env.DATABASE_FILE ?? "./data/lemontank.db");
if (!fs.existsSync(dbFile)) {
  console.error(`❌ לא נמצא מסד נתונים ב-${path.relative(process.cwd(), dbFile)}`);
  process.exit(1);
}

const db = new DatabaseSync(dbFile);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 8000");

const count = (sql) => Number(db.prepare(sql).get()?.c ?? 0);
const tables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name),
);

/** סדר המחיקה: מהעלים לשורש (ה-CASCADE משלים, אבל מפורש זה שקוף וצפוי) */
const DELETE_PLAN = [
  ["watch_party_members", "חברי מסיבות צפייה"],
  ["watch_parties", "מסיבות צפייה"],
  ["downloads", "הורדות"],
  ["watchlist", "רשימות שלי"],
  ["ratings", "דירוגים"],
  ["reviews", "ביקורות"],
  ["comments", "תגובות"],
  ["watch_progress", "התקדמות צפייה"],
  ["title_views_daily", "צפיות יומיות"],
  ["analytics_events", "אירועי אנליטיקה"],
  ["collection_titles", "שיוכי אוספים"],
  ["collections", "אוספים"],
  ["promos", "קמפיינים ובאנרים"],
  ["coupons", "קופונים"],            // coupon_redemptions נמחק ב-CASCADE
  ["subtitle_tracks", "כתוביות"],
  ["audio_tracks", "רצועות אודיו"],
  ["credits", "קרדיטים"],
  ["title_relations", "קשרי כותרים"],
  ["title_genres", "שיוכי ז'אנרים"],
  ["episodes", "פרקים"],
  ["seasons", "עונות"],
  ["titles", "כותרים (סרטים וסדרות)"],
  ["live_channels", "ערוצי שידור חי"],
  ["people", "אנשי קולברואקרדיטים"],
  ["import_jobs", "עבודות ייבוא"],
  ["notifications", "התראות"],
];

if (!keepMedia) DELETE_PLAN.push(["media_assets", "נכסי מדיה (וידאו/תמונות/כתוביות)"]);

/* ── דוח מצב לפני ─────────────────────────────────────────────────────────── */
const plan = DELETE_PLAN.filter(([t]) => tables.has(t)).map(([t, label]) => ({
  table: t,
  label,
  rows: count(`SELECT COUNT(*) c FROM "${t}"`),
}));

console.log("");
console.log("🗂️  תוכן שיימחק:");
const width = Math.max(...plan.map((p) => p.label.length));
for (const item of plan) {
  const mark = item.rows > 0 ? "•" : "·";
  console.log(`   ${mark} ${item.label.padEnd(width)} ${String(item.rows).padStart(6)}`);
}

let usersToDelete = [];
if (withUsers) {
  usersToDelete = db
    .prepare("SELECT id, email, role FROM users WHERE role NOT IN ('admin','owner') AND deleted_at IS NULL")
    .all();
  console.log("");
  console.log(`👤 משתמשים שיימחקו: ${usersToDelete.length}`);
  for (const u of usersToDelete) console.log(`   • ${u.email} (${u.role})`);
}

const mediaFiles = !keepMedia ? count("SELECT COUNT(*) c FROM media_assets WHERE storage='local'") : 0;

console.log("");
console.log("🛡️  לא נמחק: יומן ביקורת, מסלולים, ז'אנרים, הגדרות, מתגים וחשבון המנהל.");

if (!run) {
  console.log("");
  console.log("ℹ️  זו הרצת בדיקה בלבד — דבר לא נמחק.");
  console.log("    להרצה בפועל:  node scripts/clear-content.mjs --yes");
  if (!withUsers) console.log("    למחיקת משתמשי דמו גם:  node scripts/clear-content.mjs --yes --users");
  console.log("");
  db.close();
  process.exit(0);
}

/* ── מחיקה בטרנזקציה ─────────────────────────────────────────────────────── */
const removed = {};
db.exec("BEGIN IMMEDIATE");
try {
  for (const [table] of DELETE_PLAN) {
    if (!tables.has(table)) continue;
    const before = count(`SELECT COUNT(*) c FROM "${table}"`);
    db.exec(`DELETE FROM "${table}"`);
    removed[table] = before;
  }

  if (withUsers && usersToDelete.length) {
    db.exec("DELETE FROM users WHERE role NOT IN ('admin','owner')");
    removed.users = usersToDelete.length;
  }

  db.exec("COMMIT");
} catch (err) {
  try {
    db.exec("ROLLBACK");
  } catch {
    /* ignore */
  }
  console.error("❌ המחיקה נכשלה — לא בוצע שינוי:", err.message);
  db.close();
  process.exit(1);
}

/* ── מחיקת קבצי המדיה של הרשומות שנמחקו ──────────────────────────────────── */
let deletedFiles = 0;
if (!keepMedia) {
  const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? "./storage");
  for (const kind of ["video", "image", "subtitle", "audio", "trailer"]) {
    const dir = path.join(storageRoot, kind);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const sub = path.join(dir, entry);
      if (!fs.statSync(sub).isDirectory()) continue;
      for (const file of fs.readdirSync(sub)) {
        fs.rmSync(path.join(sub, file), { force: true });
        deletedFiles++;
      }
      if (fs.readdirSync(sub).length === 0) fs.rmSync(sub, { recursive: true, force: true });
    }
  }
}

/* ── סיכום ────────────────────────────────────────────────────────────────── */
const left = {
  titles: count("SELECT COUNT(*) c FROM titles"),
  episodes: count("SELECT COUNT(*) c FROM episodes"),
  live: count("SELECT COUNT(*) c FROM live_channels"),
  genres: count("SELECT COUNT(*) c FROM genres"),
  plans: count("SELECT COUNT(*) c FROM plans"),
  users: count("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL"),
  audit: count("SELECT COUNT(*) c FROM audit_log"),
};

console.log("");
console.log("✅ הניקוי הושלם");
if (mediaFiles) console.log(`   קבצי מדיה שנמחקו מהדיסק: ${deletedFiles}`);
console.log("");
console.log("📊 נשאר במערכת:");
console.log(`   כותרים        ${left.titles}`);
console.log(`   פרקים         ${left.episodes}`);
console.log(`   ערוצי לייב    ${left.live}`);
console.log(`   ז'אנרים       ${left.genres}   (מוכן לשימוש — אפשר לערוך ב-/admin/genres)`);
console.log(`   מסלולים       ${left.plans}`);
console.log(`   משתמשים       ${left.users}`);
console.log(`   רשומות ביקורת ${left.audit}`);
console.log("");
console.log("▶️  הוסף תוכן חדש מהפאנל:");
console.log("   סרט     →  /admin/titles/new           (בחר: חינם או פלוס)");
console.log("   סדרה    →  /admin/titles/new  → ואז “ניהול פרקים” להעלאת פרקים ווידאו");
console.log("   שידור חי →  /admin/live");
console.log("");

db.close();
