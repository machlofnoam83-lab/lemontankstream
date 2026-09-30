import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { revokeApiKey } from "@/lib/apikeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ביטול מפתח — מיידי, בלי לפגוע בשאר המפתחות */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const keyId = Number(id);
  if (!Number.isInteger(keyId) || keyId <= 0) throw new ApiError("BAD_REQUEST", 400);

  return withApi(
    req,
    { auth: "required", rateLimit: "write", audit: { action: "api_key.revoke", entity: "api_key", entityId: keyId, severity: "warning" } },
    async (api) => {
      const revoked = revokeApiKey(api.user!.id, keyId);
      if (!revoked) throw new ApiError("NOT_FOUND", 404, "המפתח לא נמצא או שכבר בוטל");
      return jsonOk({ revoked: true }, undefined, req);
    },
  );
}
