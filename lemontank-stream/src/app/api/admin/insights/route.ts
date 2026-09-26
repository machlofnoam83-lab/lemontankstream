import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { contentHealth, engagementOverview, revenueOverview, toCsv } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * תובנות אדמין — JSON לתצוגה, או CSV להורדה (?format=csv&report=revenue|engagement|health).
 * CSV מיוצא ב-UTF-8 עם BOM כדי שאקסל יציג עברית נכון.
 */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "analytics.read", rateLimit: "api" }, async () => {
    const url = new URL(req.url);
    const format = url.searchParams.get("format");
    const report = url.searchParams.get("report") ?? "all";

    if (format === "csv") {
      let rows: Record<string, unknown>[] = [];
      let filename = "insights.csv";

      if (report === "revenue") {
        rows = revenueOverview().monthly;
        filename = "revenue-monthly.csv";
      } else if (report === "engagement") {
        rows = engagementOverview().trend;
        filename = "engagement-trend.csv";
      } else if (report === "health") {
        rows = contentHealth().issues;
        filename = "content-health.csv";
      } else if (report === "plans") {
        rows = revenueOverview().byPlan;
        filename = "revenue-by-plan.csv";
      } else {
        throw new ApiError("BAD_REQUEST", 400, undefined, "דוח לא מוכר — revenue | engagement | health | plans");
      }

      return new Response(toCsv(rows), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "no-store",
        },
      });
    }

    return jsonOk({ revenue: revenueOverview(), engagement: engagementOverview(), health: contentHealth() }, undefined, req);
  });
}
