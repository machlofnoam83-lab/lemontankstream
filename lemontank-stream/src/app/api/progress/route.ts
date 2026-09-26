import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { progressSchema } from "@/lib/validate";
import { syncBadges } from "@/lib/gamification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** שמירת נקודת עצירה בצפייה — נקרא מהנגן כל 10 שניות */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "progress" }, async (ctx) => {
    const input = progressSchema.parse(await ctx.body<Record<string, unknown>>());
    const userId = ctx.user!.id;

    const title = get<{ id: number }>("SELECT id FROM titles WHERE id = ? AND deleted_at IS NULL", [input.title_id]);
    if (!title) throw new ApiError("NOT_FOUND", 404, undefined, "הכותר לא נמצא");

    const percent = input.duration_sec > 0 ? Math.min(1, input.position_sec / input.duration_sec) : 0;
    const completed = percent >= 0.92 ? 1 : 0;
    const profileId = input.profile_id ?? null;

    // UPSERT: שומרים שורה אחת לכל שילוב משתמש/פרופיל/פרק
    run(
      `INSERT INTO watch_progress(user_id, profile_id, title_id, episode_id, position_sec, duration_sec, percent, completed, updated_at)
       VALUES(?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(user_id, profile_id, episode_id) DO UPDATE SET
         position_sec = excluded.position_sec,
         duration_sec = excluded.duration_sec,
         percent = excluded.percent,
         completed = excluded.completed,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      [userId, profileId, input.title_id, input.episode_id ?? null, input.position_sec, input.duration_sec, percent, completed],
    );

    if (completed && input.episode_id) {
      run("INSERT INTO analytics_events(kind, user_id, title_id, episode_id) VALUES('finish', ?, ?, ?)", [userId, input.title_id, input.episode_id]);
    }

    // הישגים: צפייה שהסתיימה עשויה לזכות בתג — והמשתמש מקבל התראה מיד
    let newBadges: string[] = [];
    if (completed) {
      try {
        newBadges = syncBadges(userId).earned;
      } catch {
        /* הישגים לא מפילים שמירת התקדמות */
      }
    }
    return jsonOk({ saved: true, percent, completed: Boolean(completed), newBadges }, undefined, req);
  });
}

/** היסטוריית צפייה של המשתמש */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const rows = all(
      `SELECT wp.id, wp.position_sec, wp.duration_sec, wp.percent, wp.completed, wp.updated_at,
              t.id AS title_id, t.slug, t.name_he, t.poster_url, t.kind,
              e.id AS episode_id, e.number AS episode_number, e.season_number, e.name_he AS episode_name
       FROM watch_progress wp
       JOIN titles t ON t.id = wp.title_id
       LEFT JOIN episodes e ON e.id = wp.episode_id
       WHERE wp.user_id = ? ORDER BY wp.updated_at DESC LIMIT 100`,
      [ctx.user!.id],
    );
    return jsonOk({ items: rows }, undefined, req);
  });
}

/** מחיקת היסטוריה (פרטיות — זכות המשתמש) */
export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const body = await ctx.body<{ id?: number; all?: boolean }>().catch(() => ({}) as { id?: number; all?: boolean });
    if (body?.all) {
      const changes = run("DELETE FROM watch_progress WHERE user_id = ?", [ctx.user!.id]).changes;
      run("DELETE FROM analytics_events WHERE user_id = ?", [ctx.user!.id]);
      return jsonOk({ deleted: changes }, undefined, req);
    }
    if (body?.id) {
      run("DELETE FROM watch_progress WHERE id = ? AND user_id = ?", [body.id, ctx.user!.id]);
      return jsonOk({ deleted: 1 }, undefined, req);
    }
    throw new ApiError("BAD_REQUEST", 400);
  });
}
