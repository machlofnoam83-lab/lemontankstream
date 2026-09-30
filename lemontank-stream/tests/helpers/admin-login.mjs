/**
 * עזר התחברות לבדיקות — כולל אימות דו-שלבי אמיתי.
 *
 * למה זה קיים: אזור הניהול דורש 2FA (שכבת "המבצר"). כדי שהבדיקות ימשיכו
 * לבדוק את המערכת **כמו שהיא באמת**, הן עוברות את אותו מסלול שהאדם עובר:
 *   1. התחברות בסיסמה → מקבלים אתגר.
 *   2. חישוב קוד TOTP מהסוד (אותו אלגוריתם RFC 6238 שהשרת מאמת).
 *   3. השלמת ההתחברות עם האתגר והקוד.
 *
 * הסוד נשמר בקובץ זמני כדי שכל קבצי הבדיקות ישתמשו באותו חשבון בלי לכבות 2FA.
 */

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * שחזור סוד ה-2FA כשהקובץ הזמני אבד (למשל אחרי ריסטארט של הסביבה).
 * הסקריפט המקומי מבטל את ה-2FA — בדיוק המסלול שמשתמש אמיתי היה עובר
 * עם מכשיר אבוד, ורק מי שיש לו גישה לקבצי השרת יכול להריץ אותו.
 */
export function resetTwoFactor(email) {
  try {
    execFileSync(process.execPath, ["scripts/reset-2fa.mjs", "--email", email, "--yes"], {
      cwd: REPO_ROOT,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

export const TOTP_STORE = "/tmp/lt-admin-2fa.json";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of String(input).toUpperCase().replace(/=+$/, "")) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** קוד TOTP תואם RFC 6238 (SHA-1, 6 ספרות, חלון 30 שניות) */
export function totpCode(secret, at = Date.now()) {
  const counter = Math.floor(at / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function savedSecret() {
  try {
    return JSON.parse(readFileSync(TOTP_STORE, "utf8")).secret ?? null;
  } catch {
    return null;
  }
}

export function saveSecret(secret) {
  try {
    writeFileSync(TOTP_STORE, JSON.stringify({ secret }));
  } catch {
    /* לא קריטי */
  }
}

/**
 * מתחבר כמנהל, כולל מסלול 2FA.
 *
 * @returns {Promise<{ok: boolean, client: object, enabled2fa?: boolean, reason?: string}>}
 */
/**
 * אימות מחדש (step-up) — מה שהמשתמש האמיתי עושה כשמבקשים ממנו סיסמה
 * לפני פעולה הרסנית. הבדיקות קוראות לזה פעם אחת ב-before.
 */
export async function stepUp(client, password) {
  const res = await client.post("/api/security/step-up", { password });
  return { ok: res.body?.ok === true, status: res.status, body: res.body };
}

export async function adminLogin(Client, base, email, password) {
  const client = new Client();
  await client.raw("/login");
  const first = await client.post("/api/auth/login", { email, password });

  if (first.body?.ok === true && first.body.data?.user) {
    // התחברות רגילה (2FA עדיין כבוי) — מפעילים אותו כדי לבדוק את המבצר באמת
    const setup = await client.post("/api/auth/2fa", { action: "setup" });
    const secret = setup.body?.data?.secret;
    if (!secret) return { ok: true, client, enabled2fa: false };

    const enabled = await client.post("/api/auth/2fa", { action: "enable", code: totpCode(secret) });
    if (enabled.body?.ok !== true) return { ok: true, client, enabled2fa: false };

    saveSecret(secret);
    saveSession(client);
    return { ok: true, client, enabled2fa: true };
  }

  // 2FA פעיל — משלימים עם הקוד
  const challenge = first.body?.data?.challenge;
  if (first.body?.data?.requires2fa && challenge) {
    const secret = savedSecret();
    if (!secret) {
      // אין סוד שמור: מאפסים דרך הסקריפט המקומי (מסלול "מכשיר אבוד") ומתחברים מחדש
      if (!resetTwoFactor(email)) return { ok: false, client: null, reason: "2fa_enabled_without_secret" };
      return adminLogin(Client, base, email, password);
    }
    const done = await client.post("/api/auth/login", { email, challenge, totp: totpCode(secret) });
    if (done.body?.ok === true && done.body.data?.user) return { ok: true, client, enabled2fa: true };
    return { ok: false, client: null, reason: `2fa_rejected:${done.status}` };
  }

  return { ok: false, client: null, reason: `login_failed:${first.status}` };
}

/** במהירות: האם למשתמש המחובר יש 2FA פעיל */
export async function has2fa(client) {
  const res = await client.get("/api/auth/me");
  return res.body?.data?.user?.twofa_enabled === 1 || res.body?.data?.twofa_enabled === 1;
}

/* ── שמירת סשן בין קבצי בדיקה ──────────────────────────────────────────────
 * מכסת "התחברות" במערכת היא 8 ניסיונות ל-5 דקות לכל IP (הגנת brute-force
 * אמיתית, לא נכוון אותה בשביל בדיקות). לכן כל קובץ בדיקות שומר את עוגיות
 * הסשן שהתקבלו, והקובץ הבא פשוט ממשיך איתן — בדיוק כמו דפדפן אמיתי.
 */
const SESSION_STORE = "/tmp/lt-admin-session.json";

export function saveSession(client) {
  try {
    writeFileSync(SESSION_STORE, JSON.stringify({ cookies: [...client.cookies.entries()], at: Date.now() }));
  } catch {
    /* לא קריטי */
  }
}

/** מחזיר לקוח עם עוגיות סשן תקפות, או null */
export async function restoreSession(Client, base) {
  try {
    const saved = JSON.parse(readFileSync(SESSION_STORE, "utf8"));
    if (!saved?.cookies?.length) return null;
    // סשן בן יותר מ-20 דקות — עדיף להתחבר מחדש מאשר להסתמך עליו
    if (Date.now() - Number(saved.at ?? 0) > 20 * 60_000) return null;

    const client = new Client();
    for (const [key, value] of saved.cookies) client.cookies.set(key, value);

    // חשוב: /api/auth/me מחזיר 200 גם בלי סשן (user=null), ולכן הבדיקה
    // היא על קיום המשתמש בפועל — אחרת "סשן תקף" היה מתגלה רק בבדיקה הבאה.
    const me = await client.get("/api/auth/me");
    const user = me.body?.data?.user ?? null;
    return me.status === 200 && user ? client : null;
  } catch {
    return null;
  }
}
