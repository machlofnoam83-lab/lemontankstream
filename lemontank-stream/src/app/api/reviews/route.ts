import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { syncBadges } from "@/lib/gamification";
import { jsonOk, ApiError } from "@/lib/http";
import { all, run } from "@/lib/db";
import { reviewSchema, sanitizeMultiline, sanitizeText } from "@/lib/validate";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ביקורות על כותר */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const sp = new URL(req.url).searchParams;
    const titleId = Number(sp.get("title_id") ?? 0);
    if (!titleId) throw new ApiError("BAD_REQUEST", 400);

    const items = all(
      `SELECT r.id, r.headline, r.body, r.stars, r.has_spoilers, r.likes, r.created_at,
              u.name AS user_name, u.avatar_url, u.plan_code
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.title_id = ? AND r.status = 'approved'
       ORDER BY r.likes DESC, r.created_at DESC LIMIT 50`,
      [titleId],
    );
    void ctx;
    return jsonOk({ items }, undefined, req);
  });
}

/** כתיבת ביקורת (אופציונלי: דורש אישור מנהל) */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const settings = getSettings();
    const input = reviewSchema.parse(await ctx.body<Record<string, unknown>>());

    const status = settings.reviews_require_approval ? "pending" : "approved";
    const res = run(
      `INSERT INTO reviews(user_id, title_id, headline, body, stars, has_spoilers, status)
       VALUES(?,?,?,?,?,?,?)`,
      [
        ctx.user!.id,
        input.title_id,
        input.headline ? sanitizeText(input.headline, 120) : null,
        sanitizeMultiline(input.body, 4000),
        input.stars ?? null,
        input.has_spoilers ? 1 : 0,
        status,
      ],
    );

    try {
      syncBadges(ctx.user!.id);
    } catch {
      /* ignore */
    }
    return jsonOk(
      { id: Number(res.lastInsertRowid), status, message: status === "pending" ? "הביקורת נשלחה לאישור" : "הביקורת פורסמה" },
      { status: 201 },
      req,
    );
  });
}
