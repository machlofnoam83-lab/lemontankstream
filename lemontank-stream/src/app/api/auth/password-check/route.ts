import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { assessLocal, checkPwned, breachMode } from "@/lib/password-policy";
import { count } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string().min(1).max(200),
  email: z.string().max(200).optional(),
  name: z.string().max(80).optional(),
});

/**
 * מדד חוזק הסיסמה בזמן הקלדה.
 *
 * הסיסמה לא נשמרת, לא נרשמת ביומן ולא נכנסת למסד — היא נבדקת בזיכרון
 * ונזרקת. בדיקת הדליפה (HIBP) משתמשת ב-k-anonymity: נשלחים 5 תווים של
 * Hash, כך שגם ספק החיפוש לא יודע מה הסיסמה.
 *
 * rate-limit צר במיוחד: 30 בדיקות בדקה, כדי שלא ניתן יהיה להשתמש בשרת
 * ככלי לבדיקת סיסמאות בקנה מידה גדול.
 */
export async function POST(req: NextRequest) {
  return withApi(req, { rateLimit: "passwordCheck", auth: "optional" }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const breach = breachMode();

    const local = assessLocal(input.password, { email: input.email, name: input.name });

    // בדיקת דליפה מרוחקת רק כשהסיסמה בכלל ראויה (חוסך קריאות רשת מיותרות)
    let breached: boolean | null = null;
    let breachCount = 0;
    if (breach !== "off" && input.password.length >= 6) {
      const verdict = await checkPwned(input.password);
      breached = verdict.pwned;
      breachCount = verdict.count;
    }

    const usable = local.ok && breached !== true;
    return jsonOk(
      {
        ok: usable,
        score: breached === true ? Math.min(local.score, 10) : local.score,
        level: local.level,
        problems: breached === true ? [...local.problems, "הסיסמה הופיעה בהדלפת מידע ידועה — אסור להשתמש בה"] : local.problems,
        suggestions: local.suggestions,
        breach: { mode: breach, pwned: breached, count: breachCount },
        /** ספירת קריאות-רשת בלבד — ללא תוכן, לצורכי ניטור */
        checks: count("SELECT COUNT(*) c FROM breach_checks"),
      },
      undefined,
      req,
    );
  });
}
