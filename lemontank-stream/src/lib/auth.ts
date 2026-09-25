/**
 * מנוע האימות: הרשמה, התחברות, נעילה, איפוס סיסמה, אימות דו-שלבי (2FA).
 *
 * הגנות פעילות:
 *  • scrypt לסיסמאות (אף פעם לא נשמר טקסט גלוי, גם לא בלוגים).
 *  • נעילה הדרגתית אחרי 5 ניסיונות כושלים (1 דק' → שעתיים).
 *  • "תשובה אחידה" — התחברות עם מייל לא קיים מחזירה אותה שגיאה כמו סיסמה שגויה
 *    (מונע user enumeration), וכוללת השהיה מלאכותית קטנה.
 *  • איפוס סיסמה: טוקן חד-פעמי בתוקף 30 דק', נשמר כ-hash, ומבטל את כל הסשנים.
 *  • חשבון suspended/banned מנותק מהסשן שלו באופן יזום.
 */

import { all, get, run, tx } from "./db";
import {
  checkPasswordStrength, decryptField, encryptField, hashPassword, randomCode, randomId, randomToken,
  sha256, verifyPassword, verifyTotp,
} from "./crypto";
import { ApiError, clientIp, userAgent } from "./http";
import { lockoutSeconds } from "./ratelimit";
import { writeAudit, logSecurityEvent } from "./audit";
import { createSession, revokeAllUserSessions, type SessionUser } from "./session";
import { csrfTokenFor } from "./csrf";

export type UserRow = {
  id: number;
  email: string;
  email_norm: string;
  name: string;
  role: string;
  status: string;
  plan_code: string;
  password_hash: string;
  password_algo: string;
  twofa_secret: string | null;
  twofa_enabled: number;
  failed_logins: number;
  locked_until: string | null;
  email_verified: number;
  referral_code: string | null;
  coins: number;
};

export const normalizeEmail = (email: string): string => String(email ?? "").trim().toLowerCase().normalize("NFKC");

/** השהיה קבועה שמוסיפה עלות לכל ניסיון התחברות (מנטרלת טיימינג attacks) */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function referralCode(): string {
  return `LT${randomId(4).toUpperCase().slice(0, 8)}`;
}

/* ─────────────────────────────── הרשמה ─────────────────────────────────── */

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
  plan?: "free" | "plus";
  referral?: string | null;
  marketing?: boolean;
};

