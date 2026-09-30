import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { count, get } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/me — מי אני לפי המפתח, והסטטיסטיקות שלי */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", allowApiKey: true, apiKeyScope: "read", rateLimit: "api" }, async (ctx) => {
    const user = ctx.user!;
    const stats = {
      watched: count("SELECT COUNT(*) c FROM watch_progress WHERE user_id = ?", [user.id]),
      completed: count("SELECT COUNT(*) c FROM watch_progress WHERE user_id = ? AND completed = 1", [user.id]),
      minutes: Math.round(
        Number(get<{ m: number }>("SELECT COALESCE(SUM(duration_sec)/60,0) m FROM watch_progress WHERE user_id = ?", [user.id])?.m ?? 0),
      ),
      watchlist: count("SELECT COUNT(*) c FROM watchlist WHERE user_id = ? AND kind = 'list'", [user.id]),
      reviews: count("SELECT COUNT(*) c FROM reviews WHERE user_id = ?", [user.id]),
    };
    return jsonOk(
      {
        user: { id: user.id, name: user.name, email: user.email, plan: user.effective_plan, role: user.role },
        stats,
        key: ctx.apiKey ? { name: ctx.apiKey.name, scopes: ctx.apiKey.scopes } : null,
      },
      undefined,
      req,
    );
  });
}
