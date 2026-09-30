import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { clearSessionCookies, revokeAllUserSessions, revokeSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** התנתקות — מבטלת את הסשן הנוכחי (או את כולם אם all=true) */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "optional", audit: { action: "auth.logout", entity: "user" } }, async (ctx) => {
    const body = await ctx.body<{ all?: boolean }>().catch(() => ({ all: false }) as { all?: boolean });

    if (ctx.user) {
      if (body?.all) {
        const revoked = await revokeAllUserSessions(ctx.user.id, "logout_all");
        await clearSessionCookies();
        return jsonOk({ loggedOut: true, revoked }, undefined, req);
      }
      if (ctx.sessionId) await revokeSession(ctx.sessionId, "logout");
    }

    await clearSessionCookies();
    return jsonOk({ loggedOut: true }, undefined, req);
  });
}
