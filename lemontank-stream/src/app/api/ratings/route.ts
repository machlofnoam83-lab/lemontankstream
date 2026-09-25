import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { get, run } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ title_id: z.coerce.number().int().positive(), stars: z.coerce.number().int().min(1).max(10) });

/** דירוג כותר 1–10; מחשב מחדש את הממוצע ומעדכן את הכותר */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const userId = ctx.user!.id;

    run(
      `INSERT INTO ratings(user_id, title_id, stars) VALUES(?,?,?)
       ON CONFLICT(user_id, title_id) DO UPDATE SET stars = excluded.stars`,
      [userId, input.title_id, input.stars],
    );

    const agg = get<{ avg: number; cnt: number }>("SELECT AVG(stars) avg, COUNT(*) cnt FROM ratings WHERE title_id = ?", [input.title_id]);
    const avg100 = get<{ avg: number }>(
      "SELECT AVG((position_sec / NULLIF(duration_sec,0)) * 100) avg FROM watch_progress WHERE title_id = ? AND completed = 1",
      [input.title_id],
    );
    const combined = ((Number(agg?.avg ?? 0) * 0.75) + (Number(avg100?.avg ?? 0) / 10 * 0.25)).toFixed(2);

    run("UPDATE titles SET rating_site = ?, votes_count = ? WHERE id = ?", [Number(combined), Number(agg?.cnt ?? 0), input.title_id]);

    return jsonOk({ stars: input.stars, average: Number(combined), votes: Number(agg?.cnt ?? 0) }, undefined, req);
  });
}
