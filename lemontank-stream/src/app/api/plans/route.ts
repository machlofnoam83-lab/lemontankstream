import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { planUpdateSchema } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** תוכניות המנוי — ציבורי (עמוד המחירים) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const plans = all(
      `SELECT code, name_he, name_en, tagline, price_ils, old_price_ils, currency, billing_period, max_streams,
              max_profiles, max_quality, downloads_allowed, ads_enabled, ads_free_bypass, trial_days, early_access,
              features_json, badge_color, sort_order, is_active
       FROM plans WHERE is_active = 1 ORDER BY sort_order, price_ils`,
    );
    const current = ctx.user
      ? get<{ plan_code: string; status: string; current_period_end: string | null; trial_end: string | null }>(
          "SELECT plan_code, status, current_period_end, trial_end FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
          [ctx.user.id],
        )
      : null;
    return jsonOk({ plans, current }, undefined, req);
  });
}

/** עדכון הגדרות מסלול (מנהל) — מחיר, איכות, הורדות וכו' */
export async function PATCH(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", permission: "billing.manage", audit: { action: "plan.update", entity: "plan", severity: "warning" } },
    async (ctx) => {
      const body = await ctx.body<{ code?: string } & Record<string, unknown>>();
      const code = String(body.code ?? "");
      const plan = get<{ code: string }>("SELECT code FROM plans WHERE code = ?", [code]);
      if (!plan) throw new ApiError("NOT_FOUND", 404, undefined, "המסלול לא נמצא");

      const input = planUpdateSchema.parse(body);
      const fields: string[] = [];
      const values: unknown[] = [];
      const set = (c: string, v: unknown) => {
        fields.push(`${c} = ?`);
        values.push(v);
      };

      if (input.name_he !== undefined) set("name_he", input.name_he);
      if (input.tagline !== undefined) set("tagline", input.tagline);
      if (input.price_ils !== undefined) set("price_ils", input.price_ils);
      if (input.old_price_ils !== undefined) set("old_price_ils", input.old_price_ils);
      if (input.max_streams !== undefined) set("max_streams", input.max_streams);
      if (input.max_profiles !== undefined) set("max_profiles", input.max_profiles);
      if (input.max_quality !== undefined) set("max_quality", input.max_quality);
      if (input.downloads_allowed !== undefined) set("downloads_allowed", input.downloads_allowed ? 1 : 0);
      if (input.ads_enabled !== undefined) set("ads_enabled", input.ads_enabled ? 1 : 0);
      if (input.ads_free_bypass !== undefined) set("ads_free_bypass", input.ads_free_bypass ? 1 : 0);
      if (input.trial_days !== undefined) set("trial_days", input.trial_days);
      if (input.early_access !== undefined) set("early_access", input.early_access ? 1 : 0);
      if (input.features_json !== undefined) set("features_json", JSON.stringify(input.features_json));
      if (input.badge_color !== undefined) set("badge_color", input.badge_color);
      if (input.is_active !== undefined) set("is_active", input.is_active ? 1 : 0);

      if (!fields.length) return jsonOk({ message: "לא היו שינויים" }, undefined, req);

      set("updated_at", new Date().toISOString());
      run(`UPDATE plans SET ${fields.join(", ")} WHERE code = ?`, [...values, code]);

      return jsonOk({ plan: get("SELECT * FROM plans WHERE code = ?", [code]), message: "המסלול עודכן" }, undefined, req);
    },
  );
}
