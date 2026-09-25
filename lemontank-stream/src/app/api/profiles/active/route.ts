import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { get } from "@/lib/db";
import { activeProfile, exitRequiresPin } from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** הפרופיל הפעיל כרגע — לתצוגה בכותרת האתר */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const session = ctx.sessionId
      ? get<{ profile_id: number | null }>("SELECT profile_id FROM sessions WHERE id = ?", [ctx.sessionId])
      : undefined;
    const profile = activeProfile(ctx.user!.id, session?.profile_id ?? null);
    return jsonOk({ profile, exitRequiresPin: exitRequiresPin(profile) }, undefined, req);
  });
}
