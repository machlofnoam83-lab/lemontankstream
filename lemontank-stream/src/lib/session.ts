/**
 * ניהול סשנים — הרשאת גישה מבוססת-עוגייה עם טוקן אטום.
 *
 * מודל האבטחה:
 *  1. בצד השרת נוצר טוקן אקראי 256-bit (CSPRNG) → נשלח לעוגייה httpOnly+SameSite.
 *  2. במסד נשמר רק SHA-256 של הטוקן → גניבת קובץ ה-DB לא מאפשרת התחזות.
 *  3. כל בקשה: חיפוש לפי hash + בדיקת תפוגה/ביטול + הצלבה של IP/UA (דגל "חשד").
 *  4. כל סשן ניתן לביטול מיידי מהשרת (מכשיר אבוד / ניתוק מרחוק).
 *  5. סיבוב טוקן אוטומטי בעלייה (session fixation prevention).
 */

import { cookies } from "next/headers";
import { all, get, run, tx } from "./db";
import { randomId, randomToken, sha256, safeEqual, deviceFingerprint } from "./crypto";
import { clientIp, userAgent, ApiError } from "./http";
import { applyPosture, bindSession, evaluateSession } from "./fortress";
import { logSecurityEvent } from "./audit";

export { SESSION_COOKIE, CSRF_COOKIE } from "./cookies";
import { SESSION_COOKIE, CSRF_COOKIE } from "./cookies";
export const SESSION_TTL_DAYS = 30;
export const SESSION_TTL_REMEMBER_DAYS = 90;

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: "user" | "editor" | "admin" | "owner";
  status: string;
  plan_code: "free" | "plus";
  effective_plan: "free" | "plus";
  avatar_url: string | null;
  email_verified: number;
  twofa_enabled: number;
  max_profiles: number;
  mature_allowed: number;
  locale: string;
  created_at: string;
};

export type SessionRecord = {
  id: string;
  user_id: number;
  profile_id: number | null;
  ip: string | null;
  user_agent: string | null;
  device_label: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ua_hash?: string | null;
  ip_prefix?: string | null;
  absolute_expires_at?: string | null;
  stepup_until?: string | null;
  risk_score?: number | null;
};

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

function describeDevice(ua: string): string {
  const u = ua.toLowerCase();
  const os = u.includes("android") ? "אנדרואיד"
    : u.includes("iphone") || u.includes("ipad") ? "iOS"
    : u.includes("windows") ? "Windows"
    : u.includes("mac os") ? "macOS"
    : u.includes("linux") ? "Linux"
    : "מכשיר לא מזוהה";
  const browser = u.includes("edg/") ? "Edge"
    : u.includes("chrome") ? "Chrome"
    : u.includes("safari") ? "Safari"
    : u.includes("firefox") ? "Firefox"
    : "דפדפן";
  return `${browser} · ${os}`;
}

