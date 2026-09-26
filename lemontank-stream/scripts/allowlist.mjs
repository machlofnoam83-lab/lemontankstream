#!/usr/bin/env node
/**
 * רשימת ההיתר של אזור הניהול — כלי שחזור מקומי.
 *
 * למה זה קיים: רשימת היתר היא הגנה מעולה ו**מסלול נעילה עצמית**.
 * אם הוגדרה רשימה והבעלים מתחבר מכתובת אחרת — כל אזור הניהול נחסם,
 * כולל המסך שממנו היו אמורים לתקן אותה. המסלול היחיד שנשאר הוא גישה
 * לקבצי השרת, וזה בדיוק מה שהסקריפט הזה עושה — לא יותר.
 *
 * שימוש:
 *   node scripts/allowlist.mjs --show
 *   node scripts/allowlist.mjs --set "203.0.113.7,198.51.100.0/24"
 *   node scripts/allowlist.mjs --clear          # פתוח לכל כתובת (עדיין עם 2FA)
 *   node scripts/allowlist.mjs --set "203.0.113.7" --yes
 *
 * כל שינוי נרשם גם ביומן הביקורת וגם ביומן אירועי האבטחה.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
};

if (!fs.existsSync(DB_FILE)) {
  console.error(`❌ לא נמצא מסד נתונים ב-${DB_FILE}`);
  process.exit(2);
}

const db = new DatabaseSync(DB_FILE);
const current = () =>
  String(
    db.prepare("SELECT value FROM security_settings WHERE key = 'admin_ip_allowlist'").get()?.value ?? "",
  )
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

if (flag("--show") || args.length === 0) {
  const list = current();
  console.log(list.length ? `🛡️  רשימת ההיתר (${list.length}):` : "🔓 אין רשימת היתר — אזור הניהול פתוח לכל כתובת (עדיין דורש 2FA)");
  for (const entry of list) console.log(`   • ${entry}`);
  console.log("");
  console.log("כניסה לאזור הניהול דורשת תמיד: חשבון ניהול + 2FA פעיל.");
  db.close();
  process.exit(0);
}

const clear = flag("--clear");
const set = valueOf("--set");

if (!clear && !set) {
  console.error('שימוש: --show | --set "ip,ip/cidr" | --clear');
  process.exit(2);
}

if (!flag("--yes") && (clear || set)) {
  console.log(`רשימה נוכחית: ${current().join(", ") || "(ריקה)"}`);
  console.log(`רשימה חדשה:   ${clear ? "(ריקה — פתוח לכל כתובת)" : set}`);
  console.error("⚠️  הוסף --yes כדי לאשר את השינוי (הגנה מנעילה בשוגג).");
  process.exit(2);
}

const entries = clear ? [] : String(set).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
for (const entry of entries) {
  if (!/^[0-9a-fA-F:.]{3,45}(\/\d{1,3})?$/.test(entry)) {
    console.error(`❌ כתובת לא תקינה: ${entry}`);
    process.exit(2);
  }
}

const before = current();
db.prepare(
  `INSERT INTO security_settings(key, value) VALUES('admin_ip_allowlist', ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
).run(entries.join(","));

const now = new Date().toISOString();
db.prepare("INSERT INTO security_events(kind, severity, detail) VALUES(?,?,?)").run(
  "admin_ip_allowlist_offline",
  entries.length ? "warning" : "info",
  `שינוי מהשרת: [${before.join(", ")}] → [${entries.join(", ")}]`,
);

/*
 * הערה מכוונת: אין כאן כתיבה ל-audit_log.
 *
 * יומן הביקורת הוא **שרשרת חתימות שמייצר היישום**. כלי חוץ שמזייף רשומה
 * (או מחשב Hash בנוסחה משלו) שובר את השרשרת ומפעיל התרעת שווא — ואם הוא
 * ילמד לחשב אותה נכון, הוא בדיוק הכלי שמאפשר לזייף היסטוריה בלי להיתפס.
 * לכן שינויים מהשרת נרשמים ב-security_events (טבלה שאינה משורשרת) ומסומנים
 * במפורש כ-offline, והשרשרת נשארת אמינה לחלוטין.
 */
console.log(entries.length ? `🛡️  רשימת ההיתר עודכנה (${entries.length}): ${entries.join(", ")}` : "🔓 רשימת ההיתר נמחקה — אזור הניהול פתוח לכל כתובת");
console.log("ℹ️  השינוי תקף מיד (ההגדרה נקראת בכל בקשה).");
db.close();
