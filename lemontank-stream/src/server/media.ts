/**
 * החלטות גישה למדיה — הלב של האבטחה בצד התוכן.
 *
 * כל בקשת וידאו/תמונה/כתובית עוברת כאן, והפונקציה מחליטה:
 *   1. מי המשתמש (מהסשן בשרת — לא מהקלט).
 *   2. מה רמת התוכן שהנכס שייך אליו (חינם / פלוס) לפי השרשרת title → season → episode.
 *   3. האם מותר לו לקבל את הבייטים. אחרת — 403.
 *
 * זה מה שמונע את תרחיש "משתמש חינם גונב קישור ישיר לסרט פלוס".
 */

import type { NextRequest } from "next/server";
import { get } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { getCurrentSession } from "@/lib/session";
import { isStaff } from "@/lib/rbac";
import { verifyMediaToken } from "@/lib/crypto";
import { episodeAccess, type EpisodeRow, type SeasonRow } from "@/lib/catalog";

export type MediaAssetRow = {
  id: number;
  kind: string;
  storage: string;
  path: string;
  mime: string;
  bytes: number;
  original_name: string | null;
  title_id: number | null;
  episode_id: number | null;
  visibility: string;
  scan_status: string;
  deleted_at: string | null;
};

/** מחזיר את רמת הגישה של הנכס (free/plus) לפי התוכן שאליו הוא משויך */
export function assetPlanAccess(asset: MediaAssetRow): "free" | "plus" {
  // נכס של פרק — עוקב אחרי הפרק/עונה/סדרה
  if (asset.episode_id) {
    const episode = get<EpisodeRow & { season_id: number }>(
      "SELECT id, title_id, season_id, season_number, number, name_he, plan_access FROM episodes WHERE id = ?",
      [asset.episode_id],
    );
    const title = episode ? get<{ plan_access: "free" | "plus" }>("SELECT plan_access FROM titles WHERE id = ?", [episode.title_id]) : undefined;
    const season = episode ? get<SeasonRow>("SELECT id, title_id, number, plan_access FROM seasons WHERE id = ?", [episode.season_id]) : undefined;
    if (episode) return episodeAccess(episode, season ?? null, title ?? null);
  }

  if (asset.title_id) {
    const title = get<{ plan_access: "free" | "plus" }>("SELECT plan_access FROM titles WHERE id = ?", [asset.title_id]);
    if (title) return title.plan_access;
  }

  // נכס לא משויך (למשל תמונת באנר של קמפיין) — פומבי
  return "free";
}

export type MediaAccessResult = MediaAssetRow & { access: "free" | "plus"; grantedBy: "public" | "plan" | "staff" | "signature" };

/** בדיקת הגישה לנכס מדיה עבור הבקשה הנוכחית */
export async function getAsset(
  req: NextRequest,
  assetId: number,
  opts: { signature?: string } = {},
): Promise<MediaAccessResult> {
  const asset = get<MediaAssetRow>(
    `SELECT id, kind, storage, path, mime, bytes, original_name, title_id, episode_id, visibility, scan_status, deleted_at
     FROM media_assets WHERE id = ?`,
    [assetId],
  );

  if (!asset || asset.deleted_at) throw new ApiError("NOT_FOUND", 404, undefined, "המדיה לא נמצאה");
  if (asset.scan_status === "infected") throw new ApiError("FORBIDDEN", 403, undefined, "הקובץ נחסם על ידי סריקת אבטחה");
  if (asset.storage !== "local") throw new ApiError("BAD_REQUEST", 400, undefined, "נכס חיצוני — השתמש ב-URL המקורי");

  const access = assetPlanAccess(asset);

  // 1. נכסים ציבוריים (באנרים, לוגואים, קבצים בקטלוג החינמי)
  if (asset.visibility === "public" && access === "free") {
    return { ...asset, access, grantedBy: "public" };
  }

  // 2. טוקן חתום (הורדות אופליין / קישור זמני)
  if (opts.signature) {
    const payload = verifyMediaToken<{ assetId: number; userId: number }>(opts.signature);
    if (payload && Number(payload.assetId) === asset.id) {
      return { ...asset, access, grantedBy: "signature" };
    }
  }

  // 3. סשן משתמש
  const session = await getCurrentSession();
  const user = session?.user ?? null;
  if (!user) throw new ApiError("UNAUTHORIZED", 401, undefined, "צריך להתחבר כדי לנגן תוכן");

  if (isStaff(user.role)) return { ...asset, access, grantedBy: "staff" };

  if (access === "plus") {
    if (user.effective_plan !== "plus") {
      throw new ApiError("PLAN_REQUIRED", 402, { needPlan: "plus" }, "התוכן הזה זמין למנויי פלוס בלבד");
    }
    return { ...asset, access, grantedBy: "plan" };
  }

  return { ...asset, access, grantedBy: "plan" };
}
