#!/usr/bin/env node
/**
 * איפוס אימות דו-שלבי — מסלול שחזור למקרה של מכשיר אבוד.
 *
 * זו הפעולה היחידה בתחום ה-2FA שדורשת **גישה לשרת עצמו** ולא רק סיסמה:
 * מי שיש לו את הקבצים יכול לשחרר את החשבון; מי שיש לו רק סיסמה — לא.
 * לכן הסקריפט אינו נגיש דרך ה-API בשום צורה.
 *
 * הרצה:
 *   node scripts/reset-2fa.mjs --email admin@lemontank.local --yes
 *   node scripts/reset-2fa.mjs --staff --yes          # כל חשבונות הצוות
 *   node scripts/reset-2fa.mjs --status               # מי מוגן ומי לא
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

/* ── מצב ───────────────────────────────────────────────────────────────────── */
if (flag("--status")) {
  const rows = db
    .prepare(
      `SELECT email, role, twofa_enabled,
              CASE WHEN twofa_secret IS NULL THEN 0 ELSE 1 END AS has_secret
       FROM users WHERE deleted_at IS NULL AND role IN ('editor','admin','owner') ORDER BY role`,
    )
    .all();
  if (!rows.length) console.log("אין חשבונות צוות.");
  for (const row of rows) {
    console.log(`${row.twofa_enabled ? "🔐" : "⚠️ "} ${row.email} (${row.role}) — 2FA ${row.twofa_enabled ? "פעיל" : "כבוי"}`);
  }
  db.close();
  process.exit(0);
}

/* ── איפוס ─────────────────────────────────────────────────────────────────── */
const email = valueOf("--email");
const staff = flag("--staff");

if (!email && !staff) {
  console.error("שימוש: node scripts/reset-2fa.mjs --email <address> --yes   |   --staff --yes   |   --status");
  process.exit(2);
}

if (!flag("--yes")) {
  console.error("⚠️  הפעולה מבטלת את האימות הדו-שלבי. הוסף --yes כדי לאשר.");
  process.exit(2);
}

const targets = staff
  ? db.prepare("SELECT id, email FROM users WHERE deleted_at IS NULL AND role IN ('editor','admin','owner')").all()
  : db.prepare("SELECT id, email FROM users WHERE lower(email_norm) = lower(?) AND deleted_at IS NULL").all(email);

if (!targets.length) {
  console.error("❌ לא נמצא חשבון מתאים.");
  process.exit(1);
}

for (const user of targets) {
  db.prepare("UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?").run(user.id);
  console.log(`🔓 2FA בוטל עבור ${user.email}`);
}

// רישום ביומן הביקורת — גם פעולה offline צריכה להירשם
try {
  const event = db.prepare(
    `INSERT INTO security_events(kind, severity, user_id, detail) VALUES('twofa_reset_offline','warning',?,?)`,
  );
  for (const user of targets) event.run(user.id, "איפוס 2FA מהשרת (סקריפט מקומי)");
  console.log(`📝 ${targets.length} רשומות נרשמו ביומן אירועי האבטחה`);
} catch (error) {
  console.log(`ℹ️  לא ניתן לרשום ביומן: ${error?.message ?? error}`);
}

console.log("");
console.log("חשוב: החשבון ללא 2FA. הפעל אותו מחדש מהמסך /account/security מיד לאחר ההתחברות.");
db.close();
