import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { all, count, get } from "@/lib/db";
import { securitySummary } from "@/lib/audit";
import { pruneRateLimits } from "@/lib/ratelimit";
import { optimizeDb, pruneCsrfSafe, runMaintenance } from "@/server/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** לוח בקרת האבטחה: אירועים, ניסיונות התחברות, סשנים חשודים, חסימות */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "security.read" }, async (ctx) => {
    const summary = securitySummary();

    const events = all(
      `SELECT id, kind, severity, ip, user_id, detail, created_at FROM security_events ORDER BY id DESC LIMIT 100`,
    );

    const bySeverity = all<{ severity: string; c: number }>(
      "SELECT severity, COUNT(*) c FROM security_events WHERE created_at > datetime('now','-7 day') GROUP BY severity",
    );

    const failedLogins = all(
      `SELECT email_norm, ip, reason, created_at FROM login_attempts
       WHERE success = 0 ORDER BY id DESC LIMIT 60`,
    );

    const lockedAccounts = all(
      `SELECT id, email, name, failed_logins, locked_until FROM users
       WHERE locked_until IS NOT NULL AND locked_until > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    );

    const topIps = all(
      `SELECT ip, COUNT(*) hits, COUNT(DISTINCT kind) kinds FROM security_events
       WHERE created_at > datetime('now','-1 day') AND ip IS NOT NULL GROUP BY ip ORDER BY hits DESC LIMIT 15`,
    );

    const suspiciousSessions = all(
      `SELECT s.id, s.user_id, u.email, s.ip, s.user_agent, s.created_at, s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.revoked_at IS NULL AND s.created_at > datetime('now','-7 day')
       ORDER BY s.created_at DESC LIMIT 40`,
    );

    const stats = {
      totalEvents: count("SELECT COUNT(*) c FROM security_events"),
      critical7d: count("SELECT COUNT(*) c FROM security_events WHERE severity='critical' AND created_at > datetime('now','-7 day')"),
      csrfFailures24h: count("SELECT COUNT(*) c FROM security_events WHERE kind LIKE 'csrf%' AND created_at > datetime('now','-1 day')"),
      rateLimit24h: count("SELECT COUNT(*) c FROM security_events WHERE kind LIKE 'rate_limit%' AND created_at > datetime('now','-1 day')"),
      attackPatterns24h: count("SELECT COUNT(*) c FROM security_events WHERE kind LIKE 'attack_pattern%' AND created_at > datetime('now','-1 day')"),
      activeSessions: summary.activeSessions,
      failedLogins24h: summary.failedLogins,
      twoFactorUsers: count("SELECT COUNT(*) c FROM users WHERE twofa_enabled = 1"),
      adminsWithout2fa: count("SELECT COUNT(*) c FROM users WHERE role IN ('admin','owner') AND twofa_enabled = 0 AND deleted_at IS NULL"),
      dbIntegrity: get<{ integrity_check: string }>("PRAGMA integrity_check")?.integrity_check ?? "unknown",
      foreignKeyViolations: all("PRAGMA foreign_key_check").length,
    };

    return jsonOk({ summary, events, bySeverity, failedLogins, lockedAccounts, topIps, suspiciousSessions, stats }, undefined, req);
  });
}

/** פעולות תחזוקה ואבטחה (בעלים בלבד) */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "security.manage", audit: { action: "security.breach_scan", severity: "warning" } }, async (ctx) => {
    const parsed = await ctx.body<{ action?: string }>().catch(() => ({}) as { action?: string });
    const action = String(parsed?.action ?? "maintenance");

    if (action === "prune") {
      const limits = pruneRateLimits();
      const csrf = pruneCsrfSafe();
      return jsonOk({ pruned: { rateLimits: limits, sessions: csrf } }, undefined, req);
    }

    if (action === "rescan") {
      const integrity = get<{ integrity_check: string }>("PRAGMA integrity_check")?.integrity_check;
      const fk = all("PRAGMA foreign_key_check");
      const orphanSessions = count(
        "SELECT COUNT(*) c FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL",
      );
      return jsonOk({ integrity, foreignKeyViolations: fk.length, orphanSessions }, undefined, req);
    }

    if (action === "maintenance") {
      const report = runMaintenance();
      return jsonOk({ report, message: "תחזוקה הורצה" }, undefined, req);
    }

    if (action === "optimize") {
      const result = optimizeDb();
      return jsonOk({ result, message: "המסד עבר אופטימיזציה" }, undefined, req);
    }

    return jsonOk({ ok: true }, undefined, req);
  });
}
