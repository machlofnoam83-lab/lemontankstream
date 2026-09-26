/**
 * מעטפת אחידה לכל Route Handler — כל נקודת קצה עוברת את אותה שרשרת הגנות:
 *
 *   [rate limit] → [CSRF לא-משנה-מצב] → [אימות סשן] → [הרשאה] → [הרצה] → [ביקורת] → [טיפול שגיאות]
 *
 * היתרון: אי אפשר "לשכוח" הגנה בנקודת קצה חדשה. כל handler חדש מקבל את
 * ההגנות כברירת מחדל, וצריך לבקש במפורש משהו אחר.
 */

import type { NextRequest } from "next/server";
import { ApiError, clientIp, jsonError, readJson } from "@/lib/http";
import { RATE_RULES, consumeRateLimit, type RateRuleName } from "@/lib/ratelimit";
import { logSecurityEvent, writeAudit, type AuditAction } from "@/lib/audit";
import { assertCsrf } from "@/lib/csrf";
import { getCurrentSession, type SessionUser } from "@/lib/session";
import { can, type Permission, isAdminRole } from "@/lib/rbac";
import { adminIpAllowed, needs2faSetup, requireStepUp } from "@/lib/fortress";
import { findActiveBan, banIp } from "@/lib/security/bans";
import { inspectUrl, inspectValue, type InspectionHit } from "@/lib/security/inspect";
import { consumeRateLimit as consumeKeyLimit } from "@/lib/ratelimit";
import { keyHasScope, resolveBearer, type ApiScope } from "@/lib/apikeys";
import { get as dbGet } from "@/lib/db";

export type ApiContext = {
  req: NextRequest;
  params: Record<string, string>;
  user: SessionUser | null;
  sessionId: string | null;
  /** כשיש אימות במפתח API — פרטי המפתח (אחרת null) */
  apiKey?: { id: number; scopes: ApiScope[]; name: string } | null;
  /** גוף הבקשה מפוענח (JSON) או undefined */
  body: <T>() => Promise<T>;
  ip: string;
};

export type Handler = (ctx: ApiContext) => Promise<Response> | Response;

export type GuardOptions = {
  /** null = ציבורי (ברירת מחדל) */
  auth?: "required" | "optional";
  permission?: Permission;
  /**
   * הגבלת קצב. **ברירת מחדל: מוגבל** (`api` — 240 לדקה לכל כתובת ולכל נתיב).
   *
   * למה זה הפוך מהאינטואיציה: קודם ההגבלה הייתה אופציונלית, וכל נתיב ששכחו
   * להוסיף לו כלל היה **ללא הגבלה בכלל** — וכך נתיב ציבורי אחד שנשכח הפך
   * למכונת סריקה/הצפה. עכשיו המצב הפוך: מי שרוצה נתיב ללא הגבלה חייב
   * לכתוב `rateLimit: null` במפורש, כלומר זו החלטה מודעת ולא שכחה.
   */
  rateLimit?: RateRuleName | null;
  /** האם לדרוש אימות CSRF בבקשות משנות מצב (true כברירת מחדל) */
  csrf?: boolean;
  audit?: { action: AuditAction; entity?: string; entityId?: string | number; severity?: "info" | "warning" | "critical" };
  /** האם לקרוא ולאמת את גוף הבקשה כ-JSON לפני הקריאה ל-handler */
  parseBody?: boolean;
  maxBodyBytes?: number;
  /** אישור בקשה עם מפתח API (Authorization: Bearer) ולא רק עם עוגיית סשן */
  allowApiKey?: boolean;
  /** ההרשאה הנדרשת מהמפתח — read כברירת מחדל */
  apiKeyScope?: ApiScope;
};

/** מזהה משתמש מתוך פרמטרים (משמש לבאקטים של rate limit) */
function routeKey(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts.slice(-3).join("/");
}

