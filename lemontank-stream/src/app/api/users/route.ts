import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { all, count } from "@/lib/db";
import { sanitizeText } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ניהול משתמשים — רשימה, חיפוש, סינון לפי מנוי/תפקיד/סטטוס */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "users.read" }, async (ctx) => {
    const sp = new URL(req.url).searchParams;
    const q = sanitizeText(sp.get("q") ?? "", 60);
    const plan = sp.get("plan");
    const role = sp.get("role");
    const status = sp.get("status");
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 25)));
    const offset = Math.max(0, Number(sp.get("offset") ?? 0));

    const where: string[] = ["u.deleted_at IS NULL"];
    const params: unknown[] = [];
    if (q) {
      where.push("(u.email LIKE ? OR u.name LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (plan) {
      where.push("u.plan_code = ?");
      params.push(plan);
    }
    if (role) {
      where.push("u.role = ?");
      params.push(role);
    }
    if (status) {
      where.push("u.status = ?");
      params.push(status);
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const items = all(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.plan_code, u.avatar_url, u.email_verified, u.twofa_enabled,
              u.created_at, u.last_login_at, u.last_login_ip, u.coins, u.referral_code,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS active_sessions,
              (SELECT COUNT(*) FROM watch_progress wp WHERE wp.user_id = u.id) AS watched_items
       FROM users u ${whereSql} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const total = count(`SELECT COUNT(*) c FROM users u ${whereSql}`, params);

    return jsonOk({ items, total, limit, offset }, undefined, req);
  });
}
