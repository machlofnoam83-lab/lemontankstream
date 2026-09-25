import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { run, tx, get } from "@/lib/db";
import { sanitizeText } from "@/lib/validate";
import { revokeAllUserSessions, clearSessionCookies } from "@/lib/session";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  country: z.string().trim().max(60).optional().nullable(),
  avatar_url: z.string().max(500).optional().nullable(),
  marketing_opt_in: z.boolean().optional(),
  mature_allowed: z.boolean().optional(),
  locale: z.enum(["he", "en"]).optional(),
});

/** עדכון הפרופיל האישי של המשתמש המחובר */
export async function PATCH(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const input = patchSchema.parse(await ctx.body<Record<string, unknown>>());
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(sanitizeText(input.name, 60)); }
    if (input.phone !== undefined) { fields.push("phone = ?"); values.push(input.phone ? sanitizeText(input.phone, 30) : null); }
    if (input.country !== undefined) { fields.push("country = ?"); values.push(input.country ? sanitizeText(input.country, 60) : null); }
    if (input.avatar_url !== undefined) { fields.push("avatar_url = ?"); values.push(input.avatar_url); }
    if (input.marketing_opt_in !== undefined) { fields.push("marketing_opt_in = ?"); values.push(input.marketing_opt_in ? 1 : 0); }
    if (input.mature_allowed !== undefined) { fields.push("mature_allowed = ?"); values.push(input.mature_allowed ? 1 : 0); }
    if (input.locale !== undefined) { fields.push("locale = ?"); values.push(input.locale); }

    if (fields.length) run(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, [...values, ctx.user!.id]);
    const updated = get("SELECT id, email, name, phone, country, avatar_url, marketing_opt_in, mature_allowed, locale FROM users WHERE id = ?", [ctx.user!.id]);
    return jsonOk({ user: updated, message: "הפרטים עודכנו" }, undefined, req);
  });
}

/** מחיקת החשבון שלי (זכות נשכח) — דורש מנוי לא פעיל */
export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required", audit: { action: "user.delete", entity: "user", severity: "critical" } }, async (ctx) => {
    const body = await ctx.body<{ confirm?: boolean }>();
    if (!body?.confirm) throw new ApiError("BAD_REQUEST", 400, undefined, "נדרש אישור מפורש למחיקה");

    const activeSub = get<{ id: number }>(
      "SELECT id FROM subscriptions WHERE user_id = ? AND status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      [ctx.user!.id],
    );
    if (activeSub) throw new ApiError("CONFLICT", 409, undefined, "יש לך מנוי פעיל — בטל אותו קודם לכן");

    const userId = ctx.user!.id;
    tx(() => {
      revokeAllUserSessions(userId, "self_delete");
      run(
        `UPDATE users SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status='banned',
           email = 'deleted+' || id || '@lemontank.local', email_norm = 'deleted+' || id || '@lemontank.local',
           name = 'משתמש שנמחק', phone = NULL, twofa_secret = NULL, notes = NULL
         WHERE id = ?`,
        [userId],
      );
      run("UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?", [userId]);
    });

    writeAudit({ action: "user.delete", entity: "user", entityId: userId, severity: "critical", detail: "self-delete (GDPR)" }, { req, actorId: userId, actorEmail: ctx.user!.email });
    await clearSessionCookies();

    return jsonOk({ deleted: true, message: "החשבון נמחק" }, undefined, req);
  });
}
