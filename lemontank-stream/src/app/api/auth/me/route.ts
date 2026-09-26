import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { all } from "@/lib/db";
import { resolveEffectivePlan } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** פרטי המשתמש המחובר + פרופילים + התראות שלא נקראו */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    if (!ctx.user) return jsonOk({ user: null, profiles: [], unreadNotifications: 0 }, undefined, req);

    const profiles = all<{ id: number; name: string; is_kid: number; color: string; avatar_url: string | null; maturity_limit: string }>(
      "SELECT id, name, is_kid, color, avatar_url, maturity_limit FROM profiles WHERE user_id = ? ORDER BY sort_order, id",
      [ctx.user.id],
    );

    const unread = all<{ c: number }>("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL", [ctx.user.id])[0]?.c ?? 0;

    return jsonOk(
      {
        user: { ...ctx.user, effective_plan: resolveEffectivePlan(ctx.user.id, ctx.user.plan_code) },
        profiles,
        unreadNotifications: Number(unread),
      },
      undefined,
      req,
    );
  });
}
