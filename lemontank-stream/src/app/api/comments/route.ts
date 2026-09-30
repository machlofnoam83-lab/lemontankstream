import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { commentSchema, sanitizeMultiline } from "@/lib/validate";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** תגובות לכותר/פרק (כולל תשובות) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const sp = new URL(req.url).searchParams;
    const titleId = sp.get("title_id") ? Number(sp.get("title_id")) : null;
    const episodeId = sp.get("episode_id") ? Number(sp.get("episode_id")) : null;
    if (!titleId && !episodeId) throw new ApiError("BAD_REQUEST", 400, undefined, "צריך title_id או episode_id");

    const rows = all(
      `SELECT c.id, c.body, c.created_at, c.likes, c.parent_id, u.name AS user_name, u.avatar_url,
              u.plan_code AS user_plan
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.status = 'approved' AND (c.title_id IS ? OR c.episode_id IS ?)
       ORDER BY c.created_at DESC LIMIT 200`,
      [titleId, episodeId],
    );
    void ctx;
    return jsonOk({ items: rows }, undefined, req);
  });
}

/** כתיבת תגובה חדשה */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "comment" }, async (ctx) => {
    const settings = getSettings();
    if (!settings.comments_enabled) throw new ApiError("FORBIDDEN", 403, undefined, "התגובות מושבתות כרגע");

    const input = commentSchema.parse(await ctx.body<Record<string, unknown>>());
    if (!input.title_id && !input.episode_id) throw new ApiError("BAD_REQUEST", 400, undefined, "צריך לשייך את התגובה לתוכן");
    if (input.parent_id) {
      const parent = get<{ id: number }>("SELECT id FROM comments WHERE id = ? AND status='approved'", [input.parent_id]);
      if (!parent) throw new ApiError("NOT_FOUND", 404, undefined, "התגובה שאליה הגבת לא נמצאה");
    }

    const res = run(
      "INSERT INTO comments(user_id, title_id, episode_id, parent_id, body) VALUES(?,?,?,?,?)",
      [ctx.user!.id, input.title_id ?? null, input.episode_id ?? null, input.parent_id ?? null, sanitizeMultiline(input.body, 1500)],
    );

    return jsonOk({ id: Number(res.lastInsertRowid), message: "התגובה פורסמה" }, { status: 201 }, req);
  });
}

/** מחיקת תגובה של עצמך (או של צוות) */
export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const body = await ctx.body<{ id?: number }>();
    const id = Number(body?.id ?? 0);
    const row = get<{ id: number; user_id: number }>("SELECT id, user_id FROM comments WHERE id = ?", [id]);
    if (!row) throw new ApiError("NOT_FOUND", 404);

    const isStaffUser = ["editor", "admin", "owner"].includes(ctx.user!.role);
    if (row.user_id !== ctx.user!.id && !isStaffUser) throw new ApiError("FORBIDDEN", 403);

    run("DELETE FROM comments WHERE id = ?", [id]);
    return jsonOk({ deleted: id }, undefined, req);
  });
}
