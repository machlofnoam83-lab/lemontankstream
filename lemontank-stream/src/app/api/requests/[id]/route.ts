import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { toggleVote } from "@/lib/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** הצבעה / ביטול הצבעה ("גם אני רוצה") */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "write" }, async (api) => {
    const requestId = Number(id);
    if (!Number.isInteger(requestId) || requestId <= 0) throw new ApiError("BAD_REQUEST", 400);
    return jsonOk(toggleVote(api.user!.id, requestId), undefined, req);
  });
}
