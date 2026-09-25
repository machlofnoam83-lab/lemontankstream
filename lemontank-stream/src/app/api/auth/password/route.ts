import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { createPasswordResetToken, resetPasswordWithToken, changeOwnPassword } from "@/lib/auth";
import { resetRequestSchema, resetConfirmSchema, passwordSchema } from "@/lib/validate";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ניהול סיסמאות:
 *   POST { action: "request", email }             → יצירת טוקן איפוס (נשלח במייל בפרודקשן)
 *   POST { action: "confirm", token, password }   → איפוס סיסמה עם טוקן
 *   POST { action: "change", current, password }  → שינוי סיסמה למשתמש מחובר
 *
 * תשובה אחידה לבקשה — לא חושפים אם המייל קיים (הגנת enumeration).
 */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "optional", rateLimit: "passwordReset" }, async (ctx) => {
    const body = await ctx.body<Record<string, unknown>>();
    const action = String(body.action ?? "request");

    if (action === "request") {
      const input = resetRequestSchema.parse(body);
      const { token, userId } = createPasswordResetToken(input.email, req);
      const isDev = process.env.NODE_ENV !== "production";

      return jsonOk(
        {
          message: "אם הכתובת קיימת במערכת — נשלח אליה קישור לאיפוס סיסמה",
          // בסביבת פיתוח מחזירים את הטוקן כדי לאפשר בדיקה בלי SMTP
          devResetToken: isDev ? token : undefined,
          devNote: isDev && token ? "בפיתוח: השתמש בטוקן הזה בעמוד /reset-password" : undefined,
          userId: isDev ? userId : undefined,
        },
        undefined,
        req,
      );
    }

    if (action === "confirm") {
      const parsed = resetConfirmSchema.safeParse(body);
      if (!parsed.success) throw new ApiError("BAD_REQUEST", 400, parsed.error.flatten().fieldErrors, "הנתונים אינם תקינים");
      const ok = await resetPasswordWithToken(parsed.data.token, parsed.data.password, req);
      if (!ok) throw new ApiError("BAD_REQUEST", 400, undefined, "הקישור אינו תקף או שפג תוקפו");
      return jsonOk({ message: "הסיסמה הוחלפה בהצלחה — התחבר מחדש" }, undefined, req);
    }

    if (action === "change") {
      if (!ctx.user) throw new ApiError("UNAUTHORIZED", 401);
      const schema = z.object({ current: z.string().min(1).max(200), password: passwordSchema });
      const input = schema.parse(body);
      await changeOwnPassword(ctx.user.id, input.current, input.password, req);
      return jsonOk({ message: "הסיסמה עודכנה וכל המכשירים נותקו" }, undefined, req);
    }

    throw new ApiError("BAD_REQUEST", 400, undefined, "פעולה לא מוכרת");
  });
}
