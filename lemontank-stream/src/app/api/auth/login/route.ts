import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, jsonError, ApiError } from "@/lib/http";
import { loginSchema } from "@/lib/validate";
import { authenticate, completeTwoFactor } from "@/lib/auth";
import { setSessionCookies } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** התחברות — כולל מסלול 2FA דו-שלבי */
export async function POST(req: NextRequest) {
  return withApi(req, { rateLimit: "login", auth: "optional" }, async (ctx) => {
    const raw = await ctx.body<Record<string, unknown>>();
    const input = loginSchema.parse(raw);

    // שלב 2: אימות קוד 2FA
    if (input.challenge && input.totp) {
      const result = await completeTwoFactor(input.challenge, input.totp, req);
      if (!result.ok) return jsonError(new ApiError("UNAUTHORIZED", 401, undefined, result.message), req);
      await setSessionCookies(result.token, result.csrfToken);
      return jsonOk({ user: result.user, twoFactor: true }, undefined, req);
    }

    const result = await authenticate(input.email, input.password, req);

    if (!result.ok) {
      if (result.reason === "2fa_required") {
        // לא יוצרים סשן — מחזירים אתגר בלבד
        return jsonOk({ requires2fa: true, challenge: result.challengeToken, message: result.message }, { status: 200 }, req);
      }
      const status = result.reason === "locked" ? 423 : 401;
      return jsonError(new ApiError("UNAUTHORIZED", status, { reason: result.reason, lockedUntil: result.lockedUntil }, result.message), req);
    }

    await setSessionCookies(result.token, result.csrfToken, input.remember);
    return jsonOk({ user: result.user, twoFactor: false }, undefined, req);
  });
}
