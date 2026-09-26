import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { redeemCode } from "@/lib/giftcards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().trim().min(8, "קוד כרטיס קצר מדי").max(80),
  /** איך אפשר להשיג אותך (דיסקורד/וואטסאפ) — לבקשות שממתינות לאישור */
  contact: z.string().trim().max(120).optional().nullable(),
  /** מספר הזמנה / צילום / כל ראיה שהכרטיס שולם */
  evidence: z.string().trim().max(500).optional().nullable(),
});

/**
 * מימוש קוד גיפט קארד.
 *
 *  · קוד של כרטיס שהאתר הנפיק → המנוי מופעל מיד.
 *  · קוד לא מוכר → נפתחת בקשת תשלום שממתינה לאישור אנושי,
 *    והבעלים מקבל על זה התראה בדיסקורד/מייל.
 *
 * מוגן ב-rate-limit צר (`redeem`): ניחוש קודים הוא התקיפה היחידה שמעניינת כאן.
 */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "redeem" }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const result = redeemCode({
      userId: ctx.user!.id,
      code: input.code,
      contact: input.contact ?? null,
      evidence: input.evidence ?? null,
      ip: ctx.ip,
    });

    if (result.mode === "granted") {
      return jsonOk(
        {
          granted: true,
          plan_code: result.planCode,
          months: result.months,
          period_end: result.periodEnd,
          message: `המנוי הופעל! בתוקף עד ${new Date(result.periodEnd).toLocaleDateString("he-IL")}`,
        },
        undefined,
        req,
      );
    }

    return jsonOk({ granted: false, pending: true, requestId: result.requestId, message: result.message }, { status: 202 }, req);
  });
}
