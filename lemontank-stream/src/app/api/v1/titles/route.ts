import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { all, count } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/titles — קטלוג ציבורי לשימוש חיצוני.
 *
 * אימות: Authorization: Bearer lt_live_…
 * הרשאה: read · מכסה: לפי המפתח (ברירת מחדל 120/דקה)
 */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", allowApiKey: true, apiKeyScope: "read", rateLimit: "api" }, async (ctx) => {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const genre = url.searchParams.get("genre");
    const search = url.searchParams.get("q");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

    const where: string[] = ["t.deleted_at IS NULL", "t.status = 'published'"];
    const params: unknown[] = [];
    if (kind === "movie" || kind === "series") {
      where.push("t.kind = ?");
      params.push(kind);
    }
    if (genre) {
      where.push("t.id IN (SELECT tg.title_id FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE g.slug = ?)");
      params.push(genre);
    }
    if (search) {
      where.push("t.id IN (SELECT rowid FROM titles_fts WHERE titles_fts MATCH ?)");
      params.push(`${search.replace(/["*]/g, " ").trim()}*`);
    }

    const rows = all(
      `SELECT t.id, t.kind, t.slug, t.name_he, t.name_en, t.year, t.runtime_min, t.seasons_count, t.episodes_count,
              t.maturity, t.poster_url, t.backdrop_url, t.rating_imdb, t.rating_site,
              (SELECT GROUP_CONCAT(g.name_he, ', ') FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = t.id) AS genres,
              t.plan_access, t.quality_max, t.overview, t.release_date, t.popularity
       FROM titles t
       WHERE ${where.join(" AND ")}
       ORDER BY t.popularity DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const total = count(
      `SELECT COUNT(*) c FROM titles t WHERE ${where.join(" AND ")}`,
      params,
    );

    return jsonOk({ items: rows, total, limit, offset, key: ctx.apiKey?.name ?? null }, undefined, req);
  });
}
