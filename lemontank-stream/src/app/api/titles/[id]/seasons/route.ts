import { route } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { seasonSchema, sanitizeText, sanitizeMultiline } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };

/** עונות של סדרה (האדמין מנהל מכאן את העונות) */
export const GET = route<P>({ auth: "required", permission: "content.read" }, async (ctx) => {
  const titleId = Number(ctx.params.id);
  const seasons = all<Record<string, unknown>>(
    `SELECT s.*, (SELECT COUNT(*) FROM episodes e WHERE e.season_id = s.id AND e.deleted_at IS NULL) AS episodes_count
     FROM seasons s WHERE s.title_id = ? ORDER BY s.number`,
    [titleId],
  );
  return jsonOk({ seasons }, undefined, ctx.req);
});

/** הוספת עונה חדשה */
export const POST = route<P>(
  { auth: "required", permission: "content.create", rateLimit: "write", audit: { action: "season.create", entity: "season" } },
  async (ctx) => {
    const titleId = Number(ctx.params.id);
    const title = get<{ id: number; kind: string; seasons_count: number }>(
      "SELECT id, kind, seasons_count FROM titles WHERE id = ? AND deleted_at IS NULL",
      [titleId],
    );
    if (!title) throw new ApiError("NOT_FOUND", 404, undefined, "הסדרה לא נמצאה");
    if (title.kind !== "series") throw new ApiError("BAD_REQUEST", 400, undefined, "אפשר להוסיף עונות רק לסדרות");

    const body = await ctx.body<Record<string, unknown>>();
    const input = seasonSchema.parse({ ...body, title_id: titleId });

    const dup = get<{ id: number }>("SELECT id FROM seasons WHERE title_id = ? AND number = ?", [titleId, input.number]);
    if (dup) throw new ApiError("CONFLICT", 409, undefined, `עונה ${input.number} כבר קיימת`);

    const res = run(
      `INSERT INTO seasons(title_id, number, name_he, overview, poster_url, year, plan_access)
       VALUES(?,?,?,?,?,?,?)`,
      [
        titleId,
        input.number,
        input.name_he ? sanitizeText(input.name_he, 160) : `עונה ${input.number}`,
        input.overview ? sanitizeMultiline(input.overview, 3000) : null,
        input.poster_url ?? null,
        input.year ?? null,
        input.plan_access,
      ],
    );

    run("UPDATE titles SET seasons_count = (SELECT COUNT(*) FROM seasons WHERE title_id = ?) WHERE id = ?", [titleId, titleId]);

    return jsonOk({ id: Number(res.lastInsertRowid), message: `עונה ${input.number} נוצרה` }, { status: 201 }, ctx.req);
  },
);
