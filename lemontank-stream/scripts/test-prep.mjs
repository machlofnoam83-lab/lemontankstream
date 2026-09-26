#!/usr/bin/env node
/**
 * הכנה להרצת בדיקות — מאפס את מצב ההגנות שבדיקות עצמן מייצרות.
 *
 * למה זה נחוץ: ההגנות של האתר (מכסת התחברות, חסימות IP) הן אמיתיות
 * ופועלות גם נגד מי שמריץ בדיקות מהמכונה. בלי איפוס, ריצה שנייה של
 * אותה חבילת בדיקות נכשלת על 429 — לא בגלל תקלה בקוד, אלא בגלל
 * שהמערכת עשתה בדיוק את מה שהיא אמורה לעשות.
 *
 * מה מאופס:  rate_limits · ip_bans
 * מה לא נגעים בו: משתמשים, תוכן, יומן ביקורת, סשנים (חוץ מסשני בדיקה שפגו)
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
db.close();
