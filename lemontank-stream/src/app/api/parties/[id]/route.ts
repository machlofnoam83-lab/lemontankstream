import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { leaveParty, partySnapshot, updatePartyState } from "@/lib/party";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  position_sec: z.coerce.number().nonnegative().optional(),
  is_playing: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** מצב החדר — לחברים בלבד. הנגן קורא לזה כל כמה שניות כדי להישאר מסונכרן. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "api" }, async (api) => {
    return jsonOk({ party: partySnapshot(id, api.user!.id) }, undefined, req);
  });
}

/** עדכון מיקום/נגינה — המארח בלבד (נאכף בשרת) */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "write" }, async (api) => {
    const input = patchSchema.parse(await api.body<Record<string, unknown>>());
    const party = updatePartyState(id, api.user!.id, input);
    return jsonOk({ party }, undefined, req);
  });
}

/** עזיבת החדר (המארח שעוזב סוגר אותו לכולם) */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return withApi(req, { auth: "required", rateLimit: "write" }, async (api) => {
    leaveParty(id.toUpperCase(), api.user!.id);
    return jsonOk({ left: true }, undefined, req);
  });
}
