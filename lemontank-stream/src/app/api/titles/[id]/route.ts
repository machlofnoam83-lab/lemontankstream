import { route } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { get, run, tx } from "@/lib/db";
import { getTitleById } from "@/lib/catalog";
import { titleSchema, sanitizeText, sanitizeMultiline } from "@/lib/validate";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };

/** שליפת כותר בודד (כולל טיוטות לצוות) */
export const GET = route<P>({ auth: "required", permission: "content.read" }, async (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isFinite(id)) throw new ApiError("BAD_REQUEST", 400, undefined, "מזהה לא תקין");
  const item = getTitleById(id);
  if (!item) throw new ApiError("NOT_FOUND", 404);
  return jsonOk({ item }, undefined, ctx.req);
});

/** עדכון כותר — כולל ההחלטה אם הוא חינם או פלוס */
export const PATCH = route<P>(
  { auth: "required", permission: "content.update", rateLimit: "write", parseBody: true },
  async (ctx) => {
    const id = Number(ctx.params.id);
    const before = get<Record<string, unknown>>("SELECT * FROM titles WHERE id = ? AND deleted_at IS NULL", [id]);
    if (!before) throw new ApiError("NOT_FOUND", 404);

    const raw = await ctx.body<Record<string, unknown>>();
    // חלקי: מאפשרים עדכון שדות בודדים מהפאנל
    const input = titleSchema.partial().parse(raw);
    const staff = ctx.user!;

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, val: unknown) => {
      fields.push(`${col} = ?`);
      values.push(val);
    };

    if (input.name_he !== undefined) set("name_he", sanitizeText(input.name_he, 160));
    if (input.name_en !== undefined) set("name_en", input.name_en ? sanitizeText(input.name_en, 160) : null);
    if (input.slug !== undefined && input.slug) set("slug", sanitizeText(input.slug, 120));
    if (input.tagline !== undefined) set("tagline", input.tagline ? sanitizeText(input.tagline, 200) : null);
    if (input.overview !== undefined) set("overview", input.overview ? sanitizeMultiline(input.overview, 6000) : null);
    if (input.year !== undefined) set("year", input.year);
    if (input.release_date !== undefined) set("release_date", input.release_date);
    if (input.runtime_min !== undefined) set("runtime_min", input.runtime_min);
    if (input.maturity !== undefined) {
      set("maturity", input.maturity);
      set("age_rating_age", Number(String(input.maturity).replace("+", "")) || 0);
    }
    if (input.director !== undefined) set("director", input.director ? sanitizeText(input.director, 160) : null);
    if (input.cast_text !== undefined) set("cast_text", input.cast_text ? sanitizeText(input.cast_text, 1000) : null);
    if (input.poster_url !== undefined) set("poster_url", input.poster_url);
    if (input.backdrop_url !== undefined) set("backdrop_url", input.backdrop_url);
    if (input.trailer_url !== undefined) set("trailer_url", input.trailer_url);
    if (input.color !== undefined) set("color", input.color);
    if (input.plan_access !== undefined) set("plan_access", input.plan_access); // ← חינם/פלוס
    if (input.status !== undefined) {
      set("status", input.status);
      if (input.status === "published") set("published_at", new Date().toISOString());
    }
    if (input.is_featured !== undefined) set("is_featured", input.is_featured ? 1 : 0);
    if (input.is_original !== undefined) set("is_original", input.is_original ? 1 : 0);
    if (input.is_downloadable !== undefined) set("is_downloadable", input.is_downloadable ? 1 : 0);
    if (input.quality_max !== undefined) set("quality_max", input.quality_max);
    if (input.rating_imdb !== undefined) set("rating_imdb", input.rating_imdb);
    if (input.keywords !== undefined) set("keywords", input.keywords ? sanitizeText(input.keywords, 500) : null);
    if (input.seo_title !== undefined) set("seo_title", input.seo_title ? sanitizeText(input.seo_title, 200) : null);
    if (input.seo_description !== undefined) set("seo_description", input.seo_description ? sanitizeText(input.seo_description, 400) : null);

    if (fields.length) {
      set("updated_by", staff.id);
      tx(() => {
        run(`UPDATE titles SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
        if (input.genres !== undefined) {
          run("DELETE FROM title_genres WHERE title_id = ?", [id]);
          for (const g of input.genres ?? []) run("INSERT OR IGNORE INTO title_genres(title_id, genre_id) VALUES(?,?)", [id, g]);
        }
      });
    }

    const after = get<Record<string, unknown>>("SELECT * FROM titles WHERE id = ?", [id]);
    writeAudit(
      {
        action: input.plan_access !== undefined && before.plan_access !== input.plan_access ? "title.plan_change" : input.status !== undefined && before.status !== input.status ? "title.publish" : "title.update",
        entity: "title",
        entityId: id,
        before: { plan_access: before.plan_access, status: before.status },
        after: { plan_access: after?.plan_access, status: after?.status },
      },
      { req: ctx.req, actorId: staff.id, actorEmail: staff.email },
    );

    return jsonOk({ item: getTitleById(id), message: "הכותר עודכן" }, undefined, ctx.req);
  },
);

/** מחיקה רכה של כותר בודד */
export const DELETE = route<P>(
  { auth: "required", permission: "content.delete", audit: { action: "title.delete", entity: "title", severity: "warning" } },
  async (ctx) => {
    const id = Number(ctx.params.id);
    const existing = get<{ id: number; name_he: string }>("SELECT id, name_he FROM titles WHERE id = ?", [id]);
    if (!existing) throw new ApiError("NOT_FOUND", 404);

    run("UPDATE titles SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status='archived' WHERE id = ?", [id]);
    run("UPDATE episodes SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE title_id = ?", [id]);

    return jsonOk({ deleted: id, name: existing.name_he }, undefined, ctx.req);
  },
);
