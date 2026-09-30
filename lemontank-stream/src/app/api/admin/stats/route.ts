import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { all, dbStats, get, parseJson } from "@/lib/db";
import { catalogStats } from "@/lib/catalog";
import { securitySummary } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** דשבורד הניהול: מדדי תוכן, משתמשים, הכנסות, אבטחה וצפיות */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "analytics.read" }, async (ctx) => {
    const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days") ?? 30)));
    const catalog = catalogStats();

    const revenue = get<{ total: number; month: number; count: number }>(
      `SELECT COALESCE(SUM(amount),0) total,
              COALESCE(SUM(CASE WHEN created_at > datetime('now','-30 day') THEN amount ELSE 0 END),0) month,
              COUNT(*) count
       FROM payments WHERE status = 'paid'`,
    );

    const usersByDay = all(
      `SELECT date(created_at) day, COUNT(*) count FROM users
       WHERE created_at > datetime('now', '-' || ? || ' day') AND deleted_at IS NULL
       GROUP BY day ORDER BY day`,
      [days],
    );

    const viewsByDay = all(
      `SELECT day, SUM(views) views, SUM(minutes) minutes FROM title_views_daily
       WHERE day > date('now','-' || ? || ' day') GROUP BY day ORDER BY day`,
      [days],
    );

    const topTitles = all(
      `SELECT t.id, t.slug, t.name_he, t.kind, t.plan_access, t.views_count,
              COALESCE(SUM(v.views),0) AS views_30d
       FROM titles t LEFT JOIN title_views_daily v ON v.title_id = t.id AND v.day > date('now','-30 day')
       WHERE t.deleted_at IS NULL GROUP BY t.id ORDER BY views_30d DESC, t.views_count DESC LIMIT 10`,
    );

    const planSplit = all("SELECT plan_code, COUNT(*) count FROM users WHERE deleted_at IS NULL GROUP BY plan_code");
    const watchTime = get<{ minutes: number }>(
      "SELECT COALESCE(SUM(duration_sec)/60,0) minutes FROM watch_progress WHERE updated_at > datetime('now','-30 day')",
    );
    const deviceSplit = all(
      "SELECT COALESCE(device_label,'לא ידוע') device, COUNT(*) count FROM sessions WHERE created_at > datetime('now','-30 day') GROUP BY device ORDER BY count DESC LIMIT 6",
    );

    const db = dbStats();
    const activeStreams = all<{ c: number }>(
      "SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL AND last_seen_at > datetime('now','-5 minute')",
    )[0]?.c ?? 0;

    const recentAudit = all(
      "SELECT action, entity, entity_id, severity, actor_email, created_at FROM audit_log ORDER BY id DESC LIMIT 15",
    );

    const flags = all<{ key: string; enabled: number }>("SELECT key, enabled FROM feature_flags");

    return jsonOk(
      {
        catalog,
        revenue: { total: Number(revenue?.total ?? 0), month: Number(revenue?.month ?? 0), payments: Number(revenue?.count ?? 0) },
        usersByDay,
        viewsByDay,
        topTitles,
        planSplit,
        watchMinutes30d: Math.round(Number(watchTime?.minutes ?? 0)),
        deviceSplit,
        security: securitySummary(),
        activeStreams: Number(activeStreams),
        db: { driver: db.driver, sizeBytes: db.sizeBytes, tables: db.tableCount, journal: db.settings.journalMode, file: db.file },
        recentAudit: recentAudit.map((r) => ({ ...(r as Record<string, unknown>), detail: parseJson((r as { after_json?: string }).after_json, null) })),
        featureFlagsCount: flags.length,
        generatedAt: new Date().toISOString(),
      },
      undefined,
      req,
    );
  });
}
