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
import { can, type Permission } from "@/lib/rbac";

export type ApiContext = {
  req: NextRequest;
  params: Record<string, string>;
  user: SessionUser | null;
  sessionId: string | null;
  /** גוף הבקשה מפוענח (JSON) או undefined */
  body: <T>() => Promise<T>;
  ip: string;
};

export type Handler = (ctx: ApiContext) => Promise<Response> | Response;

export type GuardOptions = {
  /** null = ציבורי (ברירת מחדל) */
  auth?: "required" | "optional";
  permission?: Permission;
  /** null = ללא הגבלת קצב */
  rateLimit?: RateRuleName;
  /** האם לדרוש אימות CSRF בבקשות משנות מצב (true כברירת מחדל) */
  csrf?: boolean;
  audit?: { action: AuditAction; entity?: string; entityId?: string | number; severity?: "info" | "warning" | "critical" };
  /** האם לקרוא ולאמת את גוף הבקשה כ-JSON לפני הקריאה ל-handler */
  parseBody?: boolean;
  maxBodyBytes?: number;
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
    /* ── 1. הגבלת קצב ─────────────────────────────────────────────────── */
    if (options.rateLimit) {
      const rule = RATE_RULES[options.rateLimit];
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

    /* ── 2. סשן ───────────────────────────────────────────────────────── */
    const session = await getCurrentSession();
    sessionId = session?.session.id ?? null;
    const user = session?.user ?? null;

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

    /* ── 3. CSRF לבקשות משנות מצב ─────────────────────────────────────── */
    const csrfEnabled = options.csrf !== false;
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

    /* ── 4. גוף הבקשה ────────────────────────────────────────────────── */
    let parsedBody: unknown;
    let bodyRead = false;
    const body = async <T,>(): Promise<T> => {
      if (!bodyRead) {
        parsedBody = await readJson<T>(req, options.maxBodyBytes ?? 256 * 1024);
        bodyRead = true;
      }
      return parsedBody as T;
    };
    if (options.parseBody) await body();

    /* ── 5. הרצת הלוגיקה ─────────────────────────────────────────────── */
    const response = await handler({ req, params, user, sessionId, body, ip });

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
