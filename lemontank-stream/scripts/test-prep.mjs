#!/usr/bin/env node
/**
 * הכנה להרצת בדיקות — מאפס את מצב ההגנות שבדיקות עצמן מייצרות.
 *
 * למה זה נחוץ: ההגנות של האתר (מכסת התחברות, חסימות IP) הן אמיתיות
 * ופועלות גם נגד מי שמריץ בדיקות מהמכונה. בלי איפוס, ריצה שנייה של
 * אותה חבילת בדיקות נכשלת על 429 — לא בגלל תקלה בקוד, אלא בגלל
 * שהמערכת עשתה בדיוק את מה שהיא אמורה לעשות.
 *
 * מה מאופס:  rate_limits · ip_bans · חשבונות בדיקה שנשארו מריצה קודמת
 * מה לא נגעים בו: המנהל, תוכן, יומן ביקורת, סשנים
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..");

function loadEnvFile() {
  const file = path.join(ROOT, ".env.local");
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnvFile(), ...process.env };
const DB_FILE = env.DATABASE_FILE
  ? path.resolve(ROOT, env.DATABASE_FILE.replace(/^\.\//, ""))
  : path.join(ROOT, "data", "lemontank.db");

if (!fs.existsSync(DB_FILE)) {
  console.log("ℹ️  אין מסד נתונים — מדלגים על הכנת הבדיקות");
  process.exit(0);
}

const db = new DatabaseSync(DB_FILE);
const count = (sql) => Number(db.prepare(sql).get()?.c ?? 0);

const limits = count("SELECT COUNT(*) c FROM rate_limits");
const bans = count("SELECT COUNT(*) c FROM ip_bans");
db.exec("DELETE FROM rate_limits; DELETE FROM ip_bans;");

console.log(`🧹 הכנת בדיקות: נוקו ${limits} רשומות מכסה ו-${bans} חסימות IP`);
console.log("   (הבדיקות מייצרות אותן בעצמן — זה מה שההגנות אמורות לעשות)");

/**
 * ניקוי חשבונות בדיקה שנשארו מריצה קודמת (למשל כשהבדיקה נפלה באמצע).
 * הזיהוי שמרני בכוונה — רק דפוסים שאף משתמש אמיתי לא נרשם איתם, ובעיקר:
 * הבעלים/סגל לא נגעים. מחיקת משתמש **לא** שוברת את יומן הביקורת (החתימות
 * נשמרות, כי actor_id הוא מזהה היסטורי ולא מפתח זר).
 */
const TEST_USER_PATTERNS = [
  "test-%-%@example.com",
  "r2-%-%@example.com",
  "paytest-%@example.com",
  "ledger-probe-%@example.com",
  "fortress-staff-%@example.com",
  "dbgstaff-%@example.com",
  "weak-%@example.com",
  "news-%@example.com",
  "deleted+%@lemontank.local",
];
let removed = 0;
for (const pattern of TEST_USER_PATTERNS) {
  const rows = db.prepare("SELECT id FROM users WHERE email_norm LIKE ? AND role NOT IN ('owner','admin')").all(pattern);
  for (const row of rows) {
    for (const table of ["profiles", "sessions", "subscriptions", "watchlist", "ratings", "progress", "downloads", "notifications", "user_lists", "api_keys", "redemption_requests"]) {
      try {
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(row.id);
      } catch {
        /* טבלה לא קיימת בגרסה הזו — ממשיכים */
      }
    }
    removed += Number(db.prepare("DELETE FROM users WHERE id = ?").run(row.id).changes ?? 0);
  }
}
if (removed) console.log(`🧹 הוסרו ${removed} חשבונות בדיקה שנשארו מריצות קודמות (הסגל לא נגע)`);

/**
 * כותרי בדיקה: האתר נשלח עם קטלוג ריק, והבדיקות יוצרות כותר זמני כשאין תוכן.
 * מחיקת כותר באתר היא **רכה** (ארכיון — כדי שהבעלים יוכל לשחזר תוכן אמיתי),
 * ולכן כותרי בדיקה היו מצטברים בארכיון. כאן מוחקים אותם קשיח, בלי לפגוע
 * בתוכן אמיתי: הזיהוי הוא לפי קידומת slug ששמורה לבדיקות בלבד.
 */
const TITLE_TABLES = [
  "episodes", "seasons", "title_genres", "title_cast", "watchlist", "ratings", "progress",
  "downloads", "requests", "parties", "collections_items", "title_assets", "comments",
];
const testTitles = db.prepare("SELECT id FROM titles WHERE slug LIKE 'zz-test-%'").all();
let purgedTitles = 0;
for (const title of testTitles) {
  for (const table of TITLE_TABLES) {
    try {
      db.prepare(`DELETE FROM ${table} WHERE title_id = ?`).run(title.id);
    } catch {
      /* הטבלה לא קיימת בגרסה הזו */
    }
  }
  const seasons = db.prepare("SELECT id FROM seasons WHERE title_id = ?").all(title.id);
  for (const season of seasons) {
    try {
      db.prepare("DELETE FROM episodes WHERE season_id = ?").run(season.id);
    } catch {
      /* אין */
    }
  }
  purgedTitles += Number(db.prepare("DELETE FROM titles WHERE id = ?").run(title.id).changes ?? 0);
}
if (purgedTitles) console.log(`🧹 הוסרו ${purgedTitles} כותרי בדיקה מהארכיון (הקטלוג נשאר בדיוק כמו שהבעלים בנה)`);
console.log(`📚 מצב הקטלוג: ${db.prepare("SELECT COUNT(*) c FROM titles").get().c} כותרות`);
db.close();
