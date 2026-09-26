import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { createParty, myParties } from "@/lib/party";
import { featureForUser } from "@/lib/settings";
import { ApiError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title_id: z.coerce.number().int().positive(),
  episode_id: z.coerce.number().int().positive().nullable().optional(),
  position_sec: z.coerce.number().nonnegative().optional(),
  hours: z.coerce.number().int().min(1).max(24).optional(),
  allow_guests: z.boolean().optional(),
});

/** החדרים הפעילים שלי */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    return jsonOk({ parties: myParties(ctx.user!.id) }, undefined, req);
  });
}

/** פתיחת חדר צפייה משותפת */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", rateLimit: "write", audit: { action: "party.create", entity: "watch_party" } },
    async (ctx) => {
      // מתג הפיצ'ר — אפשר לכבות צפייה משותפת בלי פריסה מחדש
      if (!featureForUser("watch_party", ctx.user!.id)) {
        throw new ApiError("FORBIDDEN", 403, "צפייה משותפת מושבתת כרגע");
      }
      const input = createSchema.parse(await ctx.body<Record<string, unknown>>());
      const party = createParty({
        hostId: ctx.user!.id,
        titleId: input.title_id,
        episodeId: input.episode_id ?? null,
        positionSec: input.position_sec,
        hours: input.hours,
        settings: { allowGuests: input.allow_guests ?? false },
      });
      return jsonOk({ party }, undefined, req);
    },
  );
}
