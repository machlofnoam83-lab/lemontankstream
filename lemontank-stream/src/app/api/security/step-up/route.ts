import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { get } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { grantStepUp, policyFor, stepUpActive } from "@/lib/fortress";
import { logSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string().min(1).max(200),
  /** הפעולה שמבקשים לאשר — נרשמת ביומן כדי שיהיה תיעוד של "מה אושר" */
  action: z.string().max(80).optional(),
});

/**
 * אימות מחדש (step-up) לפני פעולה רגישה.
 *
 * למה זה קיים: גם אם עוגיית סשן נגנבה, התוקף עדיין לא יכול למחוק משתמשים,
 * לשנות הרשאות או לגבות את המסד — בלי הסיסמה עצמה.
 *
 * החלון קצר (15 דקות כברירת מחדל) ומתחדש בכל אימות מוצלח.
 */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "pinAttempt" }, async (ctx) => {
    if (!ctx.sessionId) throw new ApiError("UNAUTHORIZED", 401);

    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [ctx.user!.id]);
    if (!row) throw new ApiError("UNAUTHORIZED", 401);

    const ok = await verifyPassword(row.password_hash, input.password);
    if (!ok) {
      await logSecurityEvent({
        kind: "stepup_failed",
        severity: "warning",
        userId: ctx.user!.id,
        detail: input.action ? `action=${input.action}` : "פעולה רגישה",
      });
      throw new ApiError("STEPUP_INVALID", 401, undefined, "סיסמה שגויה");
    }

    const until = grantStepUp(ctx.sessionId, ctx.user!.role);
    await logSecurityEvent({
      kind: "stepup_granted",
      severity: "info",
      userId: ctx.user!.id,
      detail: input.action ? `action=${input.action}` : "פעולה רגישה",
    });

    return jsonOk(
      {
        approved: true,
        until,
        windowMinutes: policyFor(ctx.user!.role).stepupMinutes,
        sessionPolicy: policyFor(ctx.user!.role),
      },
      undefined,
      req,
    );
  });
}

/** בדיקת מצב החלון — בלי לחשוף דבר מעבר לכן/לא */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    const active = ctx.sessionId ? stepUpActive(ctx.sessionId) : false;
    return jsonOk({ active, windowMinutes: policyFor(ctx.user!.role).stepupMinutes }, undefined, req);
  });
}
