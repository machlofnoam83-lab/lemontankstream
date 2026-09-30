import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { joinParty, partySnapshot } from "@/lib/party";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** הצטרפות לחדר לפי הקוד שבכתובת */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "write" }, async (api) => {
    joinParty(id.toUpperCase(), api.user!.id);
    const party = partySnapshot(id, api.user!.id);
    return jsonOk({ party, redirect: `/party/${party.id}` }, undefined, req);
  });
}