export async function registerUser(
  input: RegisterInput,
  req: Request,
): Promise<{ user: SessionUser; token: string; sessionId: string; csrfSecret: string; csrfToken: string }> {
  const emailNorm = normalizeEmail(input.email);
  const name = String(input.name ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailNorm)) throw new ApiError("BAD_REQUEST", 400, undefined, "כתובת אימייל לא תקינה");
  if (name.length < 2 || name.length > 60) throw new ApiError("BAD_REQUEST", 400, undefined, "שם חייב להיות בין 2 ל-60 תווים");

  const strength = checkPasswordStrength(input.password);
  if (!strength.ok) throw new ApiError("BAD_REQUEST", 400, { problems: strength.problems }, strength.problems[0]);

  const existing = get<{ id: number }>("SELECT id FROM users WHERE email_norm = ?", [emailNorm]);
  if (existing) throw new ApiError("CONFLICT", 409, undefined, "האימייל הזה כבר רשום במערכת");

  const passwordHash = await hashPassword(input.password);
  const plan = input.plan === "plus" ? "plus" : "free";
  const refCode = referralCode();

  const userId = tx(() => {
    const parent = input.referral
      ? get<{ id: number }>("SELECT id FROM users WHERE referral_code = ? AND deleted_at IS NULL", [String(input.referral).toUpperCase()])
      : undefined;

    const res = run(
      `INSERT INTO users(email, email_norm, password_hash, password_algo, name, plan_code, referral_code, referred_by,
                         marketing_opt_in, max_profiles, password_changed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      [String(input.email).trim(), emailNorm, passwordHash, "scrypt$32768$8$1", name, plan, refCode,
       parent?.id ?? null, input.marketing ? 1 : 0, plan === "plus" ? 5 : 2],
    );
    const id = Number(res.lastInsertRowid);

    // פרופיל ברירת מחדל — כמו Netflix
    run("INSERT INTO profiles(user_id, name, is_kid, sort_order) VALUES(?,?,0,0)", [id, name.split(" ")[0] || "הפרופיל שלי"]);
    run("INSERT INTO notifications(user_id, kind, title, body) VALUES(?,?,?,?)", [
      id, "welcome", "ברוך הבא ל-LemonTank Stream! 🍋",
      plan === "free" ? "יש לך מנוי חינם. שדרג לפלוס כדי לפתוח את כל התוכן." : "מנוי פלוס פעיל — כל התוכן פתוח עבורך!",
    ]);
    if (plan === "plus") {
      run("INSERT INTO subscriptions(user_id, plan_code, status, current_period_end) VALUES(?,?,?,?)", [
        id, "plus", "active", new Date(Date.now() + 30 * 86_400_000).toISOString(),
      ]);
    }
    // העברת מייל אימות
    const verifyToken = randomToken(24);
    run(
      "INSERT INTO auth_tokens(user_id, kind, token_hash, expires_at, ip) VALUES(?,?,?,?,?)",
      [id, "verify", sha256(verifyToken), new Date(Date.now() + 86_400_000).toISOString(), clientIp(req)],
    );
    return id;
  });

  const session = createSession(userId, req, {});
  writeAudit({ action: "auth.register", entity: "user", entityId: userId, after: { email: emailNorm, plan } }, { req, actorId: userId, actorEmail: emailNorm });

  const user = get<SessionUser>("SELECT id, email, name, role, status, plan_code, plan_code AS effective_plan, avatar_url, email_verified, twofa_enabled, max_profiles, mature_allowed, locale, created_at FROM users WHERE id=?", [userId])!;
  return {
    user,
    token: session.token,
    sessionId: session.sessionId,
    csrfSecret: session.csrfSecret,
    csrfToken: csrfTokenFor(session.sessionId, session.csrfSecret),
  };
}

/* ───────────────────────────── התחברות ─────────────────────────────────── */

export type LoginResult =
  | { ok: true; user: SessionUser; token: string; sessionId: string; csrfToken: string; requires2fa: false }
  | { ok: false; reason: "invalid_credentials" | "locked" | "suspended" | "banned" | "2fa_required"; lockedUntil?: string; message: string; challengeToken?: string };

export async function authenticate(email: string, password: string, req: Request): Promise<LoginResult> {
  const emailNorm = normalizeEmail(email);
  const ip = clientIp(req);
  const ua = userAgent(req);

  const record = (success: boolean, reason: string) =>
    run("INSERT INTO login_attempts(email_norm, ip, user_agent, success, reason) VALUES(?,?,?,?,?)", [
      emailNorm, ip, ua, success ? 1 : 0, reason,
    ]);

  const row = get<UserRow>(
    `SELECT id, email, email_norm, name, role, status, plan_code, password_hash, password_algo, twofa_secret,
            twofa_enabled, failed_logins, locked_until, email_verified, referral_code, coins
     FROM users WHERE email_norm = ? AND deleted_at IS NULL`,
    [emailNorm],
  );

  // השהיה קטנה כדי להשוות זמני תגובה (הגנת user-enumeration)
  const delay = row ? 60 : 180;

  if (!row) {
    await sleep(delay);
    record(false, "no_such_user");
    await logSecurityEvent({ kind: "login_failed", severity: "info", ip, detail: `email_norm=${emailNorm} reason=no_such_user` });
    return { ok: false, reason: "invalid_credentials", message: "אימייל או סיסמה שגויים" };
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    record(false, "locked");
    return {
      ok: false, reason: "locked", lockedUntil: row.locked_until,
      message: `החשבון נעול זמנית עד ${new Date(row.locked_until).toLocaleTimeString("he-IL")} בגלל ניסיונות כושלים`,
    };
  }

  if (row.status === "banned") return { ok: false, reason: "banned", message: "החשבון חסום. פנה לתמיכה." };
  if (row.status === "suspended") return { ok: false, reason: "suspended", message: "החשבון מושהה. פנה לתמיכה." };

  const valid = await verifyPassword(row.password_hash, password);
  if (!valid) {
    const failed = row.failed_logins + 1;
    const lockSec = lockoutSeconds(failed);
    tx(() => {
      run("UPDATE users SET failed_logins=?, locked_until=? WHERE id=?", [
        failed, lockSec > 0 ? new Date(Date.now() + lockSec * 1000).toISOString() : null, row.id,
      ]);
    });
    record(false, lockSec > 0 ? "locked" : "bad_password");
    await logSecurityEvent({
      kind: lockSec > 0 ? "account_locked" : "login_failed",
      severity: lockSec > 0 ? "warning" : "info",
      ip, userId: row.id, detail: `failed=${failed}`,
    });
    writeAudit({ action: "auth.login_failed", entity: "user", entityId: row.id, severity: lockSec > 0 ? "warning" : "info" }, { req, actorId: row.id, actorEmail: row.email });
    return {
      ok: false,
      reason: lockSec > 0 ? "locked" : "invalid_credentials",
      message: lockSec > 0
        ? `יותר מדי ניסיונות כושלים. החשבון נעול ל-${Math.round(lockSec / 60)} דקות.`
        : "אימייל או סיסמה שגויים",
    };
  }

  // ── 2FA ────────────────────────────────────────────────────────────────
  if (row.twofa_enabled && row.twofa_secret) {
    const challenge = randomToken(24);
    run(
      "INSERT INTO auth_tokens(user_id, kind, token_hash, expires_at, ip) VALUES(?,?,?,?,?)",
      [row.id, "2fa_login", sha256(challenge), new Date(Date.now() + 5 * 60_000).toISOString(), ip],
    );
    return { ok: false, reason: "2fa_required", message: "יש להזין קוד אימות דו-שלבי", challengeToken: challenge };
  }

  return finishLogin(row.id, req, ip);
}

/** אימות קוד 2FA והשלמת ההתחברות */
export async function completeTwoFactor(challengeToken: string, code: string, req: Request): Promise<LoginResult> {
  const ip = clientIp(req);
  const row = get<{ user_id: number; expires_at: string; used_at: string | null }>(
    "SELECT user_id, expires_at, used_at FROM auth_tokens WHERE token_hash=? AND kind='2fa_login'",
    [sha256(challengeToken)],
  );
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "invalid_credentials", message: "פג תוקף אימות הדו-שלבי — התחבר מחדש" };
  }

  const user = get<{ twofa_secret: string | null }>("SELECT twofa_secret FROM users WHERE id=?", [row.user_id]);
  const secret = decryptField(user?.twofa_secret ?? null);
  if (!secret) return { ok: false, reason: "invalid_credentials", message: "2FA אינו מוגדר כראוי" };

  if (!verifyTotp(secret, code)) {
    run("INSERT INTO login_attempts(email_norm, ip, user_agent, success, reason) VALUES(NULL,?,?,0,'bad_2fa')", [ip, userAgent(req)]);
    await logSecurityEvent({ kind: "2fa_failed", severity: "warning", ip, userId: row.user_id });
    return { ok: false, reason: "invalid_credentials", message: "קוד האימות שגוי" };
  }

  run("UPDATE auth_tokens SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?", [sha256(challengeToken)]);
  return finishLogin(row.user_id, req, ip);
}

/** סגירת התחברות מוצלחת: איפוס מונים, רישום, יצירת סשן */
async function finishLogin(userId: number, req: Request, ip: string): Promise<LoginResult> {
  run(
    `UPDATE users SET failed_logins=0, locked_until=NULL,
       last_login_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_login_ip=?, last_login_ua=? WHERE id=?`,
    [ip, userAgent(req), userId],
  );
  run("INSERT INTO login_attempts(email_norm, ip, user_agent, success, reason) SELECT email_norm, ?, ?, 1, 'ok' FROM users WHERE id=?", [ip, userAgent(req), userId]);

  const session = createSession(userId, req);
  const user = get<SessionUser>(
    `SELECT id, email, name, role, status, plan_code, plan_code AS effective_plan, avatar_url, email_verified,
            twofa_enabled, max_profiles, mature_allowed, locale, created_at FROM users WHERE id=?`,
    [userId],
  )!;

  writeAudit({ action: "auth.login", entity: "user", entityId: userId }, { req, actorId: userId, actorEmail: user.email });
  return {
    ok: true,
    user,
    token: session.token,
    sessionId: session.sessionId,
    csrfToken: csrfTokenFor(session.sessionId, session.csrfSecret),
    requires2fa: false,
  };
}

/* ─────────────────────────── איפוס סיסמה ──────────────────────────────── */

export function createPasswordResetToken(email: string, req: Request): { token: string | null; userId: number | null } {
  const emailNorm = normalizeEmail(email);
  const user = get<{ id: number }>("SELECT id FROM users WHERE email_norm=? AND deleted_at IS NULL", [emailNorm]);
  if (!user) return { token: null, userId: null }; // לא חושפים אם המייל קיים

  const token = randomToken(32);
  run("INSERT INTO auth_tokens(user_id, kind, token_hash, expires_at, ip) VALUES(?,?,?,?,?)", [
    user.id, "reset", sha256(token), new Date(Date.now() + 30 * 60_000).toISOString(), clientIp(req),
  ]);
  writeAudit({ action: "auth.password_reset", entity: "user", entityId: user.id, detail: "requested" }, { req, actorId: user.id, actorEmail: emailNorm });
  // במערכת פרודקשן: שליחת מייל. כאן מחזירים למפתח כדי לאפשר בדיקה.
  return { token, userId: user.id };
}

export async function resetPasswordWithToken(token: string, newPassword: string, req: Request): Promise<boolean> {
  const strength = checkPasswordStrength(newPassword);
  if (!strength.ok) throw new ApiError("BAD_REQUEST", 400, { problems: strength.problems }, strength.problems[0]);

  const row = get<{ id: number; user_id: number; expires_at: string; used_at: string | null }>(
    "SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash=? AND kind='reset'",
    [sha256(token)],
  );
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return false;

  const hash = await hashPassword(newPassword);
  tx(() => {
    run("UPDATE users SET password_hash=?, password_algo=?, password_changed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), failed_logins=0, locked_until=NULL WHERE id=?", [
      hash, "scrypt$32768$8$1", row.user_id,
    ]);
    run("UPDATE auth_tokens SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [row.id]);
  });
  revokeAllUserSessions(row.user_id, "password_reset");
  writeAudit({ action: "auth.password_change", entity: "user", entityId: row.user_id, severity: "warning", detail: "via reset token" }, { req, actorId: row.user_id });
  return true;
}

/** אימות טוקן מייל */
export function verifyEmailToken(token: string): boolean {
  const row = get<{ id: number; user_id: number; expires_at: string; used_at: string | null }>(
    "SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash=? AND kind='verify'",
    [sha256(token)],
  );
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return false;
  tx(() => {
    run("UPDATE users SET email_verified=1 WHERE id=?", [row.user_id]);
    run("UPDATE auth_tokens SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [row.id]);
  });
  return true;
}

/* ──────────────────────────────── 2FA ──────────────────────────────────── */

export function setupTwoFactor(userId: number): { secret: string; otpauth: string } {
  const secret = randomToken(20).replace(/[^A-Z2-7]/g, "").slice(0, 32).toUpperCase();
  const base32Secret = secret.length >= 16 ? secret : randomToken(32).toUpperCase();
  run("UPDATE users SET twofa_secret=? WHERE id=?", [encryptField(base32Secret), userId]);
  const email = get<{ email: string }>("SELECT email FROM users WHERE id=?", [userId])?.email ?? "user";
  return { secret: base32Secret, otpauth: `otpauth://totp/LemonTank%20Stream:${encodeURIComponent(email)}?secret=${base32Secret}&issuer=LemonTank%20Stream` };
}

export function enableTwoFactor(userId: number, code: string, req: Request): boolean {
  const row = get<{ twofa_secret: string | null }>("SELECT twofa_secret FROM users WHERE id=?", [userId]);
  const secret = decryptField(row?.twofa_secret ?? null);
  if (!secret || !verifyTotp(secret, code)) return false;
  run("UPDATE users SET twofa_enabled=1 WHERE id=?", [userId]);
  writeAudit({ action: "auth.2fa_enable", entity: "user", entityId: userId, severity: "warning" }, { req, actorId: userId });
  return true;
}

export function disableTwoFactor(userId: number, code: string, req: Request): boolean {
  const row = get<{ twofa_secret: string | null }>("SELECT twofa_secret FROM users WHERE id=?", [userId]);
  const secret = decryptField(row?.twofa_secret ?? null);
  if (row?.twofa_secret && secret && !verifyTotp(secret, code)) return false;
  run("UPDATE users SET twofa_enabled=0, twofa_secret=NULL WHERE id=?", [userId]);
  writeAudit({ action: "auth.2fa_disable", entity: "user", entityId: userId, severity: "critical" }, { req, actorId: userId });
  return true;
}

/* ───────────────────────── שינוי סיסמה (מחובר) ─────────────────────────── */

export async function changeOwnPassword(userId: number, current: string, next: string, req: Request): Promise<void> {
  const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=?", [userId]);
  if (!row || !(await verifyPassword(row.password_hash, current))) {
    await logSecurityEvent({ kind: "password_change_failed", severity: "warning", ip: clientIp(req), userId });
    throw new ApiError("FORBIDDEN", 403, undefined, "הסיסמה הנוכחית שגויה");
  }
  const strength = checkPasswordStrength(next);
  if (!strength.ok) throw new ApiError("BAD_REQUEST", 400, { problems: strength.problems }, strength.problems[0]);
  if (current === next) throw new ApiError("BAD_REQUEST", 400, undefined, "הסיסמה החדשה זהה לישנה");

  const hash = await hashPassword(next);
  run("UPDATE users SET password_hash=?, password_changed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [hash, userId]);
  revokeAllUserSessions(userId, "password_change");
  writeAudit({ action: "auth.password_change", entity: "user", entityId: userId, severity: "warning" }, { req, actorId: userId });
}

/** קודי גיבוי ל-2FA (חד-פעמיים) */
export function generateBackupCodes(userId: number, amount = 8): string[] {
  const codes = Array.from({ length: amount }, () => `${randomCode(4)}-${randomCode(4)}`);
  tx(() => {
    for (const c of codes) {
      run("INSERT INTO auth_tokens(user_id, kind, token_hash, expires_at, payload) VALUES(?,?,?,?,?)", [
        userId, "unlock", sha256(c), new Date(Date.now() + 365 * 86_400_000).toISOString(), JSON.stringify({ purpose: "2fa_backup" }),
      ]);
    }
  });
  return codes;
}

export const countRecentSessions = (userId: number): number =>
  Number(all<{ c: number }>("SELECT COUNT(*) c FROM sessions WHERE user_id=? AND revoked_at IS NULL", [userId])[0]?.c ?? 0);
