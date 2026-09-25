import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { registerSchema } from "@/lib/validate";
import { registerUser } from "@/lib/auth";
import { setSessionCookies } from "@/lib/session";
import { csrfTokenFor } from "@/lib/csrf";
import { getSettings } from "@/lib/settings";
import { clientIp } from "@/lib/http";
import { logSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** הרשמה — יוצרת משתמש, פרופיל ראשון, סשן ומחזירה את הטוקנים */
export async function POST(req: NextRequest) {
  return withApi(req, { rateLimit: "register", auth: "optional", parseBody: true, audit: { action: "auth.register", entity: "user" } }, async (ctx) => {
    const settings = getSettings();

    if (!settings.registration_open) {
      throw new ApiError("FORBIDDEN", 403, undefined, "ההרשמה סגורה כרגע — נסה שוב מאוחר יותר");
    }

    const raw = await ctx.body<Record<string, unknown>>();
    const input = registerSchema.parse({ ...raw, plan: (raw.plan as string) === "plus" ? "plus" : settings.default_signup_plan });

    const { user, token, csrfToken } = await registerUser(
      {
        email: input.email,
        password: input.password,
        name: input.name,
        plan: input.plan,
        referral: input.referral ?? null,
        marketing: input.marketing,
      },
      req,
    );

    // עוגיות: סשן httpOnly (טוקן אטום) + טוקן CSRF חתום לקריאה מ-JS
    await setSessionCookies(token, csrfToken, false);

    await logSecurityEvent({ kind: "user_registered", severity: "info", ip: clientIp(req), userId: user.id, detail: `plan=${input.plan}` });

    return jsonOk({ user, requiresVerification: settings.require_email_verification }, undefined, req);
  });
}
