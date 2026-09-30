#!/usr/bin/env node
/**
 * בדיקת מוכנות לעלייה לאוויר — "מה עוד חסר לפני שאתה חי".
 *
 * למה זה קיים: רשימת הפערים של 7.5/10 הייתה רשימה כללית. כאן היא הופכת
 * לבדיקה שאפשר להריץ על השרת האמיתי ולקבל תשובה מדויקת: מה כבר מוכן,
 * מה דורש תשומת לב, ומה **חוסם** עלייה.
 *
 *   node scripts/preflight.mjs            # סיכום
 *   node scripts/preflight.mjs --verbose  # כולל כל שורה
 *
 * קוד יציאה: 0 = אין חסימות · 1 = יש חסימה אחת או יותר.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--verbose");

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
const results = [];
const check = (level, name, detail = "") => {
  results.push({ level, name, detail });
  if (verbose || level !== "ok") {
    const icon = level === "ok" ? "✅" : level === "warn" ? "⚠️ " : "❌";
    console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/* ── 1. סודות וזהות ───────────────────────────────────────────────────────── */
const SECRETS = ["APP_SECRET", "CSRF_SECRET", "MEDIA_SECRET", "BACKUP_KEY"];
for (const name of SECRETS) {
  const value = env[name];
  if (!value || value.length < 32) check("fail", `סוד ${name}`, value ? "קצר מדי (פחות מ-32)" : "חסר");
  else if (/change|secret|dev-|test/i.test(value) && !/^[A-Za-z0-9_-]{32,}$/.test(value)) check("warn", `סוד ${name}`, "נראה כמו ברירת מחדל");
  else check("ok", `סוד ${name}`);
}

const appUrl = String(env.APP_URL ?? "");
if (!appUrl.startsWith("https://")) check("fail", "APP_URL", `חייב https בדומיין אמיתי (כרגע: ${appUrl || "לא מוגדר"})`);
else if (/localhost|127\.0\.0\.1|\.e2b\.|\.e2b\.app/.test(appUrl)) check("fail", "APP_URL", `עדיין כתובת בדיקה (${appUrl}) — דומיין אמיתי לפני עלייה`);
else check("ok", "APP_URL", appUrl);

if (String(env.COOKIE_SECURE).toLowerCase() !== "true") check("fail", "COOKIE_SECURE", "חייב true בפרודקשן (עוגייה בלי HTTPS = סשן חשוף)");
else check("ok", "COOKIE_SECURE");

const adminPassword = env.SEED_ADMIN_PASSWORD ?? "";
if (!adminPassword) check("warn", "סיסמת מנהל", "לא מוגדרת ב-.env.local");
else if (adminPassword === "ChangeMe-Admin-2026!") check("fail", "סיסמת מנהל", "זו סיסמת ברירת המחדל של הסביבה — החלף לפני עלייה");
else check("ok", "סיסמת מנהל", "מותאמת אישית");

/* ── 2. פרוקסי ומודיעין ──────────────────────────────────────────────────── */
const proxyCidrs = String(env.TRUSTED_PROXY_CIDRS ?? "").trim();
if (!proxyCidrs) check("warn", "TRUSTED_PROXY_CIDRS", "לא מוגדר — אם אתה מאחורי Cloudflare/nginx הגדר את הטווחים כדי למנוע זיוף X-Forwarded-For");
else check("ok", "TRUSTED_PROXY_CIDRS", proxyCidrs.split(",").length + " טווחים");

check(env.STEALTH_MODE === "on" ? "ok" : "warn", "מצב חמקן", env.STEALTH_MODE === "on" ? "פעיל" : "כבוי (האתר מזוהה כ-Next.js)");

for (const [file, label] of [
  ["deploy/nginx-origin-lock.conf", "נעילת מקור ב-nginx"],
  ["deploy/nginx-security.conf", "כותרות אבטחה ב-nginx"],
  ["deploy/fail2ban-lemontank.conf", "Fail2ban"],
  ["deploy/cloudflared-config.yml", "מנהרת Cloudflare"],
]) {
  check(fs.existsSync(path.join(ROOT, file)) ? "ok" : "warn", `קובץ פריסה: ${label}`, fs.existsSync(path.join(ROOT, file)) ? "קיים (העתק לשרת)" : "חסר");
}

