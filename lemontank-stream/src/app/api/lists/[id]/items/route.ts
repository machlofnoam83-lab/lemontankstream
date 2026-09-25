import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { addItem, listItems, ownedList, removeItem, reorderItems } from "@/lib/lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title_id: z.coerce.number().int().positive().optional(),
  note: z.string().trim().max(200).nullable().optional(),
  action: z.enum(["add", "remove", "note", "reorder"]).default("add"),
  order: z.array(z.coerce.number().int().positive()).max(300).optional(),
});

const idOf = (raw: string): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("BAD_REQUEST", 400);
  return id;
};

/** פריטי הרשימה (מסונן לפי מצב ילדים) */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "api" }, async (api) => {
    const list = ownedList(api.user!.id, idOf(id));
    const { getMaturityCeiling } = await import("@/lib/session");
    return jsonOk({ items: listItems(list.id, { maturityMax: await getMaturityCeiling() }) }, undefined, req);
  });
}

/** הוספה / הסרה / הערה / סידור מחדש */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "write" }, async (api) => {
    const listId = idOf(id);
    const input = bodySchema.parse(await api.body<Record<string, unknown>>());

    if (input.action === "reorder") {
      reorderItems(api.user!.id, listId, input.order ?? []);
      return jsonOk({ reordered: true }, undefined, req);
    }

    if (!input.title_id) throw new ApiError("BAD_REQUEST", 400, undefined, "חסר מזהה כותר");

    if (input.action === "add") {
      const result = addItem(api.user!.id, listId, input.title_id, input.note);
      return jsonOk(result, undefined, req);
    }
    if (input.action === "note") {
      const result = addItem(api.user!.id, listId, input.title_id, input.note);
      return jsonOk(result, undefined, req);
    }

    const removed = removeItem(api.user!.id, listId, input.title_id);
    return jsonOk({ removed }, undefined, req);
  });
}
