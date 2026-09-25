import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { safeUrl, sanitizeText } from "@/lib/validate";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name_he: z.string().trim().min(1).max(80),
  number: z.coerce.number().int().min(1).max(999).optional().nullable(),
  logo_url: z.string().max(500).optional().nullable(),
  stream_url: z.string().max(800).optional().nullable(),
  category: z.string().trim().max(40).optional().default("כללי"),
  plan_access: z.enum(["free", "plus"]).optional().default("plus"),
  is_active: z.boolean().optional().default(true),
  sort_order: z.coerce.number().int().min(0).max(999).optional().default(0),
});

/** ערוצי שידור חיים — מסונן לפי מנוי */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const isPlus = ctx.user?.effective_plan === "plus";
    const staff = ["editor", "admin", "owner"].includes(ctx.user?.role ?? "");

    const items = all(
      `SELECT id, number, name_he, logo_url, category, plan_access, is_active, sort_order,
              CASE WHEN ? THEN stream_url ELSE NULL END AS stream_url
       FROM live_channels WHERE is_active = 1 ORDER BY sort_order, number`,
      [staff || isPlus ? 1 : 0],
    );
    return jsonOk({ items, hasPlus: isPlus }, undefined, req);
  });
}

/** הוספת ערוץ (אדמין) */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.create", audit: { action: "live.create", entity: "live_channel" } }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const res = run(
      `INSERT INTO live_channels(number, name_he, logo_url, stream_url, category, plan_access, is_active, sort_order)
       VALUES(?,?,?,?,?,?,?,?)`,
      [input.number ?? null, sanitizeText(input.name_he, 80), safeUrl(input.logo_url), safeUrl(input.stream_url), sanitizeText(input.category ?? "כללי", 40), input.plan_access, input.is_active ? 1 : 0, input.sort_order],
    );
    return jsonOk({ id: Number(res.lastInsertRowid) }, { status: 201 }, req);
  });
}

/** עדכון ערוץ */
export async function PATCH(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.update", audit: { action: "live.update", entity: "live_channel" } }, async (ctx) => {
    const body = await ctx.body<{ id?: number; is_active?: boolean } & Record<string, unknown>>();
    const id = Number(body.id ?? 0);
    if (!get<{ id: number }>("SELECT id FROM live_channels WHERE id = ?", [id])) throw new ApiError("NOT_FOUND", 404);
    const input = schema.partial().parse(body);

    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.name_he !== undefined) { fields.push("name_he = ?"); values.push(sanitizeText(input.name_he, 80)); }
    if (input.stream_url !== undefined) { fields.push("stream_url = ?"); values.push(safeUrl(input.stream_url)); }
    if (input.logo_url !== undefined) { fields.push("logo_url = ?"); values.push(safeUrl(input.logo_url)); }
    if (input.plan_access !== undefined) { fields.push("plan_access = ?"); values.push(input.plan_access); }
    if (input.is_active !== undefined) { fields.push("is_active = ?"); values.push(input.is_active ? 1 : 0); }
    if (input.number !== undefined) { fields.push("number = ?"); values.push(input.number); }

    if (fields.length) run(`UPDATE live_channels SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
    return jsonOk({ id, message: "הערוץ עודכן" }, undefined, req);
  });
}

/** מחיקת ערוץ */
export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.delete", audit: { action: "live.delete", entity: "live_channel", severity: "warning" } }, async (ctx) => {
    const body = await ctx.body<{ id?: number }>();
    run("DELETE FROM live_channels WHERE id = ?", [Number(body?.id ?? 0)]);
    return jsonOk({ deleted: Number(body?.id ?? 0) }, undefined, req);
  });
}
