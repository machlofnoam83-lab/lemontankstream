import { route } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { get, run } from "@/lib/db";
import { seasonSchema, sanitizeText, sanitizeMultiline } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };

/** עדכון עונה (שם, תיאור, תמונה, הרשאת חינם/פלוס) */
export const PATCH = route<P>(
  { auth: "required", permission: "content.update", rateLimit: "write", audit: { action: "season.update", entity: "season" } },
  async (ctx) => {
    const id = Number(ctx.params.id);
    const before = get<{ id: number; title_id: number }>("SELECT id, title_id FROM seasons WHERE id = ?", [id]);
    if (!before) throw new ApiError("NOT_FOUND", 404);

    const raw = await ctx.body<Record<string, unknown>>();
    const input = seasonSchema.partial().parse(raw);

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (c: string, v: unknown) => {
      fields.push(`${c} = ?`);
      values.push(v);
    };

    if (input.name_he !== undefined) set("name_he", input.name_he ? sanitizeText(input.name_he, 160) : null);
    if (input.overview !== undefined) set("overview", input.overview ? sanitizeMultiline(input.overview, 3000) : null);
    if (input.poster_url !== undefined) set("poster_url", input.poster_url);
    if (input.year !== undefined) set("year", input.year);
    if (input.number !== undefined) set("number", input.number);
    if (input.plan_access !== undefined) set("plan_access", input.plan_access);

    if (!fields.length) return jsonOk({ message: "לא היו שינויים" }, undefined, ctx.req);

    set("updated_at", new Date().toISOString());
    run(`UPDATE seasons SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);

    return jsonOk({ id, message: "העונה עודכנה" }, undefined, ctx.req);
  },
);

/** מחיקת עונה וכל הפרקים שבה */
export const DELETE = route<P>(
  { auth: "required", permission: "content.delete", audit: { action: "season.delete", entity: "season", severity: "warning" } },
  async (ctx) => {
    const id = Number(ctx.params.id);
    const season = get<{ id: number; title_id: number; number: number }>("SELECT id, title_id, number FROM seasons WHERE id = ?", [id]);
    if (!season) throw new ApiError("NOT_FOUND", 404);

    const count = get<{ c: number }>("SELECT COUNT(*) c FROM seasons WHERE title_id = ?", [season.title_id])?.c ?? 0;
    if (count <= 1) throw new ApiError("BAD_REQUEST", 400, undefined, "אי אפשר למחוק את העונה היחידה — מחק את הסדרה עצמה");

    run("DELETE FROM episodes WHERE season_id = ?", [id]);
    run("DELETE FROM seasons WHERE id = ?", [id]);
    run("UPDATE titles SET seasons_count = (SELECT COUNT(*) FROM seasons WHERE title_id = ?), episodes_count = (SELECT COUNT(*) FROM episodes WHERE title_id = ? AND deleted_at IS NULL) WHERE id = ?", [
      season.title_id, season.title_id, season.title_id,
    ]);

    return jsonOk({ deleted: id }, undefined, ctx.req);
  },
);
