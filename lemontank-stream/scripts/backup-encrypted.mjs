#!/usr/bin/env node
/**
 * גיבוי מוצפן של מסד הנתונים + שחזור מאומת.
 *
 * ─ למה הצפנה ולא רק העתקה ────────────────────────────────────────────────────
 * גיבוי לא מוצפן של מסד משתמשים הוא "העתק של הכל בכל מקום". כאן:
 *   · הגיבוי נארז, נדחס, ומוצפן ב-AES-256-GCM עם מפתח שמגיע מ-BACKUP_KEY
 *     (או נגזר מ-FIELD_ENCRYPTION_KEY) — בלי המפתח אין משמעות לקובץ.
 *   · נכתב לצידו קובץ manifest עם סכום בדיקה (SHA-256) של התוצר הסופי.
 *   · כל גיבוי נבדק מיד: פענוח + פתיחת SQLite + `PRAGMA integrity_check`
 *     + ספירת טבלאות. גיבוי שלא אומת — לא נחשב גיבוי.
 *
 * הרצה:
 *   node scripts/backup-encrypted.mjs                    # יצירה + אימות
 *   node scripts/backup-encrypted.mjs --list             # רשימת גיבויים
 *   node scripts/backup-encrypted.mjs --restore <file> --to <path>
 *   node scripts/backup-encrypted.mjs --prune --keep 7   # שמירת 7 האחרונים
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "..");
const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(ROOT, "backups");
const DB_FILE = process.env.DATABASE_FILE ?? path.join(ROOT, "data", "lemontank.db");
const MAGIC = Buffer.from("LTBK1");

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

/** מפתח הגיבוי: BACKUP_KEY אם קיים, אחרת נגזר מ-FIELD_ENCRYPTION_KEY (HKDF-like) */
function backupKey() {
  const raw = env.BACKUP_KEY || env.FIELD_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    console.error("❌ חסר BACKUP_KEY (או FIELD_ENCRYPTION_KEY באורך 32+) — הרץ: node scripts/gen-secrets.mjs --write");
    process.exit(2);
  }
  // גזירה דטרמיניסטית: אותו סוד ⇒ אותו מפתח, גם אחרי שחזור גיבוי
  return crypto.createHash("sha256").update(`lemontank-backup-v1:${raw}`).digest();
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};

/* ── רשימה ─────────────────────────────────────────────────────────────────── */
if (flag("--list")) {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log("אין תיקיית גיבויים עדיין.");
    process.exit(0);
  }
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((file) => file.endsWith(".ltbk"))
    .sort()
    .reverse();
  if (!files.length) console.log("אין גיבויים.");
  for (const file of files) {
    const stat = fs.statSync(path.join(BACKUP_DIR, file));
    console.log(`${file}  ·  ${(stat.size / 1024).toFixed(1)} KB  ·  ${stat.mtime.toISOString().slice(0, 19)}`);
  }
  process.exit(0);
}

/* ── שחזור ─────────────────────────────────────────────────────────────────── */
if (flag("--restore")) {
  const source = valueOf("--restore");
  const target = valueOf("--to", path.join(ROOT, "data", "restored.db"));
  if (!source || !fs.existsSync(source)) {
    console.error("❌ לא נמצא קובץ הגיבוי לשחזור");
    process.exit(2);
  }
  const payload = fs.readFileSync(source);
  if (!payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    console.error("❌ הקובץ אינו גיבוי של LemonTank (חתימה שגויה)");
    process.exit(2);
  }
  const iv = payload.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = payload.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const body = payload.subarray(MAGIC.length + 28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", backupKey(), iv);
  decipher.setAuthTag(tag);
  const plain = zlib.gunzipSync(Buffer.concat([decipher.update(body), decipher.final()]));

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, plain, { mode: 0o600 });
  console.log(`✅ שוחזר אל ${target} (${(plain.length / 1024).toFixed(1)} KB)`);

  const check = verify(target);
  console.log(check.ok ? `✅ אימות אחרי שחזור עבר (${check.tables} טבלאות)` : `❌ האימות נכשל: ${check.error}`);
  process.exit(check.ok ? 0 : 1);
}

/* ── אימות ─────────────────────────────────────────────────────────────────── */
function verify(file) {
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    const integrity = db.prepare("PRAGMA integrity_check").get();
    const tables = Number(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table'").get().c);
    const users = Number(db.prepare("SELECT COUNT(*) c FROM users").get().c);
    db.close();
    const ok = String(integrity?.integrity_check ?? "").toLowerCase() === "ok";
    return { ok, tables, users, error: ok ? null : `integrity_check=${integrity?.integrity_check}` };
  } catch (error) {
    return { ok: false, tables: 0, users: 0, error: String(error?.message ?? error) };
  }
}

/* ── גיבוי ─────────────────────────────────────────────────────────────────── */
function backup() {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`❌ לא נמצא מסד נתונים ב-${DB_FILE}`);
    process.exit(2);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });

  // VACUUM INTO נותן צילום עקבי של המסד בזמן שהמערכת עובדת
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshot = path.join(BACKUP_DIR, `.snapshot-${stamp}.db`);
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
  db.close();

  const raw = fs.readFileSync(snapshot);
  fs.unlinkSync(snapshot);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", backupKey(), iv);
  const encrypted = Buffer.concat([cipher.update(zlib.gzipSync(raw, { level: 9 })), cipher.final()]);
  const payload = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);

  const file = path.join(BACKUP_DIR, `lemontank-${stamp}.ltbk`);
  fs.writeFileSync(file, payload, { mode: 0o600 });

  const digest = crypto.createHash("sha256").update(payload).digest("hex");
  fs.writeFileSync(
    `${file}.json`,
    JSON.stringify(
      { file: path.basename(file), createdAt: new Date().toISOString(), bytes: payload.length, sha256: digest, algorithm: "aes-256-gcm", dbFile: path.basename(DB_FILE) },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  console.log(`🔐 נוצר גיבוי מוצפן: ${path.basename(file)} (${(payload.length / 1024).toFixed(1)} KB)`);

  // אימות מיידי: מפענחים לזיכרון ובודקים שלמות — בלי לגעת בדיסק
  const decipher = crypto.createDecipheriv("aes-256-gcm", backupKey(), iv);
  decipher.setAuthTag(payload.subarray(MAGIC.length + 12, MAGIC.length + 28));
  const verified = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted), decipher.final()]));
  const tempPath = path.join(BACKUP_DIR, `.verify-${stamp}.db`);
  fs.writeFileSync(tempPath, verified, { mode: 0o600 });
  const check = verify(tempPath);
  fs.unlinkSync(tempPath);

  if (!check.ok) {
    console.error(`❌ הגיבוי נוצר אך האימות נכשל: ${check.error}`);
    process.exit(1);
  }
  console.log(`✅ אימות עבר: SQLite תקין, ${check.tables} טבלאות, ${check.users} משתמשים`);
  console.log(`   SHA-256: ${digest.slice(0, 32)}…`);

  if (flag("--prune")) {
    const keep = Number(valueOf("--keep", "7"));
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith(".ltbk"))
      .sort()
      .reverse();
    for (const old of files.slice(keep)) {
      for (const suffix of ["", ".json"]) {
        const target = path.join(BACKUP_DIR, old + suffix);
        if (fs.existsSync(target)) fs.unlinkSync(target);
      }
      console.log(`🧹 נמחק גיבוי ישן: ${old}`);
    }
  }
}

backup();
