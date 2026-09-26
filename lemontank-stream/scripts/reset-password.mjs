#!/usr/bin/env node
/**
 * איפוס סיסמה מהטרמינל — לשימוש כששכחת סיסמה או כשצריך לחזק חשבון.
 *
 *   node scripts/reset-password.mjs admin@lemontank.local            # סיסמה חזקה אקראית
 *   node scripts/reset-password.mjs admin@lemontank.local "My-Pass-2026!"  # סיסמה שאתה בוחר
 *   node scripts/reset-password.mjs --list                           # רשימת המשתמשים
 *
 * האיפוס מבטל גם נעילת חשבון ומנתק סשנים קיימים (התנתקות מכוח).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const ROOT = process.cwd();
const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[m[1]] = value;
  }
}

const dbFile = path.resolve(ROOT, process.env.DATABASE_FILE ?? "./data/lemontank.db");
const db = new DatabaseSync(dbFile);
db.exec("PRAGMA busy_timeout = 5000");

const args = process.argv.slice(2);

if (args.includes("--list") || args.length === 0) {
  const users = db.prepare("SELECT id, email, role, status FROM users WHERE deleted_at IS NULL ORDER BY id").all();
  console.log("\n👥 משתמשים:");
  for (const u of users) console.log(`   ${String(u.id).padStart(3)}  ${u.email.padEnd(34)} ${u.role.padEnd(9)} ${u.status}`);
  console.log("\nשימוש: node scripts/reset-password.mjs <email> [סיסמה חדשה]\n");
  db.close();
  process.exit(0);
}

const email = String(args[0]).toLowerCase();

/** יוצר סיסמה חזקה שאפשר להקליד */
function strongPassword() {
  const words = ["Lemon", "Tank", "Cinema", "Stream", "Screen", "Popcorn"];
  const word = words[crypto.randomInt(words.length)];
  const digits = String(crypto.randomInt(1000, 9999));
  const symbol = "!@#$%&*"[crypto.randomInt(7)];
  return `${word}-${digits}${symbol}Kd`;
}

const password = args[1] ?? strongPassword();

// פורמט זהה לאפליקציה: scrypt$N$r$p$salt$hash
const N = 32768, R = 8, P = 1;
const salt = crypto.randomBytes(16);
const derived = crypto.scryptSync(password.normalize("NFKC"), salt, 64, { N, r: R, p: P, maxmem: 256 * 1024 * 1024 });
const hash = `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;

const user = db.prepare("SELECT id, email, role FROM users WHERE email = ? AND deleted_at IS NULL").get(email);
if (!user) {
  console.error(`❌ לא נמצא משתמש עם האימייל: ${email}`);
  console.error("   לרשימת המשתמשים: node scripts/reset-password.mjs --list");
  db.close();
  process.exit(1);
}

db.prepare("UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?").run(hash, user.id);
const revoked = db.prepare("UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND revoked_at IS NULL").run(user.id).changes;

console.log(`
✅ הסיסמה עודכנה
   משתמש:  ${user.email} (${user.role})
   סיסמה:  ${password}
   נותקו:  ${revoked} סשנים פעילים (התחברות מחדש בכל מכשיר)

⚠️  שמור את הסיסמה במקום בטוח — היא לא מוצגת שוב.
`);
db.close();
