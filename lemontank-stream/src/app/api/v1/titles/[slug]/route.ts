import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { all, get } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/titles/:slug — פרטי כותר מלאים, כולל פרקים מותרים */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  return withApi(req, { auth: "required", allowApiKey: true, apiKeyScope: "read", rateLimit: "api" }, async (api) => {
    const title = get(
      `SELECT id, kind, slug, name_he, name_en, original_name, tagline, overview, year, release_date, end_date,
              runtime_min, seasons_count, episodes_count, maturity, country, language, director, cast_text,
              poster_url, backdrop_url, trailer_url, rating_imdb, rating_site, votes_count, views_count, likes_count,
              quality_max, audio_langs, subtitle_langs, plan_access, status, is_featured, is_original,
              (SELECT GROUP_CONCAT(g.name_he, ', ') FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = titles.id) AS genres,
              published_at, updated_at
       FROM titles WHERE slug = ? AND deleted_at IS NULL`,
      [slug],
    );
    if (!title) throw new ApiError("NOT_FOUND", 404);

    const id = (title as { id: number }).id;
    const episodes = all(
      `SELECT id, season_number, number, name_he, name_en, overview, runtime_sec, air_date, thumb_url, plan_access, status
       FROM episodes WHERE title_id = ? AND deleted_at IS NULL ORDER BY season_number, number LIMIT 500`,
      [id],
    );

    return jsonOk({ title, episodes }, undefined, req);
  });
}
