import { route } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run, tx } from "@/lib/db";
import { episodeSchema, sanitizeText, sanitizeMultiline } from "@/lib/validate";
import { episodeAccess, listSeasons, type EpisodeRow, type SeasonRow } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };

/** רשימת פרקים עם רמת הגישה האפקטיבית (חינם/פלוס) */
export const GET = route<P>({ auth: "required", permission: "content.read" }, async (ctx) => {
  const titleId = Number(ctx.params.id);
  const title = get<{ id: number; kind: string; plan_access: "free" | "plus" }>(
    "SELECT id, kind, plan_access FROM titles WHERE id = ? AND deleted_at IS NULL",
    [titleId],
  );
  if (!title) throw new ApiError("NOT_FOUND", 404);

  const seasons = listSeasons(titleId);
  const seasonMap = new Map(seasons.map((s) => [s.id, s]));
  const episodes = all<EpisodeRow>(
    `SELECT id, title_id, season_id, season_number, number, name_he, name_en, overview, runtime_sec, thumb_url,
            video_url, plan_access, status, is_premiere, is_finale, air_date, views_count
     FROM episodes WHERE title_id = ? AND deleted_at IS NULL ORDER BY season_number, number`,
    [titleId],
  );

  return jsonOk(
    {
      seasons,
      episodes: episodes.map((e) => ({
        ...e,
        effective_access: episodeAccess(e, seasonMap.get(e.season_id) as SeasonRow | undefined, title),
      })),
    },
    undefined,
    ctx.req,
  );
});

/**
 * הוספת פרק — כולל תמונה (thumb_url), קישור וידאו או מזהה נכס שהועלה,
 * וההחלטה אם הפרק חינם או פלוס (inherit = יורש מהסדרה).
 */
export const POST = route<P>(
  { auth: "required", permission: "content.create", rateLimit: "write", audit: { action: "episode.create", entity: "episode" } },
  async (ctx) => {
    const titleId = Number(ctx.params.id);
    const title = get<{ id: number; kind: string; name_he: string }>(
      "SELECT id, kind, name_he FROM titles WHERE id = ? AND deleted_at IS NULL",
      [titleId],
    );
    if (!title) throw new ApiError("NOT_FOUND", 404, undefined, "הסדרה לא נמצאה");

    const raw = await ctx.body<Record<string, unknown>>();
    const input = episodeSchema.parse({ ...raw, title_id: titleId });

    const season = get<{ id: number; number: number }>("SELECT id, number FROM seasons WHERE id = ? AND title_id = ?", [
      input.season_id,
      titleId,
    ]);
    if (!season) throw new ApiError("BAD_REQUEST", 400, undefined, "העונה לא נמצאה בסדרה הזו");

    const dup = get<{ id: number }>("SELECT id FROM episodes WHERE season_id = ? AND number = ?", [input.season_id, input.number]);
    if (dup) throw new ApiError("CONFLICT", 409, undefined, `פרק ${input.number} כבר קיים בעונה הזו`);

    const videoAssetId = raw.video_asset_id ? Number(raw.video_asset_id) : null;

    const id = tx(() => {
      const res = run(
        `INSERT INTO episodes(title_id, season_id, season_number, number, name_he, name_en, overview, runtime_sec, air_date,
                              thumb_url, video_url, video_asset_id, plan_access, status, intro_start_sec, intro_end_sec,
                              credits_start_sec, is_premiere, is_finale, is_filler, created_by, published_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          titleId,
          season.id,
          season.number,
          input.number,
          sanitizeText(input.name_he, 200),
          input.name_en ? sanitizeText(input.name_en, 200) : null,
          input.overview ? sanitizeMultiline(input.overview, 4000) : null,
          input.runtime_sec,
          input.air_date ?? null,
          input.thumb_url ?? null,
          input.video_url ?? null,
          videoAssetId,
          input.plan_access, // ← האדמין קובע: חינם / פלוס / יורש
          input.status,
          input.intro_start_sec ?? null,
          input.intro_end_sec ?? null,
          input.credits_start_sec ?? null,
          input.is_premiere ? 1 : 0,
          input.is_finale ? 1 : 0,
          input.is_filler ? 1 : 0,
          ctx.user!.id,
          input.status === "published" ? new Date().toISOString() : null,
        ],
      );
      const newId = Number(res.lastInsertRowid);

      if (videoAssetId) {
        run("UPDATE media_assets SET episode_id = ?, title_id = ? WHERE id = ?", [newId, titleId, videoAssetId]);
      }
      run(
        "UPDATE titles SET episodes_count = (SELECT COUNT(*) FROM episodes WHERE title_id = ? AND deleted_at IS NULL) WHERE id = ?",
        [titleId, titleId],
      );
      run("UPDATE seasons SET episodes_count = (SELECT COUNT(*) FROM episodes WHERE season_id = ? AND deleted_at IS NULL) WHERE id = ?", [season.id, season.id]);
      return newId;
    });

    return jsonOk({ id, message: `פרק ${input.number} נוסף בהצלחה` }, { status: 201 }, ctx.req);
  },
);
