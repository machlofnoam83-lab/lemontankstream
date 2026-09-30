import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { checkEmailAuthenticity } from "@/lib/email-integrity";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().min(3).max(160) });

/**
 * בדיקת אמינות כתובת מייל בזמן הקלדה.
 *
 * נקראת ע"י טופס ההרשמה כדי להראות למשתמש מיד אם הכתובת תתקבל — לפני
 * שהוא ממלא סיסמה. לא חושפת דבר על משתמשים קיימים (רק על הכתובת עצמה),
 * ומוגבלת במכסה כדי שלא תשמש לבדיקת רשימות כתובות בכמויות.
 *
 * הערה: התשובה זהה לזו שתחזור בהרשמה עצמה, כדי שלא יהיו הפתעות בסוף.
 */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "optional", rateLimit: "api" }, async (ctx) => {
    const { email } = schema.parse(await ctx.body<Record<string, unknown>>());
    const settings = getSettings();

    const verdict = await checkEmailAuthenticity(email, {
      blockDisposable: settings.block_disposable_email,
      allowedDomains: settings.allowed_email_domains ?? [],
      checkDns: settings.verify_email_domain,
      blockSubaddress: true,
    });

    return jsonOk(
      {
        ok: verdict.ok,
        code: verdict.code,
        message: verdict.message,
        domain: verdict.domain,
      },
      undefined,
      req,
    );
  });
}
