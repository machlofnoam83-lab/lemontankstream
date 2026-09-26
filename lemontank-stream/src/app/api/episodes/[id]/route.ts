import { route } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { get, run } from "@/lib/db";
import { episodeSchema, sanitizeText, sanitizeMultiline } from "@/lib/validate";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };

/** עדכון פרק — שם, תמונה, וידאו והרשאת חינם/פלוס */
export const PATCH = route<P>(
  { auth: "required", permission: "content.update", rateLimit: "write", parseBody: true },
  async (ctx) => {
    const id = Number(ctx.params.id);
    const before = get<Record<string, unknown>>("SELECT * FROM episodes WHERE id = ? AND deleted_at IS NULL", [id]);
    if (!before) throw new ApiError("NOT_FOUND", 404, undefined, "הפרק לא נמצא");

    const raw = await ctx.body<Record<string, unknown>>();
    const input = episodeSchema.partial().parse(raw);

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (c: string, v: unknown) => {
      fields.push(`${c} = ?`);
      values.push(v);
    };

    if (input.name_he !== undefined) set("name_he", sanitizeText(input.name_he, 200));
    if (input.name_en !== undefined) set("name_en", input.name_en ? sanitizeText(input.name_en, 200) : null);
    if (input.overview !== undefined) set("overview", input.overview ? sanitizeMultiline(input.overview, 4000) : null);
    if (input.number !== undefined) set("number", input.number);
    if (input.runtime_sec !== undefined) set("runtime_sec", input.runtime_sec);
    if (input.air_date !== undefined) set("air_date", input.air_date);
    if (input.thumb_url !== undefined) set("thumb_url", input.thumb_url);
    if (input.video_url !== undefined) set("video_url", input.video_url);
    if (input.plan_access !== undefined) set("plan_access", input.plan_access); // ← חינם/פלוס לפרק
    if (input.status !== undefined) {
      set("status", input.status);
      if (input.status === "published") set("published_at", new Date().toISOString());
    }
    if (input.intro_start_sec !== undefined) set("intro_start_sec", input.intro_start_sec);
    if (input.intro_end_sec !== undefined) set("intro_end_sec", input.intro_end_sec);
    if (input.credits_start_sec !== undefined) set("credits_start_sec", input.credits_start_sec);
    if (input.is_premiere !== undefined) set("is_premiere", input.is_premiere ? 1 : 0);
    if (input.is_finale !== undefined) set("is_finale", input.is_finale ? 1 : 0);
    if (input.is_filler !== undefined) set("is_filler", input.is_filler ? 1 : 0);

    if (raw.video_asset_id) {
      set("video_asset_id", Number(raw.video_asset_id));
      run("UPDATE media_assets SET episode_id = ? WHERE id = ?", [id, Number(raw.video_asset_id)]);
    }

    if (!fields.length) return jsonOk({ message: "לא היו שינויים" }, undefined, ctx.req);

    set("updated_at", new Date().toISOString());
    run(`UPDATE episodes SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);

    writeAudit(
      {
        action: input.plan_access !== undefined && before.plan_access !== input.plan_access ? "episode.plan_change" : "episode.update",
        entity: "episode",
        entityId: id,
        before: { plan_access: before.plan_access, status: before.status },
        after: { plan_access: input.plan_access ?? before.plan_access, status: input.status ?? before.status },
      },
      { req: ctx.req, actorId: ctx.user!.id, actorEmail: ctx.user!.email },
    );

    return jsonOk({ id, message: "הפרק עודכן" }, undefined, ctx.req);
  },
);

/** מחיקת פרק (מרככת) */
export const DELETE = route<P>(
  { auth: "required", permission: "content.delete", audit: { action: "episode.delete", entity: "episode", severity: "warning" } },
  async (ctx) => {
    const id = Number(ctx.params.id);
    const ep = get<{ id: number; title_id: number; season_id: number }>("SELECT id, title_id, season_id FROM episodes WHERE id = ?", [id]);
    if (!ep) throw new ApiError("NOT_FOUND", 404);

    run("UPDATE episodes SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status = 'archived' WHERE id = ?", [id]);
    run("UPDATE titles SET episodes_count = (SELECT COUNT(*) FROM episodes WHERE title_id = ? AND deleted_at IS NULL) WHERE id = ?", [ep.title_id, ep.title_id]);
    run("UPDATE seasons SET episodes_count = (SELECT COUNT(*) FROM episodes WHERE season_id = ? AND deleted_at IS NULL) WHERE id = ?", [ep.season_id, ep.season_id]);

    return jsonOk({ deleted: id }, undefined, ctx.req);
  },
);
