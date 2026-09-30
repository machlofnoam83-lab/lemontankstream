import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { sanitizeText } from "@/lib/validate";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().trim().min(3).max(40).transform((v) => v.toUpperCase()),
  kind: z.enum(["percent", "fixed", "days"]).default("percent"),
  value: z.coerce.number().min(0).max(100_000),
  plan_code: z.enum(["free", "plus"]).optional().nullable(),
  max_uses: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  per_user: z.coerce.number().int().min(1).max(10).optional().default(1),
  expires_at: z.string().max(40).optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

/** רשימת קופונים (מנהלים) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "billing.read" }, async (ctx) => {
    const items = all(
      `SELECT c.id, c.code, c.kind, c.value, c.plan_code, c.max_uses, c.uses, c.per_user, c.starts_at, c.expires_at, c.is_active,
              (SELECT COUNT(*) FROM coupon_redemptions cr WHERE cr.coupon_id = c.id) AS redemptions
       FROM coupons c ORDER BY c.id DESC LIMIT 200`,
    );
    void ctx;
    return jsonOk({ items }, undefined, req);
  });
}

/** יצירת קופון */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "billing.manage", audit: { action: "coupon.create", entity: "coupon" } }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    if (get<{ id: number }>("SELECT id FROM coupons WHERE code = ?", [input.code])) {
      throw new ApiError("CONFLICT", 409, undefined, "קוד הקופון כבר קיים");
    }

    const res = run(
      `INSERT INTO coupons(code, kind, value, plan_code, max_uses, per_user, expires_at, is_active)
       VALUES(?,?,?,?,?,?,?,?)`,
      [input.code, input.kind, input.value, input.plan_code ?? null, input.max_uses, input.per_user, input.expires_at ?? null, input.is_active ? 1 : 0],
    );
    return jsonOk({ id: Number(res.lastInsertRowid), code: input.code }, { status: 201 }, req);
  });
}

/** עדכון / השבתת קופון */
export async function PATCH(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "billing.manage", audit: { action: "coupon.create", entity: "coupon" } }, async (ctx) => {
    const body = await ctx.body<{ id?: number; is_active?: boolean; value?: number; max_uses?: number; expires_at?: string | null }>();
    const id = Number(body?.id ?? 0);
    if (!get<{ id: number }>("SELECT id FROM coupons WHERE id = ?", [id])) throw new ApiError("NOT_FOUND", 404);

    const fields: string[] = [];
    const values: unknown[] = [];
    if (body?.is_active !== undefined) { fields.push("is_active = ?"); values.push(body.is_active ? 1 : 0); }
    if (body?.value !== undefined) { fields.push("value = ?"); values.push(Number(body.value)); }
    if (body?.max_uses !== undefined) { fields.push("max_uses = ?"); values.push(Number(body.max_uses)); }
    if (body?.expires_at !== undefined) { fields.push("expires_at = ?"); values.push(body.expires_at ? sanitizeText(body.expires_at, 40) : null); }

    if (fields.length) run(`UPDATE coupons SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
    return jsonOk({ id, message: "הקופון עודכן" }, undefined, req);
  });
}

/** מחיקת קופון */
export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "billing.manage", audit: { action: "coupon.delete", entity: "coupon", severity: "warning" } }, async (ctx) => {
    const body = await ctx.body<{ id?: number }>();
    run("DELETE FROM coupons WHERE id = ?", [Number(body?.id ?? 0)]);
    return jsonOk({ deleted: Number(body?.id ?? 0) }, undefined, req);
  });
}