export async function withApi(req: NextRequest, options: GuardOptions, handler: Handler, params: Record<string, string> = {}): Promise<Response> {
  const ip = clientIp(req);
  let sessionId: string | null = null;

  try {
    /* ── 0. חסימת IP — שכבת הגנה כפולה (השער חוסם לפני, וגם כאן) ─────── */
    const activeBan = findActiveBan(ip);
    if (activeBan) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "IP_BANNED", message: "הגישה מהכתובת שלך נחסמה על ידי מערכת האבטחה", reason: activeBan.category },
        }),
        { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store" } },
      );
    }

    /* ── 1. הגבלת קצב ─────────────────────────────────────────────────── */
    // null = הנתיב ביקש במפורש להיות ללא הגבלה; undefined = ברירת המחדל המוגנת.
    if (options.rateLimit !== null) {
      const rule = RATE_RULES[options.rateLimit ?? "api"];
      const res = consumeRateLimit(rule, `${ip}:${routeKey(req)}`);
      if (!res.allowed) {
        await logSecurityEvent({ kind: "rate_limit_exceeded", severity: "warning", ip, detail: `route=${routeKey(req)} rule=${rule.name}` });
        await logSecurityEvent({ kind: "rate_limit", ip, detail: rule.name });
        const error = new Response(
          JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "יותר מדי בקשות — נסה שוב בעוד רגע" } }),
          { status: 429, headers: { "content-type": "application/json", "retry-after": String(res.resetInSec) } },
        );
        return error;
      }
    }

    /* ── 2. סשן או מפתח API ───────────────────────────────────────────── */
    let apiKeyInfo: { id: number; scopes: ApiScope[]; name: string } | null = null;
    let user: SessionUser | null = null;

    if (options.allowApiKey) {
      // מפתח API: אין עוגייה ולכן אין CSRF; המכסה היא של המפתח עצמו
      let resolved = null;
      try {
        resolved = resolveBearer(req.headers.get("authorization"));
      } catch (err) {
        if (err instanceof ApiError) throw err;
      }
      if (resolved) {
        const needed: ApiScope = options.apiKeyScope ?? "read";
        if (!keyHasScope(resolved.scopes, needed)) {
          await logSecurityEvent({ kind: "permission_denied", severity: "warning", ip, userId: resolved.userId, detail: `api_key need=${needed}` });
          throw new ApiError("FORBIDDEN", 403, `למפתח אין הרשאת ${needed}`);
        }
        const bucket = `api_key:${resolved.record.id}`;
        const result = consumeKeyLimit({ name: bucket, limit: resolved.record.rate_limit, windowSec: 60 }, `${ip}`);
        if (!result.allowed) {
          return new Response(
            JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "חרגת ממכסת המפתח — נסה שוב בעוד רגע" } }),
            { status: 429, headers: { "content-type": "application/json", "retry-after": String(result.resetInSec) } },
          );
        }
        const row = dbGet<SessionUser>(
          `SELECT id, email, name, role, status, plan_code, plan_code AS effective_plan, avatar_url,
                  email_verified, twofa_enabled, max_profiles, mature_allowed, locale, created_at
           FROM users WHERE id = ? AND status = 'active' AND deleted_at IS NULL`,
          [resolved.userId],
        );
        if (!row) throw new ApiError("UNAUTHORIZED", 401, "המשתמש של המפתח אינו פעיל");
        user = row;
        apiKeyInfo = { id: resolved.record.id, scopes: resolved.scopes, name: resolved.record.name };
      }
    }

    if (!user) {
      const session = await getCurrentSession();
      sessionId = session?.session.id ?? null;
      user = session?.user ?? null;
    }

    const needsAuth = options.auth === "required";
    const permission = options.permission;

    if (needsAuth || permission) {
      if (!user) throw new ApiError("UNAUTHORIZED", 401);
      if (permission && !can(user.role, permission)) {
        await logSecurityEvent({ kind: "permission_denied", severity: "warning", ip, userId: user.id, detail: `need=${permission} role=${user.role}` });
        writeAudit({ action: "security.permission_denied", entity: "permission", entityId: permission, severity: "warning" }, { req, actorId: user.id, actorEmail: user.email });
        throw new ApiError("FORBIDDEN", 403);
      }
    }

    /* ── 2.5 שער "המבצר": ניהול דורש 2FA, ורשימת היתר לכתובות ───────────── */
    if (user && permission && isAdminRole(user.role)) {
      // מפתח API אינו עובר את שער הניהול — מפתחות מיועדים לקריאה, לא לניהול
      if (!apiKeyInfo) {
        if (needs2faSetup(user)) {
          await logSecurityEvent({ kind: "admin_2fa_missing", severity: "warning", ip, userId: user.id, detail: routeKey(req) });
          throw new ApiError(
            "TWOFA_REQUIRED",
            403,
            { setup: "/account/security" },
            "אזור הניהול דורש אימות דו-שלבי — יש להפעיל אותו בהגדרות האבטחה",
          );
        }
        if (!adminIpAllowed(ip)) {
          await logSecurityEvent({ kind: "admin_ip_blocked", severity: "warning", ip, userId: user.id, detail: routeKey(req) });
          writeAudit({ action: "security.permission_denied", entity: "admin_ip", entityId: ip, severity: "warning" }, { req, actorId: user.id, actorEmail: user.email });
          throw new ApiError("FORBIDDEN", 403, undefined, "הכתובת שלך אינה ברשימת ההיתר של אזור הניהול");
        }
      }
    }

    /* ── 2.6 re-auth מדורג: פעולה הרסנית דורשת אימות סיסמה בחלון קצר ───── */
    if (user && options.audit?.action) {
      requireStepUp(user, sessionId ?? undefined, String(options.audit.action));
    }

    /* ── 3. CSRF לבקשות משנות מצב ─────────────────────────────────────── */
    const csrfEnabled = options.csrf !== false && !apiKeyInfo;
    if (csrfEnabled) {
      if (!user && !["POST"].includes(req.method)) {
        // בקשות GET ציבוריות — אין צורך
      }
      try {
        await assertCsrf(req, sessionId ?? undefined);
      } catch (err) {
        if (err instanceof ApiError) {
          await logSecurityEvent({ kind: "csrf_failed", severity: "warning", ip, userId: user?.id ?? null, detail: `${req.method} ${routeKey(req)}` });
          writeAudit({ action: "security.csrf_failed", severity: "warning" }, { req, actorId: user?.id, actorEmail: user?.email });
        }
        throw err;
      }
    }

    /* ── 3.5 סריקת עומס זדוני בכתובת ובפרמטרים ───────────────────────── */
    const urlHit = inspectUrl(req.url);
    if (urlHit) await rejectMalicious(req, ip, urlHit, user?.id ?? null);

    /* ── 4. גוף הבקשה ────────────────────────────────────────────────── */
    let parsedBody: unknown;
    let bodyRead = false;
    const body = async <T,>(): Promise<T> => {
      if (!bodyRead) {
        parsedBody = await readJson<T>(req, options.maxBodyBytes ?? 256 * 1024);
        bodyRead = true;
        // סריקת הגוף עצמו — כאן תוקפים מנסים להזריק SQL/סקריפט לטופס
        const bodyHit = inspectValue(parsedBody);
        if (bodyHit) await rejectMalicious(req, ip, bodyHit, user?.id ?? null);
      }
      return parsedBody as T;
    };
    if (options.parseBody) await body();

    /* ── 5. הרצת הלוגיקה ─────────────────────────────────────────────── */
    const response = await handler({ req, params, user, sessionId, apiKey: apiKeyInfo, body, ip });

    /* ── 6. ביקורת ────────────────────────────────────────────────────── */
    if (options.audit) {
      writeAudit(
        {
          action: options.audit.action,
          entity: options.audit.entity,
          entityId: options.audit.entityId,
          severity: options.audit.severity ?? "info",
          after: bodyRead ? summarize(parsedBody) : undefined,
        },
        { req, actorId: user?.id ?? null, actorEmail: user?.email ?? null },
      );
    }

    return response;
  } catch (err) {
    return jsonError(err, req);
  }
}