/** יוצר סשן חדש ומחזיר את הטוקן הגולמי (נכתב לעוגייה ע"י הקורא) */
export function createSession(
  userId: number,
  req: Request,
  opts: { remember?: boolean; profileId?: number | null; trusted?: boolean } = {},
): { token: string; sessionId: string; expiresAt: string; csrfSecret: string } {
  const token = randomToken(32);
  const sessionId = randomId(16);
  const csrfSecret = randomToken(24);
  const ttlDays = opts.remember ? SESSION_TTL_REMEMBER_DAYS : SESSION_TTL_DAYS;
  const expiresAt = iso(ttlDays * 86_400_000);
  const ua = userAgent(req);

  tx(() => {
    run(
      `INSERT INTO sessions(id, user_id, profile_id, token_hash, csrf_secret, ip, user_agent, device_label, is_trusted, expires_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [
        sessionId, userId, opts.profileId ?? null, sha256(token), csrfSecret,
        clientIp(req), ua, describeDevice(ua), opts.trusted ? 1 : 0, expiresAt,
      ],
    );
    run("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_login_ip=?, last_login_ua=? WHERE id=?", [
      clientIp(req), ua, userId,
    ]);
  });

  // ── שכבת "המבצר": קישור הסשן למכשיר ולרשת + פקיעה מוחלטת שאינה מתארכת ──
  // (התפקיד נלקח מהמשתמש כדי שסגל יקבל חלון חיים קצר יותר)
  const role = get<{ role: string }>("SELECT role FROM users WHERE id = ?", [userId])?.role;
  bindSession(sessionId, { ip: clientIp(req), userAgent: ua, role });

  return { token, sessionId, expiresAt, csrfSecret };
}

export type ValidatedSession = { session: SessionRecord; user: SessionUser; suspicious: boolean };

/** מאמת סשן מתוך עוגייה; מחזיר null אם אין/פג תוקף/בוטל */
export function validateSession(rawToken: string | undefined): ValidatedSession | null {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return null;
  const hash = sha256(rawToken);

  const row = get<SessionRecord & { revoked_at: string | null; user_id: number }>(
    `SELECT id, user_id, profile_id, ip, user_agent, device_label, created_at, last_seen_at, expires_at, revoked_at,
            ua_hash, ip_prefix, absolute_expires_at, stepup_until, risk_score
     FROM sessions WHERE token_hash = ?`,
    [hash],
  );
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    run("UPDATE sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revoked_reason='expired' WHERE id=?", [row.id]);
    return null;
  }

  const user = get<SessionUser & { deleted_at: string | null }>(
    `SELECT id, email, name, role, status, plan_code, plan_code AS effective_plan, avatar_url,
            email_verified, twofa_enabled, max_profiles, mature_allowed, locale, created_at, deleted_at
     FROM users WHERE id = ?`,
    [row.user_id],
  );
  if (!user || user.deleted_at) return null;
  if (user.status === "banned" || user.status === "suspended") {
    run("UPDATE sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revoked_reason='user_status' WHERE id=?", [row.id]);
    return null;
  }

  // ── שכבת "המבצר": האם הסשן עדיין שייך לאותו מכשיר ואותה רשת? ──────────────
  const posture = evaluateSession({
    row: {
      ip: row.ip,
      ua_hash: row.ua_hash ?? null,
      ip_prefix: row.ip_prefix ?? null,
      last_seen_at: row.last_seen_at,
      absolute_expires_at: row.absolute_expires_at ?? null,
      stepup_until: row.stepup_until ?? null,
      risk_score: row.risk_score ?? 0,
    },
    now: Date.now(),
    ip: row.ip ?? "",
    userAgent: row.user_agent ?? "",
    role: user.role,
  });

  if (!posture.allow) {
    applyPosture(row.id, posture);
    void logSecurityEvent({
      kind: `session_${posture.posture}`,
      severity: posture.posture === "device_changed" ? "critical" : "info",
      ip: row.ip ?? undefined,
      userId: user.id,
      detail: posture.reason ?? "",
    });
    return null;
  }

  // עדכון "נראה לאחרונה" — לא בכל בקשה (כתיבה מיותרת ל-DB)
  if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000) {
    run("UPDATE sessions SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [row.id]);
    if (posture.posture === "new_network") {
      run("UPDATE sessions SET last_ip = ? WHERE id = ?", [row.ip, row.id]);
    }
  }

  const effective = resolveEffectivePlan(user.id, user.plan_code);
  const { deleted_at: _ignored, ...cleanUser } = user;

  return {
    session: { ...row },
    user: { ...cleanUser, effective_plan: effective },
    suspicious: false,
  };
}

/**
 * מנוי בתוקף: אם קיימת רשומת מנוי — היא הקובעת; אם המנוי פג נחזור אוטומטית ל-free.
 * אדמין יכול להעניק פלוס ידנית (plan_code=plus בלי subscription) וזה תקף.
 */
export function resolveEffectivePlan(userId: number, planCode: string): "free" | "plus" {
  if (planCode !== "plus") return "free";
  const sub = get<{ status: string; current_period_end: string | null; trial_end: string | null }>(
    `SELECT status, current_period_end, trial_end FROM subscriptions
     WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
    [userId],
  );
  if (!sub) return "plus"; // הענקה ידנית ע"י אדמין
  if (sub.status === "active") return "plus";
  if (sub.status === "trialing") {
    const end = sub.trial_end ? new Date(sub.trial_end).getTime() : Infinity;
    return end > Date.now() ? "plus" : "free";
  }
  if (sub.status === "past_due") {
    // חסד של 3 ימים לפני ירידה ל-free
    const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
    return end + 3 * 86_400_000 > Date.now() ? "plus" : "free";
  }
  return "free";
}

/* ────────────────────────── עוגיות (Next 15: async) ─────────────────────── */

function cookieOptions(maxAgeSec: number, secure: boolean) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSec,
  };
}

