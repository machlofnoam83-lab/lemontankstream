import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { DEFAULT_FLAGS, getFeatureFlags, toggleFeature } from "@/lib/settings";
import { sanitizeText } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** רשימת כל מתגי הפיצ'רים (flags) עם מצבם */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const flags = getFeatureFlags();
    const isStaffUser = ["editor", "admin", "owner"].includes(ctx.user?.role ?? "");
    return jsonOk(
      {
        flags: Object.entries(flags).map(([key, value]) => ({
          key,
          enabled: value.enabled,
          description: value.description,
          rollout_pct: value.rollout_pct,
          category: key.split("_")[0],
        })),
        total: Object.keys(flags).length,
        defaults: isStaffUser ? DEFAULT_FLAGS : undefined,
      },
      undefined,
      req,
    );
  });
}

/** הפעלה/כיבוי של פיצ'ר (בעלים בלבד) */
export async function PATCH(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", permission: "settings.update", audit: { action: "feature_flag.update", entity: "feature_flag", severity: "warning" } },
    async (ctx) => {
      const body = await ctx.body<{ key?: string; enabled?: boolean; description?: string; rollout_pct?: number }>();
      const key = sanitizeText(body?.key ?? "", 60);
      if (!key || !(key in DEFAULT_FLAGS)) return jsonOk({ flags: getFeatureFlags() }, undefined, req);
      toggleFeature(key, Boolean(body?.enabled), ctx.user!.id, body?.description);
      return jsonOk({ key, enabled: Boolean(body?.enabled), flags: getFeatureFlags() }, undefined, req);
    },
  );
}
