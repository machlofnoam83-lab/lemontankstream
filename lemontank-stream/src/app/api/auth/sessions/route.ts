import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { listUserSessions, revokeAllUserSessions, revokeSession } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** רשימת המכשירים המחוברים לחשבון */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const sessions = listUserSessions(ctx.user!.id).map((s) => ({
      ...s,
      isCurrent: s.id === ctx.sessionId,
    }));
    return jsonOk({ sessions, current: ctx.sessionId }, undefined, req);
  });
}

/** ניתוק מכשיר מסוים, או כולם (פרטించוב?) */
export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required", audit: { action: "auth.session_revoke", entity: "session", severity: "warning" } }, async (ctx) => {
    const body = await ctx.body<{ id?: string; all?: boolean }>().catch(() => ({}) as { id?: string; all?: boolean });

    if (body?.all) {
      const revoked = await revokeAllUserSessions(ctx.user!.id, "user_revoke_all", ctx.sessionId ?? undefined);
      return jsonOk({ revoked, message: `נותקו ${revoked} מכשירים` }, undefined, req);
    }

    if (body?.id) {
      const sessions = listUserSessions(ctx.user!.id);
      const target = sessions.find((s) => s.id === body.id);
      if (!target) throw new ApiError("NOT_FOUND", 404, undefined, "המכשיר לא נמצא");
      await revokeSession(target.id, "user_revoke");
      writeAudit({ action: "auth.session_revoke", entity: "session", entityId: target.id }, { req, actorId: ctx.user!.id, actorEmail: ctx.user!.email });
      return jsonOk({ revoked: 1, message: "המכשיר נותק" }, undefined, req);
    }

    throw new ApiError("BAD_REQUEST", 400, undefined, "צריך לציין מזהה מכשיר");
  });
}
