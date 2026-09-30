import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { userRedemptions } from "@/lib/giftcards";
import { outboundReady } from "@/lib/notify-out";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ההיסטוריה שלי: כרטיסים שמימשתי ובקשות שממתינות לאישור */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    return jsonOk(
      {
        redemptions: userRedemptions(ctx.user!.id),
        /** האם יש ערוץ התראות חיצוני מוגדר — כדי שהמשתמש יידע אם יש למי לפנות */
        alertsConfigured: outboundReady(),
      },
      undefined,
      req,
    );
  });
}