/**
 * דוח על עומס זדוני: רישום, חסימת IP וחסימת הבקשה.
 * זו הנקודה שבה "SQL injection" הופך מניסיון לחסימה בפועל.
 */
async function rejectMalicious(req: NextRequest, ip: string, hit: InspectionHit, userId: number | null): Promise<never> {
  const route = new URL(req.url).pathname;

  await logSecurityEvent({
    kind: `payload_${hit.category}`,
    severity: hit.severity,
    ip,
    userId,
    detail: `${hit.rule} @ ${route} :: ${hit.sample.slice(0, 200)}`,
  });
  writeAudit(
    { action: "security.sqli_attempt", entity: "request", entityId: route, severity: hit.severity, detail: `${hit.rule} (${hit.category})` },
    { req, actorId: userId },
  );

  if (hit.ban) {
    const settings = (await import("@/lib/security/bans")).securitySettings();
    if (settings.autoban !== "off") {
      banIp({
        ip,
        category: hit.category,
        reason: `עומס זדוני בגוף הבקשה: ${hit.rule}`,
        severity: hit.severity,
        path: route,
        method: req.method,
        userAgent: req.headers.get("user-agent"),
        action: hit.rule,
      });
    }
  }

  throw new ApiError("FORBIDDEN", 403, { rule: hit.rule, category: hit.category }, "הבקשה נחסמה על ידי מערכת האבטחה");
}

/** תקציר בטוח של גוף הבקשה ליומן הביקורת — מסתיר סיסמאות וטוקנים */
function summarize(value: unknown): unknown {
  const SENSITIVE = /password|passwd|secret|token|totp|code|api_key|authorization|cookie|credit|card/i;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(summarize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "***" : summarize(v);
  }
  return out;
}

/* ─────────────────────────── עזרי תשובה מהירים ─────────────────────────── */

export type RouteParams<P extends Record<string, string> = Record<string, string>> = { params: Promise<P> };

/** בונה handler עבור Next App Router עם כל ההגנות */
export function route<P extends Record<string, string> = Record<string, string>>(options: GuardOptions, handler: Handler) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    const params = ctx?.params ? await ctx.params : ({} as P);
    return withApi(req, options, handler, { ...params });
  };
}

/** מחזיר 405 לבקשות בשיטה לא נתמכת */
export const methodNotAllowed = (allow: string) =>
  new Response(JSON.stringify({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `השתמש ב-${allow}` } }), {
    status: 405,
    headers: { "content-type": "application/json", allow },
  });
