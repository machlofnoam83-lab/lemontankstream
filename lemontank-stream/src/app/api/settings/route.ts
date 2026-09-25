import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { getSettings, updateSettings, type AppSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** הגדרות המערכת (מנהלים בלבד) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "settings.read" }, async (ctx) => {
    void ctx;
    return jsonOk({ settings: getSettings(true) }, undefined, req);
  });
}

/** עדכון הגדרות — מרוכז, עם ביקורת */
export async function PATCH(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", permission: "settings.update", audit: { action: "settings.update", entity: "settings", severity: "warning" } },
    async (ctx) => {
      const patch = (await ctx.body<Partial<AppSettings>>()) ?? {};
      // סינון: רק מפתחות מוכרים נכתבים (מונע הזרקת מפתחות זרים)
      const settings = updateSettings(patch, ctx.user!.id);
      return jsonOk({ settings, message: "ההגדרות נשמרו" }, undefined, req);
    },
  );
}
