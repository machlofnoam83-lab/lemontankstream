import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { listAudit } from "@/lib/audit";
import { sanitizeText } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** יומן הביקורת — מי עשה מה ומתי (קריאה בלבד, לא ניתן למחוק דרך ה-API) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "audit.read" }, async (ctx) => {
    const sp = new URL(req.url).searchParams;
    const result = listAudit({
      limit: Number(sp.get("limit") ?? 50),
      offset: Number(sp.get("offset") ?? 0),
      action: sanitizeText(sp.get("action") ?? "", 60) || undefined,
      severity: sanitizeText(sp.get("severity") ?? "", 20) || undefined,
      actor: sp.get("actor") ? Number(sp.get("actor")) : undefined,
    });
    return jsonOk(result, undefined, req);
  });
}
