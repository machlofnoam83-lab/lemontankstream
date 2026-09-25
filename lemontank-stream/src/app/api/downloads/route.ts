import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { signMediaToken } from "@/lib/crypto";
import { episodeAccess, type EpisodeRow, type SeasonRow } from "@/lib/catalog";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  title_id: z.coerce.number().int().positive(),
  episode_id: z.coerce.number().int().positive().optional().nullable(),
  quality: z.enum(["480p", "720p", "1080p"]).optional().default("720p"),
});

/** הורדה אופליין — זמין למנויי פלוס בלבד, עם טוקן חתום בתפוגה */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "streamStart" }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const user = ctx.user!;

    if (user.effective_plan !== "plus") {
      throw new ApiError("PLAN_REQUIRED", 402, { needPlan: "plus" }, "הורדות זמינות למנויי פלוס בלבד ⭐");
    }

    // איתור הנכס הרלוונטי
    let assetId: number | null = null;
    let planAccess: "free" | "plus" = "free";

    if (input.episode_id) {
      const episode = get<EpisodeRow & { video_asset_id: number | null }>(
        "SELECT id, title_id, season_id, season_number, number, name_he, plan_access, video_asset_id, video_url FROM episodes WHERE id = ? AND deleted_at IS NULL",
        [input.episode_id],
      );
      if (!episode) throw new ApiError("NOT_FOUND", 404, undefined, "הפרק לא נמצא");
      const title = get<{ plan_access: "free" | "plus" }>("SELECT plan_access FROM titles WHERE id = ?", [episode.title_id]);
      const season = get<SeasonRow>("SELECT id, title_id, number, plan_access FROM seasons WHERE id = ?", [episode.season_id]);
      planAccess = episodeAccess(episode, season ?? null, title ?? null);
      assetId = episode.video_asset_id ?? null;
    } else {
      const title = get<{ plan_access: "free" | "plus"; is_downloadable: number }>(
        "SELECT plan_access, is_downloadable FROM titles WHERE id = ? AND deleted_at IS NULL",
        [input.title_id],
      );
      if (!title) throw new ApiError("NOT_FOUND", 404, undefined, "הכותר לא נמצא");
      planAccess = title.plan_access;
      const asset = get<{ id: number }>(
        "SELECT id FROM media_assets WHERE title_id = ? AND kind IN ('video','trailer') AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
        [input.title_id],
      );
      assetId = asset?.id ?? null;
    }

    if (planAccess === "plus" && user.effective_plan !== "plus") {
      throw new ApiError("PLAN_REQUIRED", 402, undefined, "התוכן הזה זמין למנויי פלוס בלבד");
    }
    if (!assetId) throw new ApiError("NOT_FOUND", 404, undefined, "אין קובץ וידאו זמין להורדה לכותר הזה");

    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const token = signMediaToken({ assetId, userId: user.id, episodeId: input.episode_id ?? 0 }, 24 * 3600);

    run(
      `INSERT INTO downloads(user_id, title_id, episode_id, quality, token_hash, status, expires_at)
       VALUES(?,?,?,?,?, 'ready', ?)`,
      [user.id, input.title_id, input.episode_id ?? null, input.quality, token.slice(0, 64), expiresAt],
    );

    return jsonOk(
      {
        url: `/api/media/${assetId}?sig=${encodeURIComponent(token)}&download=1`,
        expiresAt,
        quality: input.quality,
        note: "הקישור תקף ל-24 שעות ולחשבון שלך בלבד",
      },
      { status: 201 },
      req,
    );
  });
}

/** ההורדות שלי */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const items = all(
      `SELECT d.id, d.quality, d.status, d.expires_at, d.created_at, t.name_he AS title_name, t.slug,
              e.number AS episode_number, e.name_he AS episode_name
       FROM downloads d JOIN titles t ON t.id = d.title_id
       LEFT JOIN episodes e ON e.id = d.episode_id
       WHERE d.user_id = ? ORDER BY d.id DESC LIMIT 100`,
      [ctx.user!.id],
    );
    return jsonOk({ items, downloadsAllowed: ctx.user!.effective_plan === "plus" }, undefined, req);
  });
}