/** האם לסמן עוגיות Secure. מאחורי HTTPS חובה true. */
export const cookieSecure = (): boolean => {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production" && Boolean(process.env.APP_URL?.startsWith("https"));
};

/** כותב עוגיות סשן + CSRF. נקרא מ-Route Handlers / Server Actions. */
export async function setSessionCookies(token: string, csrfToken: string, remember = false): Promise<void> {
  const store = await cookies();
  const ttl = (remember ? SESSION_TTL_REMEMBER_DAYS : SESSION_TTL_DAYS) * 86_400;
  const secure = cookieSecure();
  store.set(SESSION_COOKIE, token, cookieOptions(ttl, secure));
  // עוגיית CSRF חייבת להיקרא מ-JS לצורך double-submit, ולכן אינה httpOnly
  store.set(CSRF_COOKIE, csrfToken, { ...cookieOptions(ttl, secure), httpOnly: false });
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...cookieOptions(0, cookieSecure()) });
  store.set(CSRF_COOKIE, "", { ...cookieOptions(0, cookieSecure()), httpOnly: false });
}

/* ────────────────────────────── API ציבורי ─────────────────────────────── */

/** מחזיר את המשתמש המחובר או null (לא זורק) */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const validated = validateSession(token);
  return validated?.user ?? null;
}

/** מחזיר סשן מלא (משתמש + מזהה סשן) לצורך CSRF/ביקורת */
export async function getCurrentSession(): Promise<ValidatedSession | null> {
  const store = await cookies();
  return validateSession(store.get(SESSION_COOKIE)?.value);
}

/**
 * הפרופיל הפעיל ("מי צופה?") של המשתמש המחובר.
 * משמש לאכיפת מצב ילדים ולסינון תוכן — בצד השרת בלבד.
 */
export async function getActiveProfile() {
  const validated = await getCurrentSession();
  if (!validated) return null;
  const { activeProfile } = await import("./profiles");
  return activeProfile(validated.user.id, validated.session.profile_id ?? null);
}

/** מגבלת הגיל של הפרופיל הפעיל (undefined = אין הגבלה) */
export async function getMaturityCeiling(): Promise<string | undefined> {
  const { maturityCeiling } = await import("./profiles");
  return maturityCeiling(await getActiveProfile());
}

/** כמו getCurrentUser אבל זורק 401 — לשימוש ב-API */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("UNAUTHORIZED", 401);
  return user;
}

/** מחזיר את הטוקן הגולמי של הסשן (לבדיקות CSRF/סיבוב) */
export async function getRawSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function revokeSession(sessionId: string, reason = "logout"): Promise<void> {
  run("UPDATE sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revoked_reason=? WHERE id=?", [reason, sessionId]);
}

export async function revokeAllUserSessions(userId: number, reason = "logout_all", exceptSessionId?: string): Promise<number> {
  if (exceptSessionId) {
    return run(
      `UPDATE sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revoked_reason=?
       WHERE user_id=? AND revoked_at IS NULL AND id<>?`,
      [reason, userId, exceptSessionId],
    ).changes;
  }
  return run(
    `UPDATE sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revoked_reason=?
     WHERE user_id=? AND revoked_at IS NULL`,
    [reason, userId],
  ).changes;
}

export function listUserSessions(userId: number): SessionRecord[] {
  return all<SessionRecord>(
    `SELECT id, user_id, profile_id, ip, user_agent, device_label, created_at, last_seen_at, expires_at
     FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
     ORDER BY last_seen_at DESC`,
    [userId],
  );
}

/** סיבוב טוקן: מרענן את מזהה הסשן (מונע session fixation) */
export async function rotateSession(oldSessionId: string, req: Request): Promise<{ token: string } | null> {
  const row = get<{ user_id: number; profile_id: number | null }>("SELECT user_id, profile_id FROM sessions WHERE id=?", [oldSessionId]);
  if (!row) return null;
  const fresh = createSession(row.user_id, req, { profileId: row.profile_id });
  await revokeSession(oldSessionId, "rotated");
  return { token: fresh.token };
}

/** ניקוי סשנים שפגו — ניתן להריץ מ-cron */
export function pruneSessions(): number {
  return run(
    `DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 day')
       OR (revoked_at IS NOT NULL AND revoked_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 day'))`,
  ).changes;
}

export { safeEqual, deviceFingerprint };
