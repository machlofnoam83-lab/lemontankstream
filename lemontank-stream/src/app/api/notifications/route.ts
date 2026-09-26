import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { all, run } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** מרכז ההתראות של המשתמש */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const items = all(
      "SELECT id, kind, title, body, link, image_url, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100",
      [ctx.user!.id],
    );
    const unread = all<{ c: number }>("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL", [ctx.user!.id])[0]?.c ?? 0;
    return jsonOk({ items, unread: Number(unread) }, undefined, req);
  });
}

/** סימון כנקרא (אחד או הכל) */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const body = await ctx.body<{ id?: number; all?: boolean }>().catch(() => ({}) as { id?: number; all?: boolean });
    if (body?.all) {
      const changes = run("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND read_at IS NULL", [ctx.user!.id]).changes;
      return jsonOk({ marked: changes }, undefined, req);
    }
    if (body?.id) {
      run("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?", [body.id, ctx.user!.id]);
      return jsonOk({ marked: 1 }, undefined, req);
    }
    return jsonOk({ marked: 0 }, undefined, req);
  });
}
