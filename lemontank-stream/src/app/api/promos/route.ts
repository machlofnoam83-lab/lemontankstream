import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { promoSchema, sanitizeText, safeUrl } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** באנרים וקמפיינים פעילים (לפי קהל היעד) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const manage = new URL(req.url).searchParams.get("all") === "1" && ["editor", "admin", "owner"].includes(ctx.user?.role ?? "");
    const rows = manage
      ? all("SELECT * FROM promos ORDER BY sort_order, id DESC")
      : all(
          `SELECT id, kind, title, subtitle, image_url, cta_text, cta_url, plan_access, audience, sort_order
           FROM promos WHERE is_active = 1
             AND (starts_at IS NULL OR starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
             AND (ends_at IS NULL OR ends_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
             AND (audience = 'all' OR audience = ?)
           ORDER BY sort_order`,
          [ctx.user?.effective_plan === "plus" ? "plus" : "free"],
        );
    return jsonOk({ items: rows }, undefined, req);
  });
}

/** יצירת קמפיין */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.create", audit: { action: "promo.create", entity: "promo" } }, async (ctx) => {
    const input = promoSchema.parse(await ctx.body<Record<string, unknown>>());
    const res = run(
      `INSERT INTO promos(kind, title, subtitle, image_url, cta_text, cta_url, plan_access, audience, starts_at, ends_at, is_active)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        input.kind,
        sanitizeText(input.title, 120),
        input.subtitle ? sanitizeText(input.subtitle, 300) : null,
        safeUrl(input.image_url),
        input.cta_text ? sanitizeText(input.cta_text, 40) : null,
        safeUrl(input.cta_url),
        input.plan_access?.[0] && input.plan_access[0] === "all" ? "free" : input.plan_access,
        input.audience,
        input.starts_at ?? null,
        input.ends_at ?? null,
        input.is_active ? 1 : 0,
      ],
    );
    return jsonOk({ id: Number(res.lastInsertRowid) }, { status: 201 }, req);
  });
}

/** עדכון / מחיקה של קמפיין */
export async function PATCH(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.update", audit: { action: "promo.update", entity: "promo" } }, async (ctx) => {
    const body = await ctx.body<{ id?: number; is_active?: boolean } & Record<string, unknown>>();
    const id = Number(body.id ?? 0);
    if (!get<{ id: number }>("SELECT id FROM promos WHERE id = ?", [id])) throw new ApiError("NOT_FOUND", 404);
    const input = promoSchema.partial().parse(body);

    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.title !== undefined) { fields.push("title = ?"); values.push(sanitizeText(input.title, 120)); }
    if (input.subtitle !== undefined) { fields.push("subtitle = ?"); values.push(input.subtitle ? sanitizeText(input.subtitle, 300) : null); }
    if (input.image_url !== undefined) { fields.push("image_url = ?"); values.push(safeUrl(input.image_url)); }
    if (input.cta_url !== undefined) { fields.push("cta_url = ?"); values.push(safeUrl(input.cta_url)); }
    if (input.is_active !== undefined) { fields.push("is_active = ?"); values.push(input.is_active ? 1 : 0); }
    if (input.ends_at !== undefined) { fields.push("ends_at = ?"); values.push(input.ends_at); }

    if (fields.length) run(`UPDATE promos SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
    return jsonOk({ id, message: "הקמפיין עודכן" }, undefined, req);
  });
}

export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.delete", audit: { action: "promo.delete", entity: "promo", severity: "warning" } }, async (ctx) => {
    const body = await ctx.body<{ id?: number }>();
    const id = Number(body?.id ?? 0);
    run("DELETE FROM promos WHERE id = ?", [id]);
    return jsonOk({ deleted: id }, undefined, req);
  });
}
