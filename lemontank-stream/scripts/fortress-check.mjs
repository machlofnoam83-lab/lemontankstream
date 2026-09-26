#!/usr/bin/env node
/**
 * בדיקת חוסן עצמית (Self-check) — רצה בכל עליית מערכת ובכל דרישה.
 *
 * הרעיון: מערכת אבטחה שלא בודקת את עצמה היא הנחה, לא הגנה. כאן נבדקות
 * ההנחות הקריטיות בפועל, וכל כשל מדווח בשקט ללוג (ובפאנל כשמבקשים).
 *
 * מה נבדק:
 *  1. סודות חתימה קיימים וארוכים מספיק (סשן/CSRF/הצפנת שדות/IP).
 *  2. ההגירות הוחלו — כלומר עמודות המבצר קיימות במסד.
 *  3. שלמות שרשרת יומן הביקורת.
 *  4. אין סגל בלי 2FA (כשמדיניות החובה פעילה).
 *  5. אין סשנים פעילים בלי קישור מכשיר.
 *  6. רשימת ההיתר של הניהול מוגדרת (אזהרה בלבד, לא כשל).
 *  7. הרשאות הקובץ של מסד הנתונים.
 *
 * הרצה ידנית:  node scripts/fortress-check.mjs
 * הרצה עם פרטים: node scripts/fortress-check.mjs --verbose
 * הוכחת גילוי:  node scripts/fortress-check.mjs --tamper
 *   (מעתיק את המסד לקובץ זמני, מזייף רשומת ביקורת, ומוודא שהשרשרת
 *    אכן מזוהה כשבורה — ההוכחה שהגלאי עובד, לא רק שהוא קיים.)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB_FILE = process.env.DATABASE_FILE ?? path.join(ROOT, "data", "lemontank.db");
const verbose = process.argv.includes("--verbose");

/**
 * מצב --tamper: מוכיח שהשרשרת מזהה זיוף. לא נוגעים במסד האמיתי —
 * עובדים על העתק זמני, מזייפים בו רשומה, ובודקים שהאימות נכשל.
 */
