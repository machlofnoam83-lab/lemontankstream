import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { searchCatalog } from "@/lib/catalog";
import { sanitizeText } from "@/lib/validate";
import { isStaff } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** חיפוש חי — מחזיר תוצאות מסוננות לפי המנוי של המשתמש (חינם לא מקבל קישורים לתוכן פלוס) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional", rateLimit: "search" }, async (ctx) => {
    const url = new URL(req.url);
    const q = sanitizeText(url.searchParams.get("q") ?? "", 80);
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") ?? 12)));

    if (q.length < 2) return jsonOk({ items: [], query: q }, undefined, req);

    const isStaffUser = isStaff(ctx.user?.role);
    const isPlus = ctx.user?.effective_plan === "plus";

    const items = searchCatalog(q, { limit: limit * 2 }).filter((item) => {
      if (isStaffUser || isPlus) return true;
      return item.plan_access === "free";
    });

    return jsonOk(
      {
        items: items.slice(0, limit).map((i) => ({
          id: i.id,
          slug: i.slug,
          name_he: i.name_he,
          name_en: i.name_en,
          kind: i.kind,
          year: i.year,
          poster_url: i.poster_url,
          plan_access: i.plan_access,
          rating_imdb: i.rating_imdb,
        })),
        query: q,
        total: items.length,
      },
      undefined,
      req,
    );
  });
}
