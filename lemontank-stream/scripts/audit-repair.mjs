#!/usr/bin/env node
/**
 * בדיקה ותיקון של שרשרת יומן הביקורת.
 *
 * ─ למה כלי כזה הוא חלק מהמערכת ולא "רעיון מסוכן" ──────────────────────────────
 * יומן ביקורת משורשר נועד לגלות **שינוי בהיסטוריה**. אבל יש מצבים לגיטימיים
 * שבהם השרשרת נשברת בלי שתוקף נגע בה:
 *   · עריכה ידנית של המסד בתקלה / שחזור גיבוי חלקי.
 *   · העתקה של מסד בין שרתים בלי ה-WAL.
 *   · שינוי סכימה שמוסיף רשומות בלי לחשב מחדש.
 * אם אין דרך מסודרת לתקן — מנהלים פשוט ימחקו את השרשרת, וזה גרוע יותר.
 *
 * לכן: התיקון כאן **לא** מנסה להסתיר שינוי. הוא:
 *   1. מדפיס בדיוק אילו רשומות לא מאמתות (seq, פעולה, מועד) לפני שמשהו משתנה.
 *   2. דורש --yes מפורש, ואת נקודת ההתחלה (--from) — כלומר אי אפשר "לתקן הכל".
 *   3. רושם אירוע אבטחה בדרגת critical (audit_resign) עם מספר הרשומות שמוחתמו
 *      מחדש, כדי שכל מי שיראה את היומן יידע שהחתימה חודשה ומתי.
 *
 * הרצה:
 *   node scripts/audit-repair.mjs --check                 # מצב השרשרת
 *   node scripts/audit-repair.mjs --resign --from 194 --yes
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

const GENESIS = "0".repeat(64);
const hashOf = (row) =>
  crypto
    .createHash("sha256")
    .update(
      [
        row.seq,
        row.prev_hash,
        row.action,
        row.actor_id ?? "",
        row.entity ?? "",
        row.entity_id ?? "",
        row.severity,
        row.created_at,
        row.after_json ?? "",
      ].join("\u0001"),
    )
    .digest("hex");

const db = new DatabaseSync(DB_FILE);
const rows = db
  .prepare(
    `SELECT id, seq, prev_hash, entry_hash, action, actor_id, entity, entity_id, severity, created_at, after_json
     FROM audit_log WHERE seq IS NOT NULL ORDER BY seq ASC`,
  )
  .all();

if (!rows.length) {
  console.log("ℹ️  אין רשומות משורשרות ביומן הביקורת");
  db.close();
  process.exit(0);
}

const broken = [];
let previous = GENESIS;
for (const row of rows) {
  const expected = hashOf({ ...row, prev_hash: row.prev_hash ?? GENESIS });
  if (expected !== row.entry_hash) broken.push({ ...row, reason: "חתימה לא תואמת" });
  else if ((row.prev_hash ?? GENESIS) !== previous) broken.push({ ...row, reason: "קישור לקודמת שגוי" });
  previous = row.entry_hash ?? previous;
}

console.log(`🔗 שרשרת יומן הביקורת: ${rows.length} רשומות, ${broken.length} חריגות`);
for (const row of broken.slice(0, 20)) {
  console.log(`   ❌ seq=${row.seq} id=${row.id} ${row.action} · ${row.created_at} · ${row.reason}`);
}
if (broken.length > 20) console.log(`   … ועוד ${broken.length - 20}`);

if (!flag("--resign")) {
  console.log("");
  console.log("לחתימה מחדש (רק אחרי בדיקה!): node scripts/audit-repair.mjs --resign --from <seq> --yes");
  db.close();
  process.exit(broken.length ? 1 : 0);
}

const from = Number(valueOf("--from"));
if (!Number.isFinite(from) || from < 1) {
  console.error("❌ חובה לציין נקודת התחלה: --from <seq>");
  process.exit(2);
}
if (!flag("--yes")) {
  console.error("⚠️  החתימה מחדש משנה את היומן. הוסף --yes כדי לאשר.");
  process.exit(2);
}

const targets = rows.filter((row) => row.seq >= from);
if (!targets.length) {
  console.error(`❌ אין רשומות מ-seq ${from} ומעלה`);
  process.exit(2);
}

// הרשומה הקודמת לנקודת ההתחלה = **האחרונה** שלפניה (הרשומות ממוינות לפי seq)
let previousHash = rows.filter((row) => row.seq < from).at(-1)?.entry_hash ?? GENESIS;
let changed = 0;
let lastSeq = rows.filter((row) => row.seq < from).at(-1)?.seq ?? from - 1;
db.exec("BEGIN IMMEDIATE");
try {
  // סגירת חורים: אם נמחקה רשומה (או שהיומן נקטע), רצף seq מדווח על "רצף לא
  // תקין" לתמיד. חתימה מחדש היא תיקון מכוון — ולכן היא גם ממספרת מחדש
  // ברצף, ואז החתימה מחושבת על המספור החדש. הכל גלוי כאירוע אבטחה.
  const update = db.prepare("UPDATE audit_log SET seq = ?, prev_hash = ?, entry_hash = ? WHERE id = ?");
  for (const row of targets) {
    const seq = lastSeq + 1;
    const entry_hash = hashOf({ ...row, seq, prev_hash: previousHash });
    if (entry_hash !== row.entry_hash || previousHash !== row.prev_hash || seq !== row.seq) {
      update.run(seq, previousHash, entry_hash, row.id);
      changed += 1;
    }
    previousHash = entry_hash;
    lastSeq = seq;
  }
  // העוגן חייב לזוז עם הראש החדש — אחרת "תיקון" היה נראה כמו חיתוך זנב.
  const newHead = db
    .prepare("SELECT seq, entry_hash FROM audit_log WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1")
    .get();
  if (newHead) {
    db.prepare(
      `INSERT INTO audit_anchor(id, seq, entry_hash, updated_at) VALUES(1, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, entry_hash = excluded.entry_hash, updated_at = excluded.updated_at`,
    ).run(newHead.seq, newHead.entry_hash);
  }
  db.prepare("INSERT INTO security_events(kind, severity, detail) VALUES(?,?,?)").run(
    "audit_resign",
    "critical",
    `חתימה מחדש של יומן הביקורת מ-seq ${from}: ${changed} רשומות · סיבה: תיקון יזום מהשרת`,
  );
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  console.error(`❌ החתימה מחדש נכשלה: ${error?.message ?? error}`);
  db.close();
  process.exit(1);
}

console.log("");
console.log(`✅ חתימה מחדש הושלמה: ${changed} רשומות עודכנו מ-seq ${from} (מספור רצוף, בלי חורים)`);
console.log("📝 נרשם אירוע אבטחה audit_resign (critical) — התיקון גלוי, לא מוסתר");
db.close();
