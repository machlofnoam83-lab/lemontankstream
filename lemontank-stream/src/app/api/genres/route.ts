import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { genreSchema, sanitizeText, slugify } from "@/lib/validate";
import { GENRE_ICONS } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ז'אנרים + כמה כותרים יש בכל אחד */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const items = all(
      `SELECT g.id, g.slug, g.name_he, g.icon, g.color, g.sort,
              (SELECT COUNT(*) FROM title_genres tg JOIN titles t ON t.id = tg.title_id
                WHERE tg.genre_id = g.id AND t.status='published' AND t.deleted_at IS NULL) AS titles_count
       FROM genres g ORDER BY g.sort, g.name_he`,
    );
    void ctx;
    return jsonOk({ items }, undefined, req);
  });
}

/** יצירת ז'אנר */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.create", audit: { action: "genre.create", entity: "genre" } }, async (ctx) => {
    const input = genreSchema.parse(await ctx.body<Record<string, unknown>>());
    const slug = slugify(input.slug || input.name_he);
    if (get<{ id: number }>("SELECT id FROM genres WHERE slug = ?", [slug])) throw new ApiError("CONFLICT", 409, undefined, "הז'אנר כבר קיים");

    const res = run("INSERT INTO genres(slug, name_he, icon, color, sort) VALUES(?,?,?,?,?)", [
      slug,
      sanitizeText(input.name_he, 40),
      input.icon ?? GENRE_ICONS[slug] ?? "🎬",
      input.color,
      input.sort,
    ]);
    return jsonOk({ id: Number(res.lastInsertRowid), slug }, { status: 201 }, req);
  });
}

/** עדכון ז'אנר */
export async function PATCH(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.update", audit: { action: "genre.update", entity: "genre" } }, async (ctx) => {
    const body = await ctx.body<{ id?: number } & Record<string, unknown>>();
    const id = Number(body.id ?? 0);
    const input = genreSchema.partial().parse(body);
    if (!get<{ id: number }>("SELECT id FROM genres WHERE id = ?", [id])) throw new ApiError("NOT_FOUND", 404);

    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.name_he !== undefined) {
      fields.push("name_he = ?");
      values.push(sanitizeText(input.name_he, 40));
    }
    if (input.icon !== undefined) {
      fields.push("icon = ?");
      values.push(input.icon);
    }
    if (input.color !== undefined) {
      fields.push("color = ?");
      values.push(input.color);
    }
    if (input.sort !== undefined) {
      fields.push("sort = ?");
      values.push(input.sort);
    }
    if (fields.length) run(`UPDATE genres SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);

    return jsonOk({ id, message: "הז'אנר עודכן" }, undefined, req);
  });
}

/** מחיקת ז'אנר (מסיר גם שיוכים) */
export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "content.delete", audit: { action: "genre.delete", entity: "genre", severity: "warning" } }, async (ctx) => {
    const body = await ctx.body<{ id?: number }>();
    const id = Number(body?.id ?? 0);
    run("DELETE FROM genres WHERE id = ?", [id]);
    return jsonOk({ deleted: id }, undefined, req);
  });
}