/* ── 3. המסד ─────────────────────────────────────────────────────────────── */
const DB_FILE = path.resolve(ROOT, String(env.DATABASE_FILE ?? "data/lemontank.db").replace(/^\.\//, ""));
if (!fs.existsSync(DB_FILE)) {
  check("fail", "מסד נתונים", `${DB_FILE} לא נמצא`);
} else {
  const mode = fs.statSync(DB_FILE).mode & 0o777;
  check(mode === 0o600 || mode === 0o400 ? "ok" : "warn", "הרשאות קובץ המסד", `0${mode.toString(8)} (מומלץ 0600)`);

  const db = new DatabaseSync(DB_FILE);
  const count = (sql, params = []) => Number(db.prepare(sql).get(...params)?.c ?? 0);

  const anchor = db.prepare("SELECT seq, entry_hash FROM audit_anchor WHERE id = 1").get();
  const head = db.prepare("SELECT seq, entry_hash FROM audit_log WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1").get();
  if (anchor?.seq != null && head?.seq != null && Number(anchor.seq) === Number(head.seq) && anchor.entry_hash === head.entry_hash) {
    check("ok", "יומן ביקורת", `${head.seq} רשומות, הראש תואם לעוגן`);
  } else {
    check("fail", "יומן ביקורת", `הראש (${head?.seq ?? "—"}) לא תואם לעוגן (${anchor?.seq ?? "—"}) — הרץ fortress-check`);
  }

  const staffTwoFa = Number(db.prepare("SELECT COUNT(*) c FROM users WHERE role IN ('owner','admin','staff') AND deleted_at IS NULL AND twofa_secret IS NULL").get()?.c ?? 0);
  check(staffTwoFa === 0 ? "ok" : "fail", "2FA לחשבונות סגל", staffTwoFa ? `${staffTwoFa} חשבונות בלי 2FA` : "כל הסגל מוגן");

  let requireStaff2fa = null;
  try {
    requireStaff2fa = db.prepare("SELECT value FROM security_settings WHERE key = 'require_staff_2fa'").get()?.value ?? null;
  } catch {
    /* אין טבלה */
  }
  check(requireStaff2fa === "1" || requireStaff2fa === "true" ? "ok" : "warn", "אכיפת 2FA לסגל", requireStaff2fa ? "פעילה" : "לא מוגדרת");

  let breachMode = null;
  try {
    breachMode = db.prepare("SELECT value FROM security_settings WHERE key = 'breach_check'").get()?.value ?? null;
  } catch {
    /* אין */
  }
  check(breachMode === "enforce" ? "ok" : "warn", "בדיקת סיסמאות דלופות", breachMode ?? "לא מוגדר");

  const plans = db.prepare("SELECT code, price_ils FROM plans ORDER BY price_ils").all();
  check(plans.length >= 2 ? "ok" : "warn", "מסלולי מנוי", plans.map((p) => `${p.code} ₪${p.price_ils}`).join(" · ") || "לא הוגדרו");

  const titles = count("SELECT COUNT(*) c FROM titles WHERE status = 'published'");
  check(titles > 0 ? "ok" : "warn", "תוכן מפורסם", titles ? `${titles} כותרות` : "קטלוג ריק — האתר באוויר בלי תוכן");

  const cards = count("SELECT COUNT(*) c FROM gift_cards WHERE status = 'active'");
  const pendingPayments = count("SELECT COUNT(*) c FROM redemption_requests WHERE status = 'pending'");
  if (pendingPayments) check("warn", "בקשות תשלום ממתינות", `${pendingPayments} ממתינות לאישור (/admin/giftcards)`);
  else check("ok", "בקשות תשלום", cards ? `${cards} כרטיסים פעילים, אין ממתינות` : "אין ממתינות");
  db.close();
}

/* ── 4. גיבוי ────────────────────────────────────────────────────────────── */
const backupDir = path.resolve(ROOT, String(env.BACKUP_DIR ?? "backups").replace(/^\.\//, ""));
if (!fs.existsSync(backupDir)) {
  check("fail", "תיקיית גיבוי", `${backupDir} לא קיימת — הרץ: node scripts/backup-encrypted.mjs`);
} else {
  const files = fs.readdirSync(backupDir).filter((name) => name.endsWith(".ltbk"));
  if (!files.length) check("fail", "גיבוי מוצפן", "אין קבצי .ltbk בתיקייה");
  else {
    const newest = files.map((name) => ({ name, mtime: fs.statSync(path.join(backupDir, name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime)[0];
    const ageHours = (Date.now() - newest.mtime) / 3_600_000;
    check(ageHours < 48 ? "ok" : "warn", "גיבוי אחרון", `${newest.name} (לפני ${ageHours.toFixed(1)} שעות)`);
  }
}
check(env.BACKUP_KEY ? "ok" : "fail", "מפתח גיבוי", env.BACKUP_KEY ? "מוגדר" : "חסר — הגיבוי לא יהיה מוצפן");

const offsite = ["OFFSITE_S3_BUCKET", "OFFSITE_S3_ACCESS_KEY", "OFFSITE_S3_SECRET_KEY"].every((key) => env[key]);
check(offsite ? "ok" : "warn", "גיבוי מחוץ לשרת", offsite ? `מוגדר (${env.OFFSITE_S3_BUCKET})` : "לא מוגדר — גיבוי על אותו דיסק לא מגן מפני כיבוי/כתיבה זדונית");

/* ── 5. התראות יוצאות ───────────────────────────────────────────────────── */
const alertTargets = [
  env.DISCORD_WEBHOOK_URL ? "Discord (env)" : null,
  env.ALERT_WEBHOOK_URL ? "Webhook (env)" : null,
  env.ALERT_EMAIL ? "מייל (env)" : null,
].filter(Boolean);
let dbTargets = [];
try {
  const db = new DatabaseSync(DB_FILE);
  for (const key of ["outbound_discord", "outbound_webhook", "outbound_email"]) {
    const value = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key)?.value ?? null;
    if (value) dbTargets.push(key.replace("outbound_", ""));
  }
  db.close();
} catch {
  dbTargets = [];
}
const targets = [...alertTargets, ...dbTargets];
check(targets.length ? "ok" : "warn", "התראות מחוץ לאתר", targets.length ? targets.join(" · ") : "לא הוגדר יעד — אירוע קריטי יישאר רק באתר");

/* ── 6. אכיפה בזמן ריצה ─────────────────────────────────────────────────── */
const fortress = spawnSync(process.execPath, ["scripts/fortress-check.mjs"], { cwd: ROOT, encoding: "utf8" });
const fortressLine = (fortress.stdout ?? "").split("\n").find((line) => line.includes("בדיקת חוסן")) ?? "";
const fortressFailures = Number(fortressLine.match(/(\d+)\s*כשלים/)?.[1] ?? 0);
check(fortressFailures === 0 ? "ok" : "fail", "בדיקת חוסן עצמית", fortressLine.trim() || "לא זוהתה שורת סיכום");

const serviceMode = String(env.SECURITY_MODE ?? env.LT_MODE ?? "enforce").toLowerCase();
check(serviceMode === "enforce" ? "ok" : "warn", "מצב אכיפה", serviceMode);

/* ── סיכום ──────────────────────────────────────────────────────────────── */
const fails = results.filter((row) => row.level === "fail").length;
const warns = results.filter((row) => row.level === "warn").length;
const oks = results.filter((row) => row.level === "ok").length;

console.log("");
console.log(`🚦 מוכנות לעלייה: ${oks} תקין · ${warns} לתשומת לב · ${fails} חוסם`);
if (fails) {
  console.log("");
  console.log("חוסמים (חייבים לטפל לפני שהאתר באוויר):");
  for (const row of results.filter((r) => r.level === "fail")) console.log(`   ❌ ${row.name}${row.detail ? ` — ${row.detail}` : ""}`);
}
if (warns) {
  console.log("");
  console.log("לתשומת לב (לא חוסם, אבל זה מה שמפריד בין 7.5 ל-10):");
  for (const row of results.filter((r) => r.level === "warn")) console.log(`   ⚠️  ${row.name}${row.detail ? ` — ${row.detail}` : ""}`);
}
console.log("");
process.exit(fails ? 1 : 0);
