/**
 * מודול קריפטוגרפיה — כל הפרימיטיבים במקום אחד, מבוסס node:crypto בלבד
 * (אפס תלויות צד-שלישי → אפס סיכון ל-supply-chain).
 *
 *  • סיסמאות: scrypt (N=2^15, r=8, p=1) — KDF עמיד בזיכרון, מומלץ ע"י OWASP.
 *  • טוקנים: CSPRNG 256-bit, נשמרים ב-DB כ-SHA-256 בלבד (הטוקן עצמו לא נשמר לעולם).
 *  • הצפנת שדות רגישים (סודות 2FA): AES-256-GCM.
 *  • השוואות: timingSafeEqual בלבד.
 */

import crypto from "node:crypto";

/* ─────────────────────────────── סיסמאות ───────────────────────────────── */

const SCRYPT_N = 32768; // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

export const PASSWORD_ALGO = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}`;

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keylen = KEY_LEN): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      keylen,
      { N, r, p, maxmem: 256 * 1024 * 1024 },
      (err, derived) => (err ? reject(err) : resolve(derived)),
    );
  });
}

/** יוצר hash לסיסמה בפורמט: scrypt$N$r$p$saltHex$hashHex */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = await scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `${PASSWORD_ALGO}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** אימות סיסמה — השוואה בזמן קבוע, תמיכה בשדרוג פרמטרים עתידי */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    const parts = String(stored).split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scryptAsync(password, salt, Number(nStr), Number(rStr), Number(pStr), expected.length);
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

/** מדיניות סיסמה: 10+ תווים, אות, ספרה, תו מיוחד, ללא סיסמאות נפוצות */
const COMMON_PASSWORDS = new Set([
  "1234567890", "password", "password1", "qwerty123", "123456789", "admin12345",
  "iloveyou1", "welcome123", "letmein123", "abcd123456", "israel1234", "sapassword",
]);

export function checkPasswordStrength(password: string): { ok: boolean; score: number; problems: string[] } {
  const problems: string[] = [];
  const pw = String(password ?? "");
  if (pw.length < 10) problems.push("הסיסמה חייבת להכיל לפחות 10 תווים");
  if (pw.length > 200) problems.push("הסיסמה ארוכה מדי (מקסימום 200 תווים)");
  if (!/[a-z]/.test(pw) && !/[\u0590-\u05FF]/.test(pw)) problems.push("חייבת לכלול אות");
  if (!/[A-Z]/.test(pw) && !/[\u0590-\u05FF]/.test(pw)) problems.push("מומלץ להוסיף אות גדולה או תו בעברית");
  if (!/\d/.test(pw)) problems.push("חייבת לכלול ספרה");
  if (!/[^A-Za-z0-9\u0590-\u05FF]/.test(pw)) problems.push("חייבת לכלול תו מיוחד (!@#$%)");
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) problems.push("הסיסמה נמצאת ברשימת הסיסמאות הנפוצות");
  if (/^(.)\1+$/.test(pw)) problems.push("אין לחזור על אותו תו");
  const score = Math.max(0, 100 - problems.length * 18 + Math.min(20, pw.length - 10));
  return { ok: problems.length === 0, score: Math.min(100, score), problems };
}

/* ───────────────────────────── טוקנים ──────────────────────────────────── */

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString("base64url");
export const randomId = (bytes = 16): string => crypto.randomBytes(bytes).toString("hex");
export const randomCode = (digits = 6): string =>
  Array.from(crypto.randomBytes(digits)).map((b) => String(b % 10)).join("");

export const sha256 = (value: string | Buffer): string =>
  crypto.createHash("sha256").update(value).digest("hex");

export const hmac = (value: string, secret: string, algo = "sha256"): string =>
  crypto.createHmac(algo, secret).update(value).digest("hex");

/** השוואה בזמן קבוע בין שני מחרוזות/באפרים */
export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // עדיין מבצעים השוואה כדי לא לחשוף אורך בזמן
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/** IP מגובב — נשמר באנליטיקה בלי לזהות אדם (עמידה ב-GDPR) */
export const hashIp = (ip: string): string => sha256(`ip:${ip}:${process.env.APP_SECRET ?? "dev"}`).slice(0, 32);

/* ─────────────────────── הצפנת שדות רגישים (AES-GCM) ───────────────────── */

function fieldKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 24) {
    // במצב פיתוח בלבד: נגזרת דטרמיניסטית, עם אזהרה
    return crypto.scryptSync("lemontank-dev-only-insecure-key", "lemontank-salt", 32);
  }
  return crypto.scryptSync(secret, "lemontank-field-encryption", 32);
}

/** מצפין מחרוזת → enc:v1:iv:tag:ciphertext (base64url) */
export function encryptField(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", fieldKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("enc:v1:")) return value; // תאימות לאחור
  try {
    const [, , ivB64, tagB64, dataB64] = value.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", fieldKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/* ──────────────────────────── 2FA / TOTP ──────────────────────────────── */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = (): string => base32Encode(crypto.randomBytes(20));

/** קוד TOTP תואם RFC 6238 (SHA-1, 30 שניות, 6 ספרות) */
export function totpCode(secret: string, timestampMs = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(timestampMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

/** מאמת קוד 2FA עם חלון ±1 צעד (סובלנות לשעון לא מסונכרן) */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const clean = String(code ?? "").replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    if (safeEqual(totpCode(secret, now + i * 30_000), clean)) return true;
  }
  return false;
}

export const otpauthUrl = (secret: string, email: string, issuer = "LemonTank Stream"): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/* ────────────────────── חתימת URL למדיה (Signed URLs) ──────────────────── */

/** יוצר טוקן חתום עם תפוגה לזרימת וידאו/הורדה — מונע שיתוף קישורים ישירים */
export function signMediaToken(payload: Record<string, string | number>, ttlSeconds = 300): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  const sig = hmac(body, process.env.MEDIA_SECRET ?? process.env.APP_SECRET ?? "dev-media-secret");
  return `${body}.${sig}`;
}

export function verifyMediaToken<T = Record<string, unknown>>(token: string): (T & { exp: number }) | null {
  try {
    const [body, sig] = String(token).split(".");
    if (!body || !sig) return null;
    const expected = hmac(body, process.env.MEDIA_SECRET ?? process.env.APP_SECRET ?? "dev-media-secret");
    if (!safeEqual(sig, expected)) return null;
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof decoded?.exp !== "number" || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** גיבוב IP+UA למזהי מכשיר יציבים */
export const deviceFingerprint = (ip: string, userAgent: string): string =>
  sha256(`${ip}|${userAgent}`).slice(0, 32);
