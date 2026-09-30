import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { badgeProgress, currentStreak, leaderboard, leaderboardRank, syncBadges, userPoints } from "@/lib/gamification";
import { isFeatureEnabled } from "@/lib/settings";
import { ApiError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ההישגים שלי — מחשב מהנתונים האמיתיים, מעניק תגים חדשים ומחזיר התקדמות.
 * GET  /api/achievements        → התגים שלי + טבלת מצטיינים
 * POST /api/achievements   { sync: true } → רענון כפוי לפני החזרה
 */
async function payload(userId: number) {
  if (!isFeatureEnabled("achievements")) throw new ApiError("FORBIDDEN", 403, "מערכת ההישגים מושבתת כרגע");
  const badges = badgeProgress(userId);
  const earned = badges.filter((b) => b.earned);
  return {
    badges,
    earnedCount: earned.length,
    totalCount: badges.length,
    points: userPoints(userId),
    streak: currentStreak(userId),
    rank: leaderboardRank(userId),
    next: badges
      .filter((b) => !b.earned)
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 3),
    leaderboard: leaderboard(20),
  };
}

export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    const { earned } = syncBadges(ctx.user!.id);
    const data = await payload(ctx.user!.id);
    return jsonOk({ ...data, newlyEarned: earned }, undefined, req);
  });
}

export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    const { earned, points } = syncBadges(ctx.user!.id);
    const data = await payload(ctx.user!.id);
    return jsonOk({ ...data, newlyEarned: earned, points }, undefined, req);
  });
}
