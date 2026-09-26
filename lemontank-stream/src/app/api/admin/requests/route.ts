import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { listRequests, requestStats, resolveRequest } from "@/lib/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["open", "planned", "added", "declined"]),
  admin_note: z.string().trim().max(300).nullable().optional(),
  title_id: z.coerce.number().int().positive().nullable().optional(),
});

/** בקשות תוכן — מבט אדמין */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.update", rateLimit: "api" }, async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all";
    return jsonOk({ requests: listRequests({ status, limit: 100 }), stats: requestStats() }, undefined, req);
  });
}

/** עדכון סטטוס בקשה — "נוסף" שולח התראה לכל המצביעים */
export async function PATCH(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", permission: "content.update", rateLimit: "write" },
    async (ctx) => {  // editor ומעלה — ניהול בקשות תוכן
      const input = patchSchema.parse(await ctx.body<Record<string, unknown>>());
      const request = resolveRequest({
        id: input.id,
        status: input.status,
        adminNote: input.admin_note ?? null,
        titleId: input.title_id ?? null,
        adminId: ctx.user!.id,
      });
      return jsonOk({ request }, undefined, req);
    },
  );
}

export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.update", rateLimit: "write" }, async () => {
    throw new ApiError("BAD_REQUEST", 400, undefined, "בקשות תוכן לא נמחקות — אפשר לסמן כ'נדחה' או 'נוסף'");
  });
}
