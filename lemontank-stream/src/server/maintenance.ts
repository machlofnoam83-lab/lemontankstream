/**
 * משימות תחזוקה — ניקוי תקופתי של נתונים זמניים, סשנים ואירועי אנליטיקה ישנים.
 * ניתן להריץ ידנית מהפאנל או ממשימת cron חיצונית (ראו DEPLOY.md).
 */

import { run, tx } from "@/lib/db";
import { pruneRateLimits } from "@/lib/ratelimit";
import { pruneSessions } from "@/lib/session";

/** ניקוי חלונות rate limit ואסימונים שפגו */
export function pruneCsrfSafe(): number {
  const tokens = run(
    "DELETE FROM auth_tokens WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 day') OR used_at IS NOT NULL AND used_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 day')",
  ).changes;
  return tokens;
}

export type MaintenanceReport = {
  sessions: number;
  rateLimits: number;
  tokens: number;
  analytics: number;
  notifications: number;
  downloadsExpired: number;
  partiesEnded: number;
  gamesOld: number;
};

/** ריצת תחזוקה מלאה — בטוחה להרצה חוזרת */
export function runMaintenance(opts: { analyticsDays?: number } = {}): MaintenanceReport {
  const analyticsDays = Math.min(730, Math.max(7, opts.analyticsDays ?? 180));

  return tx(() => {
    const sessions = pruneSessions();
    const rateLimits = pruneRateLimits();
    const tokens = pruneCsrfSafe();
    const analytics = run("DELETE FROM analytics_events WHERE created_at < datetime('now', '-' || ? || ' day')", [analyticsDays]).changes;
    const notifications = run(
      "DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < datetime('now','-90 day')",
    ).changes;
    const downloadsExpired = run("DELETE FROM downloads WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").changes;
    const partiesEnded = run("DELETE FROM watch_parties WHERE ends_at IS NOT NULL AND ends_at < datetime('now')").changes;

    return { sessions, rateLimits, tokens, analytics, notifications, downloadsExpired, partiesEnded, gamesOld: 0 };
  });
}

/**
 * אופטימיזציה של מסד SQLite: VACUUM מקטין את הקובץ, ANALYZE משפר תוכניות שאילתה.
 * לא רץ בתוך טרנזקציה (דרישת SQLite).
 */
export function optimizeDb(): { vacuumed: boolean; analyzed: boolean } {
  let vacuumed = false;
  let analyzed = false;
  try {
    run("PRAGMA wal_checkpoint(TRUNCATE)");
    run("VACUUM");
    vacuumed = true;
  } catch {
    /* מסקיפט SQLite — ממשיכים */
  }
  try {
    run("ANALYZE");
    analyzed = true;
  } catch {
    /* ignore */
  }
  return { vacuumed, analyzed };
}
