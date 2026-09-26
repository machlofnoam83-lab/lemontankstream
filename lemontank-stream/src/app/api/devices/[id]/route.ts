import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { removeDevice, trustDevice } from "@/lib/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idOf = (raw: string) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("BAD_REQUEST", 400);
  return id;
};

/** סימון מכשיר כמהימן / ביטול */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "write" }, async (api) => {
    const body = await api.body<{ trusted?: boolean }>();
    const ok = trustDevice(api.user!.id, idOf(id), body.trusted !== false);
    if (!ok) throw new ApiError("NOT_FOUND", 404);
    return jsonOk({ updated: true }, undefined, req);
  });
}

/** התנתקות ממכשיר — מוחקת גם את ההורדות שלו */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "write" }, async (api) => {
    const removed = removeDevice(api.user!.id, idOf(id));
    if (!removed) throw new ApiError("NOT_FOUND", 404, undefined, "המכשיר לא נמצא");
    return jsonOk({ removed: true }, undefined, req);
  });
}
