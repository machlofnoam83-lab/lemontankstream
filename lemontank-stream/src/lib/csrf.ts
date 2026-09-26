/**
 * הגנת CSRF בשתי שכבות בלתי תלויות:
 *
 *  שכבה 1 — Double Submit עם HMAC:
 *    • השרת מייצר "סוד CSRF" אקראי לכל סשן ושומר אותו ב-DB.
 *    • הדפדפן מקבל טוקן = HMAC(sessionId, csrfSecret) בעוגייה קריאה ל-JS,
 *      וכל בקשה כותבת שולחת אותו בכותרת `x-csrf-token`.
 *    • תוקף מאתר זדוני לא יכול לקרוא את העוגייה (same-origin policy) → לא יכול לזייף.
 *
 *  שכבה 2 — אימות Origin/Referer:
 *    • כל בקשה משנה-מצב חייבת להגיע מ-Origin שמוגדר ב-ALLOWED_ORIGINS/APP_URL
 *      או מ-Host של הבקשה עצמה (תומך בתצוגה המקדימה של הסביבה).
 */

import { cookies } from "next/headers";
import { safeEqual, hmac } from "./crypto";
import { get, run } from "./db";
import { ApiError } from "./http";
import { CSRF_COOKIE } from "./session";

export const CSRF_HEADER = "x-csrf-token";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const isMutating = (method: string): boolean => MUTATING.has(method.toUpperCase());

/** טוקן CSRF עבור סשן נתון — דטרמיניסטי (אותו סשן → אותו טוקן) */
export function csrfTokenFor(sessionId: string, csrfSecret: string): string {
  const secret = process.env.CSRF_SECRET ?? process.env.APP_SECRET ?? "dev-csrf-secret";
  return hmac(`${sessionId}:${csrfSecret}`, secret).slice(0, 64);
}

/** מקבל את הסוד מהמסד לפי מזהה סשן */
export function csrfSecretOf(sessionId: string): string | null {
  const row = get<{ csrf_secret: string }>("SELECT csrf_secret FROM sessions WHERE id=?", [sessionId]);
  return row?.csrf_secret ?? null;
}

/**
 * בונה רשימת מקורות מותרים.
 * תמיד כולל את ה-Host של הבקשה עצמה — כדי שתצוגות מקדימות (preview) יעבדו,
 * מבלי לפתוח דלת למקורות זרים (Origin אחר ≠ Host של הבקשה נדחה).
 */
function allowedOrigins(req: Request): Set<string> {
  const set = new Set<string>();
  const host = req.headers.get("host");
  if (host) {
    set.add(`${req.headers.get("x-forwarded-proto") ?? "https"}://${host}`);
    set.add(`http://${host}`);
    set.add(`https://${host}`);
  }
  if (process.env.APP_URL) {
    try {
      set.add(new URL(process.env.APP_URL).origin);
    } catch {
      /* ignore */
    }
  }
  for (const extra of (process.env.ALLOWED_ORIGINS ?? "").split(",")) {
    const t = extra.trim();
    if (t) {
      try {
        set.add(new URL(t).origin);
      } catch {
        set.add(t);
      }
    }
  }
  return set;
}

/** אימות Origin/Referer — מחזיר true אם הבקשה מגיעה ממקור לגיטימי */
export function isTrustedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const allowed = allowedOrigins(req);

  if (origin) {
    if (origin === "null") return false; // iframe sandbox / data: URLs
    return allowed.has(origin);
  }

  // דפדפנים ותיקים / ניווט טופס — בודקים Referer
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  // ללא Origin וללא Referer: לקוחות API (curl, אפליקציה) — נדרש טוקן CSRF תקין,
  // ולכן לא ניתן לנצל את זה מהדפדפן של קורבן.
  return true;
}

export type CsrfCheck = { ok: boolean; reason?: string };

/** אימות מלא של בקשת API משנה-מצב */
export async function verifyCsrf(req: Request, sessionId?: string): Promise<CsrfCheck> {
  if (!isMutating(req.method)) return { ok: true };

  if (!isTrustedOrigin(req)) return { ok: false, reason: "untrusted_origin" };

  const headerToken = req.headers.get(CSRF_HEADER);
  if (!headerToken) return { ok: false, reason: "missing_csrf_header" };

  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  if (!cookieToken) return { ok: false, reason: "missing_csrf_cookie" };

  // double submit: הטוקן בכותרת חייב להיות זהה לזה שבעוגייה
  if (!safeEqual(headerToken, cookieToken)) return { ok: false, reason: "csrf_mismatch" };

  // אימות חתימה מול הסשן (אם קיים סשן)
  if (sessionId) {
    const secret = csrfSecretOf(sessionId);
    if (!secret) return { ok: false, reason: "no_session" };
    const expected = csrfTokenFor(sessionId, secret);
    if (!safeEqual(headerToken, expected)) return { ok: false, reason: "csrf_signature_invalid" };
  }

  return { ok: true };
}

/** גרסה שמשליכה ApiError — לשימוש נוח ב-route handlers */
export async function assertCsrf(req: Request, sessionId?: string): Promise<void> {
  const check = await verifyCsrf(req, sessionId);
  if (!check.ok) throw new ApiError("FORBIDDEN", 403, { reason: check.reason }, "בקשת אבטחה לא תקינה (CSRF)");
}

/** ניקוי טוקנים שפגו (אחזקה תקופתית) */
export function pruneCsrf(): number {
  return run("UPDATE sessions SET csrf_secret = hex(randomblob(24)) WHERE revoked_at IS NOT NULL").changes;
}
