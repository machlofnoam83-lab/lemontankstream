import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run, tx } from "@/lib/db";
import { collectionSchema, sanitizeText, sanitizeMultiline, slugify } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** אוספים (שורות תוכן) — ציבורי לתצוגה, יצירה למורשים */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const withItems = new URL(req.url).searchParams.get("withItems") === "1";
    const collections = all(
      `SELECT id, slug, name_he, description, cover_url, layout, plan_access, is_public, is_auto, rule_json, sort_order
       FROM collections ORDER BY sort_order, id`,
    );
    if (!withItems) return jsonOk({ collections }, undefined, req);

    const enriched = collections.map((c) => {
      const col = c as { id: number };
      const items = all(
        `SELECT t.id, t.slug, t.name_he, t.kind, t.poster_url, t.plan_access, t.year, t.rating_imdb, t.backdrop_url, t.color
         FROM collection_titles ct JOIN titles t ON t.id = ct.title_id
         WHERE ct.collection_id = ? AND t.deleted_at IS NULL ORDER BY ct.sort_order LIMIT 50`,
        [col.id],
      );
      return { ...c, items };
    });
    void ctx;
    return jsonOk({ collections: enriched }, undefined, req);
  });
}

/** יצירת אוסף חדש */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", permission: "content.create", audit: { action: "collection.create", entity: "collection" } },
    async (ctx) => {
      const input = collectionSchema.parse(await ctx.body<Record<string, unknown>>());
      const slug = slugify(input.slug || input.name_he);

      const id = tx(() => {
        const res = run(
          `INSERT INTO collections(slug, name_he, description, cover_url, layout, plan_access, is_public, is_auto, rule_json, sort_order, created_by)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          [
            get<{ id: number }>("SELECT id FROM collections WHERE slug = ?", [slug]) ? `${slug}-${Date.now().toString(36).slice(-4)}` : slug,
            sanitizeText(input.name_he, 80),
            input.description ? sanitizeMultiline(input.description, 500) : null,
            input.cover_url ?? null,
            input.layout,
            input.plan_access,
            input.is_public ? 1 : 0,
            0,
            input.rule_json ?? null,
            input.sort_order,
            ctx.user!.id,
          ],
        );
        return Number(res.lastInsertRowid);
      });

      return jsonOk({ id, message: "האוסף נוצר" }, { status: 201 }, req);
    },
  );
}
