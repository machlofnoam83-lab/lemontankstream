import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { deleteList, getList, listItems, ownedList, updateList } from "@/lib/lists";
import { getMaturityCeiling } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  is_public: z.boolean().optional(),
  cover_url: z.string().max(500).nullable().optional(),
});

const idOf = (raw: string): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("BAD_REQUEST", 400);
  return id;
};

/** רשימה אחת עם הפריטים שלה */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "api" }, async (api) => {
    const list = ownedList(api.user!.id, idOf(id));
    const ceiling = await getMaturityCeiling();
    return jsonOk({ list, items: listItems(list.id, { maturityMax: ceiling }) }, undefined, req);
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "write" }, async (api) => {
    const input = patchSchema.parse(await api.body<Record<string, unknown>>());
    const list = updateList(api.user!.id, idOf(id), {
      name: input.name,
      description: input.description,
      isPublic: input.is_public,
      coverUrl: input.cover_url,
    });
    return jsonOk({ list }, undefined, req);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "write" }, async (api) => {
    deleteList(api.user!.id, idOf(id));
    return jsonOk({ deleted: idOf(id), remaining: getList(idOf(id)) ? 0 : 1 }, undefined, req);
  });
}