if (process.argv.includes("--tamper")) {
  /**
   * הוכחת גלאי: לא נוגעים במסד האמיתי — מעתיקים אותו, ומבצעים בו שני זיופים
   * שהתוקף הסביר היה מבצע:
   *   א. עריכת רשומה קיימת (לשנות אחר כך מה שנרשם).
   *   ב. מחיקת הרשומות האחרונות (לחתוך את הזנב כדי שהחדירה לא תירשם).
   * בשני המקרים האימות חייב להיכשל — אחרת "שרשרת מאומתת" היא סיסמה ריקה.
   */
  const sha = (parts) =>
    crypto
      .createHash("sha256")
      .update(
        [parts.seq, parts.prev_hash, parts.action, parts.actor_id ?? "", parts.entity ?? "", parts.entity_id ?? "",
          parts.severity, parts.created_at, parts.after_json ?? ""].join("\u0001"),
      )
      .digest("hex");

  const GENESIS = "0".repeat(64);

  /**
   * העתקה של מסד ב-WAL חייבת לכלול גם את קובצי ה-WAL/שרד, אחרת ההעתק מייצג
   * מצב ישן — והבדיקה "עוברת" על מסד שלא באמת נבדק.
   */
  const copyDb = (target) => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const source = `${DB_FILE}${suffix}`;
      if (fs.existsSync(source)) fs.copyFileSync(source, `${target}${suffix}`);
    }
  };

  const attack = (label, mutate) => {
    const tmp = path.join(os.tmpdir(), `lt-tamper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.db`);
    copyDb(tmp);
    const copy = new DatabaseSync(tmp);
    const anchor = copy.prepare("SELECT seq, entry_hash FROM audit_anchor WHERE id = 1").get();
    const detail = mutate(copy);
    copy.close();

    const check = new DatabaseSync(tmp);
    const rows = check
      .prepare(
        `SELECT id, seq, prev_hash, entry_hash, action, actor_id, entity, entity_id, severity, after_json, created_at
         FROM audit_log WHERE seq IS NOT NULL ORDER BY seq ASC LIMIT 20000`,
      )
      .all();
    const anchorAfter = check.prepare("SELECT seq, entry_hash FROM audit_anchor WHERE id = 1").get();
    check.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = `${tmp}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    let broken = 0;
    let previous = GENESIS;
    let expected = rows.length ? Number(rows[0].seq) : 1;
    for (const entry of rows) {
      if (Number(entry.seq) !== expected) broken += 1;
      if ((entry.prev_hash ?? GENESIS) !== previous) broken += 1;
      if (sha({ ...entry, prev_hash: entry.prev_hash ?? GENESIS }) !== entry.entry_hash) broken += 1;
      previous = entry.entry_hash ?? previous;
      expected += 1;
    }
    // בדיקת העוגן — זו שתופסת חיתוך זנב
    const headSeq = rows.length ? Number(rows.at(-1).seq) : 0;
    const headHash = rows.length ? rows.at(-1).entry_hash : null;
    if (anchorAfter?.seq != null && Number(anchorAfter.seq) > headSeq) broken += 1;
    else if (anchorAfter?.seq != null && Number(anchorAfter.seq) === headSeq && anchorAfter.entry_hash !== headHash) broken += 1;

    const caught = broken > 0;
    console.log(
      caught
        ? `✅ הגלאי עובד: ${label} — זוהה (${broken} חריגות; עוגן seq=${anchor?.seq ?? "?"})`
        : `❌ הגלאי לא זיהה: ${label} (${detail})`,
    );
    return caught;
  };

  const editCaught = attack("עריכת רשומה קיימת", (copy) => {
    const row = copy
      .prepare("SELECT id FROM audit_log WHERE entry_hash IS NOT NULL AND seq IS NOT NULL ORDER BY seq DESC LIMIT 1")
      .get();
    if (!row) return "אין רשומות משורשרות";
    copy.prepare("UPDATE audit_log SET after_json = ? WHERE id = ?").run('{"tampered":true}', row.id);
    return `שונה after_json של רשומה ${row.id}`;
  });

  const truncateCaught = attack("מחיקת 3 הרשומות האחרונות", (copy) => {
    const removed = copy
      .prepare("DELETE FROM audit_log WHERE id IN (SELECT id FROM audit_log WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 3)")
      .run();
    return `נמחקו ${removed.changes ?? 0} רשומות`;
  });

  process.exit(editCaught && truncateCaught ? 0 : 1);
}

const results = [];
const add = (level, name, detail) => {
  results.push({ level, name, detail });
  if (verbose || level !== "ok") {
    const icon = level === "ok" ? "✅" : level === "warn" ? "⚠️ " : "❌";
    console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/* ── 1. סודות ─────────────────────────────────────────────────────────────── */
function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
// שמות הסודות כפי שהם בשימוש בפועל בקוד (gen-secrets.mjs כותב את כולם)
const SECRETS = ["APP_SECRET", "CSRF_SECRET", "MEDIA_SECRET"];

for (const name of SECRETS) {
  const value = env[name];
  if (!value) {
    add("fail", `סוד חסר: ${name}`, "הרץ: node scripts/gen-secrets.mjs --write");
  } else if (value.length < 32) {
    add("fail", `סוד קצר מדי: ${name}`, `${value.length} תווים (נדרש 32+)`);
  } else if (/^(changeme|secret|test|dev|1234)/i.test(value)) {
    add("fail", `סוד לפי תבנית ברירת מחדל: ${name}`, "החלף לסוד אקראי");
  } else {
    add("ok", `סוד תקין: ${name}`);
  }
}

/* ── 2-6. מסד הנתונים ────────────────────────────────────────────────────── */
let db = null;
try {
  db = new DatabaseSync(DB_FILE, { readOnly: true });
} catch (error) {
  add("warn", "לא ניתן לפתוח את המסד לקריאה", String(error?.message ?? error));
}

if (db) {
  const tableExists = (name) =>
    Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name));
  const count = (sql, params = []) => Number(db.prepare(sql).get(...params)?.c ?? 0);
  const hasColumn = (table, column) =>
    Boolean(tableExists(table) && db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column));

  // 2. הגירות
  const required = [
    ["sessions", "ua_hash"],
    ["sessions", "ip_prefix"],
    ["sessions", "absolute_expires_at"],
    ["sessions", "stepup_until"],
    ["audit_log", "entry_hash"],
    ["audit_log", "seq"],
  ];
  const missing = required.filter(([table, column]) => !hasColumn(table, column));
  if (missing.length) {
    add("fail", "הגירות חסרות", missing.map(([t, c]) => `${t}.${c}`).join(", "));
  } else {
    add("ok", "עמודות המבצר קיימות", `${required.length} עמודות`);
  }

  // 3. שלמות השרשרת (בדיקה עצמאית, בלי ייבוא מהאפליקציה)
  if (hasColumn("audit_log", "entry_hash")) {
    const rows = db
      .prepare(
        `SELECT id, seq, prev_hash, entry_hash, action, actor_id, entity, entity_id, severity, after_json, created_at
         FROM audit_log WHERE seq IS NOT NULL ORDER BY seq ASC LIMIT 2000`,
      )
      .all();
    const hash = (parts) =>
      crypto
        .createHash("sha256")
        .update(
          [
            parts.seq,
            parts.prev_hash,
            parts.action,
            parts.actor_id ?? "",
            parts.entity ?? "",
            parts.entity_id ?? "",
            parts.severity,
            parts.created_at,
            parts.after_json ?? "",
          ].join("\u0001"),
        )
        .digest("hex");

    let previous = "0".repeat(64);
    let broken = 0;
    for (const row of rows) {
      const expected = hash({ ...row, prev_hash: row.prev_hash ?? "0".repeat(64) });
      if (expected !== row.entry_hash) broken += 1;
      if ((row.prev_hash ?? "0".repeat(64)) !== previous) broken += 1;
      previous = row.entry_hash ?? previous;
    }
    if (broken === 0) add("ok", "שרשרת יומן הביקורת שלמה", `${rows.length} רשומות נבדקו`);
    else add("fail", "שרשרת יומן הביקורת נשברה", `${broken} חריגות — בדוק את /admin/fortress`);
  }

  // 4. 2FA לסגל
  if (tableExists("users")) {
    const staff = db.prepare("SELECT email, twofa_enabled FROM users WHERE role IN ('editor','admin','owner') AND deleted_at IS NULL").all();
    const missing2fa = staff.filter((row) => Number(row.twofa_enabled) !== 1);
    const policyRow = db.prepare("SELECT value FROM security_settings WHERE key='require_staff_2fa'").get();
    const policyOn = (policyRow?.value ?? "on") !== "off";
    if (!policyOn) add("warn", "מדיניות 2FA לסגל כבויה", "מומלץ להפעיל (require_staff_2fa=on)");
    else if (missing2fa.length) add("fail", "סגל בלי 2FA", missing2fa.map((row) => row.email).join(", "));
    else add("ok", "כל הסגל עם 2FA", `${staff.length} חשבונות`);
  }

  // 5. סשנים בלי קישור מכשיר
  if (hasColumn("sessions", "ua_hash")) {
    const unbound = count("SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL AND ua_hash IS NULL");
    const active = count("SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL");
    if (unbound > 0) add("warn", "סשנים ותיקים בלי קישור מכשיר", `${unbound} מתוך ${active} — ייסגרו בהתחברות הבאה`);
    else add("ok", "כל הסשנים מקושרים למכשיר ולרשת", `${active} סשנים פעילים`);
  }

  // 6. רשימת היתר לניהול
  const allowlist = db.prepare("SELECT value FROM security_settings WHERE key='admin_ip_allowlist'").get()?.value ?? "";
  if (allowlist.trim()) add("ok", "רשימת היתר לניהול פעילה", allowlist);
  else add("warn", "אין רשימת היתר לניהול", "מוגן ב-2FA, אך רשימת היתר מוסיפה שכבת הגנה");

  // 7. הרשאות קובץ
  try {
    const mode = fs.statSync(DB_FILE).mode & 0o777;
    if (mode & 0o077) add("warn", "הרשאות המסד פתוחות מדי", `0${mode.toString(8)} — מומלץ 0600`);
    else add("ok", "הרשאות המסד", `0${mode.toString(8)}`);
  } catch {
    /* קובץ חסר — ידווח בשלב הפתיחה */
  }

  db.close();
}

/* ── סיכום ───────────────────────────────────────────────────────────────── */
const fails = results.filter((row) => row.level === "fail");
const warns = results.filter((row) => row.level === "warn");

console.log("");
console.log(`🛡️  בדיקת חוסן: ${results.length - fails.length - warns.length} תקין · ${warns.length} אזהרות · ${fails.length} כשלים`);

if (fails.length) {
  console.log("");
  for (const row of fails) console.log(`   ❌ ${row.name}${row.detail ? ` — ${row.detail}` : ""}`);
  process.exitCode = 1;
}
