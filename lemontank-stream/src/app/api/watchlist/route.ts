import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  title_id: z.coerce.number().int().positive(),
  action: z.enum(["add", "remove", "toggle"]),
  kind: z.enum(["list", "like", "dislike", "hidden", "notify"]).optional().default("list"),
  profile_id: z.coerce.number().int().positive().optional().nullable(),
});

/** הוספה/הסרה מהרשימה שלי, לייקים והסתרות */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const userId = ctx.user!.id;

    const existing = get<{ id: number }>(
      "SELECT id FROM watchlist WHERE user_id = ? AND profile_id IS ? AND title_id = ? AND kind = ?",
      [userId, input.profile_id ?? null, input.title_id, input.kind],
    );

    const shouldAdd = input.action === "add" || (input.action === "toggle" && !existing);

    if (shouldAdd) {
      if (!existing) {
        run("INSERT INTO watchlist(user_id, profile_id, title_id, kind) VALUES(?,?,?,?)", [userId, input.profile_id ?? null, input.title_id, input.kind]);
        if (input.kind === "like") run("UPDATE titles SET likes_count = likes_count + 1 WHERE id = ?", [input.title_id]);
      }
    } else if (existing) {
      run("DELETE FROM watchlist WHERE id = ? AND user_id = ?", [existing.id, userId]);
      if (input.kind === "like") run("UPDATE titles SET likes_count = MAX(0, likes_count - 1) WHERE id = ?", [input.title_id]);
    }

    // לייק ודיסלייק סותרים זה את זה
    if (input.kind === "like" || input.kind === "dislike") {
      const opposite = input.kind === "like" ? "dislike" : "like";
      run("DELETE FROM watchlist WHERE user_id = ? AND title_id = ? AND kind = ?", [userId, input.title_id, opposite]);
    }

    return jsonOk({ inList: shouldAdd, kind: input.kind }, undefined, req);
  });
}

/** הרשימה שלי */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const kind = new URL(req.url).searchParams.get("kind") ?? "list";
    const items = all(
      `SELECT t.id, t.kind, t.slug, t.name_he, t.name_en, t.year, t.poster_url, t.backdrop_url, t.color, t.plan_access,
              t.rating_imdb, t.rating_site, t.seasons_count, t.episodes_count, t.runtime_min, t.maturity, t.quality_max,
              t.is_featured, t.is_original, t.trending_score, t.views_count, t.status, t.updated_at, w.created_at AS added_at
       FROM watchlist w JOIN titles t ON t.id = w.title_id
       WHERE w.user_id = ? AND w.kind = ? AND t.deleted_at IS NULL
       ORDER BY w.created_at DESC LIMIT 200`,
      [ctx.user!.id, kind],
    );
    void ApiError;
    return jsonOk({ items, kind }, undefined, req);
  });
}
