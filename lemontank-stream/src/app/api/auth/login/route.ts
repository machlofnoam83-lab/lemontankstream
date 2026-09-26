import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, jsonError, ApiError } from "@/lib/http";
import { loginSchema } from "@/lib/validate";
import { z } from "zod";
import { authenticate, completeTwoFactor } from "@/lib/auth";
import { setSessionCookies } from "@/lib/session";
import { RATE_RULES, peekRateLimit, recordFailure } from "@/lib/ratelimit";
import { clientIp } from "@/lib/http";
import { logSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** התחברות — כולל מסלול 2FA דו-שלבי */
/**
 * שלב שני של אימות דו-שלבי: מספיק אתגר + קוד, בלי לשלוח שוב את הסיסמה.
 * (האתגר עצמו נוצר רק אחרי סיסמה נכונה, ותקף 5 דקות ופעם אחת.)
 */
const twoFactorSchema = z.object({
  challenge: z.string().min(10).max(200),
  totp: z.string().trim().regex(/^\d{6}$/, "קוד 2FA חייב להיות 6 ספרות"),
});

export async function POST(req: NextRequest) {
  return withApi(req, { rateLimit: "login", auth: "optional" }, async (ctx) => {
    const raw = await ctx.body<Record<string, unknown>>();

    /*
     * מכסת הכשלים: נספרים **כישלונות בלבד** לאותו IP.
     *  · התחברות מוצלחת לא שורפת מכסה — משתמש לגיטימי לא נחסם לעולם.
     *  · 8 כשלים ב-5 דקות = חסימה זמנית של אותו IP (בנוסף לנעילת החשבון
     *    שמתבצעת בשרת לפי מספר הניסיונות הכושלים של המשתמש עצמו).
     */
    const ip = clientIp(req);
    const failures = peekRateLimit(RATE_RULES.loginFailure, ip);
    if (!failures.allowed) {
      await logSecurityEvent({
        kind: "login_throttled",
        severity: "warning",
        ip,
        detail: `${failures.limit} כשלי התחברות ב-${RATE_RULES.loginFailure.windowSec} שניות`,
      });
      return jsonError(
        new ApiError("RATE_LIMITED", 429, { retryAfterSec: failures.resetInSec }, "יותר מדי ניסיונות התחברות כושלים — נסה שוב בעוד כמה דקות"),
        req,
      );
    }
    const countFailure = () => recordFailure(RATE_RULES.loginFailure, ip);

    // שלב 2: אימות קוד 2FA
    const second = twoFactorSchema.safeParse(raw);
    if (second.success) {
      const result = await completeTwoFactor(second.data.challenge, second.data.totp, req);
      if (!result.ok) {
        countFailure();
        return jsonError(new ApiError("UNAUTHORIZED", 401, undefined, result.message), req);
      }
      await setSessionCookies(result.token, result.csrfToken);
      return jsonOk({ user: result.user, twoFactor: true }, undefined, req);
    }

    const input = loginSchema.parse(raw);
    const result = await authenticate(input.email, input.password, req);

    if (!result.ok) {
      if (result.reason === "2fa_required") {
        // לא יוצרים סשן — מחזירים אתגר בלבד
        return jsonOk({ requires2fa: true, challenge: result.challengeToken, message: result.message }, { status: 200 }, req);
      }
      countFailure();
      const status = result.reason === "locked" ? 423 : 401;
      return jsonError(new ApiError("UNAUTHORIZED", status, { reason: result.reason, lockedUntil: result.lockedUntil }, result.message), req);
    }

    await setSessionCookies(result.token, result.csrfToken, input.remember);
    return jsonOk({ user: result.user, twoFactor: false }, undefined, req);
  });
}
