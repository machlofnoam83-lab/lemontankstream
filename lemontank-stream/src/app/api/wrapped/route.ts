import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { availableYears, buildWrapUp } from "@/lib/wrapup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "השנה שלי" — סיכום צפייה אישי, מחושב מהנתונים האמיתיים */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    const yearParam = new URL(req.url).searchParams.get("year");
    const years = availableYears(ctx.user!.id);
    const year = yearParam ? Number(yearParam) : years[0];
    const safeYear = years.includes(Number(year)) ? Number(year) : years[0];
    return jsonOk({ wrap: buildWrapUp(ctx.user!.id, safeYear), years }, undefined, req);
  });
}
