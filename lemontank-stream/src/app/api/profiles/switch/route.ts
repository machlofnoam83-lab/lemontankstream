import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { listProfiles, maxProfilesFor, pinRequirement, setSessionProfile, switchProfile } from "@/lib/profiles";
import { getActiveProfile } from "@/lib/session";
import { run } from "@/lib/db";
import { logSecurityEvent } from "@/lib/audit";
import { RATE_RULES, peekRateLimit, recordFailure } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.coerce.number().int().positive().optional(),
  profile_id: z.coerce.number().int().positive().optional(),
  pin: z.string().trim().max(8).optional(),
});

/**
 * "מי צופה?" — מעבר פרופיל.
 *
 * אבטחה:
 *  · מכסת ניסיונות נפרדת ("profile_switch", 8 ל-5 דק') — כדי שאי אפשר יהיה לנחש
 *    PIN בכוח, בלי לחסום את שאר המשפחה שטעתה פעם אחת בהתחברות.
 *  · היציאה מהפרופיל **הפעיל באמת** היא שקובעת אם צריך קוד — לא הפרופיל הראשון.
 *  · כל ניסיון PIN כושל נרשם כארוע אבטחה (מזין את מנוע החסימה והביקורת).
 *
 * מקבל גם `id` וגם `profile_id` מאותו גוף בקשה — נוחות ללקוחות.
 */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "profileSwitch" }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const targetId = input.id ?? input.profile_id;
    if (!targetId) throw new ApiError("BAD_REQUEST", 400, undefined, "חסר מזהה פרופיל");

    // הפרופיל הפעיל האמיתי של הסשן — קריטי לאכיפת "יציאה מפרופיל ילדים דורשת קוד"
    const current = await getActiveProfile();

    /*
     * הגנת brute-force שמדוייקת לשימוש אמיתי:
     *  · נספרים **כישלונות בלבד** — קוד נכון לא שורף מכסה, כך שמשפחה יכולה להחליף
     *    פרופילים בלי הפסקה.
     *  · מעל 5 כישלונות ב-5 דקות (לאותו משתמש) כל ניסיון נדחה עם PIN_RATE_LIMITED.
     *  · הדלי נפרד מ"התחברות" כדי שטעות בסיסמה לא תחסום את מסך "מי צופה?".
     */
    const requirement = pinRequirement(ctx.user!.id, current?.id ?? null, targetId);
    const pinKey = `user:${ctx.user!.id}`;
    if (requirement.required) {
      const state = peekRateLimit(RATE_RULES.pinAttempt, pinKey);
      if (!state.allowed) {
        await logSecurityEvent({
          kind: "profile_pin_throttled",
          severity: "warning",
          userId: ctx.user!.id,
          detail: `חריגה ממכסת ניסויי PIN (${state.limit} ל-${RATE_RULES.pinAttempt.windowSec} שניות)`,
        });
        throw new ApiError(
          "PIN_RATE_LIMITED",
          429,
          { retryAfterSec: state.resetInSec },
          `יותר מדי ניסיונות קוד — נסה שוב בעוד ${Math.ceil(state.resetInSec / 60)} דק'`,
        );
      }
    }

    let profile;
    try {
      profile = await switchProfile({
        userId: ctx.user!.id,
        currentProfileId: current?.id ?? null,
        targetId,
        pin: input.pin,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "PIN_INVALID") {
        recordFailure(RATE_RULES.pinAttempt, pinKey);
        await logSecurityEvent({
          kind: "profile_pin_failed",
          severity: "warning",
          userId: ctx.user!.id,
          detail: `ניסיון PIN שגוי לפרופיל ${targetId}`,
        });
      }
      throw error;
    }

    if (ctx.sessionId) setSessionProfile(ctx.sessionId, profile.id);

    run("INSERT INTO analytics_events(user_id, profile_id, kind, meta) VALUES(?,?,?,?)", [
      ctx.user!.id,
      profile.id,
      "profile_switch",
      JSON.stringify({ to: profile.id }),
    ]).changes;

    const profiles = listProfiles(ctx.user!.id);
    return jsonOk(
      {
        profile: { ...profile, pin_hash: undefined },
        maxProfiles: maxProfilesFor(ctx.user!.effective_plan),
        profiles: profiles.length,
      },
      undefined,
      req,
    );
  });
}
