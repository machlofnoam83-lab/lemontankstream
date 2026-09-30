import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { listItems, publicListByCode } from "@/lib/lists";
import { getMaturityCeiling } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * רשימה משותפת לפי קוד — ציבורי (לא דורש התחברות).
 *
 * נחשף אך ורק מה שרשום ברשימה: שם הרשימה, שם הבעלים הפרטי (שם תצוגה בלבד),
 * והכותרים. אין מייל, אין מזהה משתמש, ואין גישה לרשימות פרטיות.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  return withApi(req, { rateLimit: "api" }, async () => {
    const clean = String(code).trim().toLowerCase();
    if (!/^[a-f0-9]{12}$/.test(clean)) throw new ApiError("NOT_FOUND", 404);

    const list = publicListByCode(clean);
    if (!list) throw new ApiError("NOT_FOUND", 404, undefined, "הרשימה לא נמצאה או שאינה משותפת");

    const ceiling = await getMaturityCeiling();
    return jsonOk(
      {
        list: {
          name: list.name,
          description: list.description,
          cover_url: list.cover_url,
          owner: list.owner_name,
          items_count: listItems(list.id).length,
        },
        items: listItems(list.id, { maturityMax: ceiling }),
      },
      undefined,
      req,
    );
  });
}
