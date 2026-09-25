import { route } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run, tx } from "@/lib/db";
import { collectionSchema, sanitizeText, sanitizeMultiline } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };

/** עדכון אוסף, כולל סדר הפריטים בו */
export const PATCH = route<P>(
  { auth: "required", permission: "content.update", audit: { action: "collection.update", entity: "collection" } },
  async (ctx) => {
    const id = Number(ctx.params.id);
    if (!get<{ id: number }>("SELECT id FROM collections WHERE id = ?", [id])) throw new ApiError("NOT_FOUND", 404);

    const raw = await ctx.body<{ items?: number[] } & Record<string, unknown>>();
    const input = collectionSchema.partial().parse(raw);

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (c: string, v: unknown) => {
      fields.push(`${c} = ?`);
      values.push(v);
    };
    if (input.name_he !== undefined) set("name_he", sanitizeText(input.name_he, 80));
    if (input.description !== undefined) set("description", input.description ? sanitizeMultiline(input.description, 500) : null);
    if (input.cover_url !== undefined) set("cover_url", input.cover_url);
    if (input.layout !== undefined) set("layout", input.layout);
    if (input.plan_access !== undefined) set("plan_access", input.plan_access);
    if (input.is_public !== undefined) set("is_public", input.is_public ? 1 : 0);
    if (input.rule_json !== undefined) set("rule_json", input.rule_json);
    if (input.sort_order !== undefined) set("sort_order", input.sort_order);

    tx(() => {
      if (fields.length) run(`UPDATE collections SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
      if (Array.isArray(raw.items)) {
        run("DELETE FROM collection_titles WHERE collection_id = ?", [id]);
        raw.items.slice(0, 200).forEach((titleId, index) => {
          run("INSERT OR IGNORE INTO collection_titles(collection_id, title_id, sort_order) VALUES(?,?,?)", [id, Number(titleId), index]);
        });
      }
    });

    return jsonOk({ id, message: "האוסף עודכן" }, undefined, ctx.req);
  },
);

/** מחיקת אוסף */
export const DELETE = route<P>(
  { auth: "required", permission: "content.delete", audit: { action: "collection.delete", entity: "collection", severity: "warning" } },
  async (ctx) => {
    const id = Number(ctx.params.id);
    run("DELETE FROM collections WHERE id = ?", [id]);
    void all;
    return jsonOk({ deleted: id }, undefined, ctx.req);
  },
);
