/**
 * מפתחות API אישיים.
 *
 * ── איך זה עובד ──────────────────────────────────────────────────────────────
 *  · המפתח מוצג למשתמש **פעם אחת** ביצירתו: `lt_live_<32 תווים אקראיים>`.
 *  · במסד נשמר רק ה-SHA-256 שלו — מי שמשיג את המסד לא יכול להשתמש במפתחות.
 *  · כל בקשה עם `Authorization: Bearer <key>` מזוהה, נספרת, ונאכפת בהרשאות
 *    ובהקצאת קצב **של המפתח** (לא של הסשן).
 *  · אפשר לבטל מפתח בכל רגע — הביטול מיידי (revoked_at), בלי לפגוע בשאר.
 *
 * ── למה hash ולא הצפנה ───────────────────────────────────────────────────────
 *   אנחנו לא צריכים לשחזר את המפתח, רק להשוות. SHA-256 עם השוואה בזמן קבוע
 *   (safeEqual) נותן את אותה אבטחה כמו סיסמה בלי סיבוך.
 */

import crypto from "node:crypto";
import { all, get, run } from "./db";
import { ApiError } from "./http";

export type ApiScope = "read" | "write" | "admin";

export type ApiKeyRecord = {
  id: number;
  user_id: number;
  name: string;
  prefix: string;
  scopes: string;
  rate_limit: number;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomPart(length: number, bytes: number): string {
  const raw = crypto.randomBytes(bytes);
  let out = "";
  for (const byte of raw) out += ALPHABET[byte % ALPHABET.length];
  return out.slice(0, length);
}

export const hashKey = (key: string): string => crypto.createHash("sha256").update(key, "utf8").digest("hex");

/** השוואה בזמן קבוע — לא חושפת אם הקידומת נכונה */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createApiKey(input: {
  userId: number;
  name: string;
  scopes?: ApiScope[];
  rateLimit?: number;
  expiresInDays?: number | null;
}): { key: string; record: ApiKeyRecord } {
  const existing = get<{ c: number }>(
    "SELECT COUNT(*) c FROM api_keys WHERE user_id = ? AND revoked_at IS NULL",
    [input.userId],
  );
  if (Number(existing?.c ?? 0) >= 10) throw new ApiError("LIMIT_REACHED", 400, "אפשר להחזיק עד 10 מפתחות פעילים");

  const id = randomPart(6, 6);
  const secret = randomPart(32, 32);
  const key = `lt_live_${id}${secret}`;
  const prefix = `lt_live_${id}`;
  const scopes = (input.scopes?.length ? input.scopes : ["read"]).join(",");
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
      : null;

  const result = run(
    `INSERT INTO api_keys(user_id, name, prefix, key_hash, scopes, rate_limit, expires_at)
     VALUES(?,?,?,?,?,?,?)`,
    [input.userId, input.name.slice(0, 60), prefix, hashKey(key), scopes, input.rateLimit ?? 120, expiresAt],
  );

  const record = get<ApiKeyRecord>("SELECT * FROM api_keys WHERE id = ?", [Number(result.lastInsertRowid)]);
  return { key, record: record! };
}

export function listApiKeys(userId: number): ApiKeyRecord[] {
  return all<ApiKeyRecord>(
    `SELECT id, user_id, name, prefix, scopes, rate_limit, last_used_at, expires_at, revoked_at, created_at
     FROM api_keys WHERE user_id = ? ORDER BY id DESC`,
    [userId],
  );
}

export function revokeApiKey(userId: number, id: number): boolean {
  const result = run(
    "UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
    [id, userId],
  );
  return result.changes > 0;
}

export type ResolvedKey = {
  record: ApiKeyRecord;
  userId: number;
  scopes: ApiScope[];
};

/** מפענח כותרת Authorization ומחזיר את המפתח אם הוא תקף */
export function resolveBearer(header: string | null): ResolvedKey | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(lt_live_[a-z0-9]{38})$/i);
  if (!match) return null;
  const key = match[1];

  const record = get<ApiKeyRecord>("SELECT * FROM api_keys WHERE key_hash = ?", [hashKey(key)]);
  if (!record) return null;
  if (record.revoked_at) throw new ApiError("KEY_REVOKED", 401, "המפתח בוטל");
  if (record.expires_at && record.expires_at < new Date().toISOString()) throw new ApiError("KEY_EXPIRED", 401, "המפתח פג תוקף");

  // רישום שימוש — לא חוסם את הבקשה
  try {
    run("UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [record.id]);
  } catch {
    /* ignore */
  }

  return {
    record,
    userId: record.user_id,
    scopes: record.scopes.split(",").map((s) => s.trim()).filter(Boolean) as ApiScope[],
  };
}

export const keyHasScope = (scopes: ApiScope[], needed: ApiScope): boolean =>
  scopes.includes("admin") || scopes.includes(needed);
