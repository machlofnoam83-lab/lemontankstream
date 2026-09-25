/**
 * חסימות IP בשכבת האפליקציה.
 *
 * אותו מחסן בדיוק כמו security/store.mjs (שקורא לפני Next), אבל דרך שכבת
 * המסד של האתר — כדי שנקודות API יוכלו לחסום, לקרוא ולוג את אותה טבלה.
 *
 * כלל ברזל: הנוסחה של משך החסימה זהה בשני הצדדים, ויש בדיקת יחידה שמשווה
 * ביניהם (tests/security.test.mjs) כדי שלא יתפצלו בטעות.
 */

import { all, get, run } from "@/lib/db";

export type BanSeverity = "info" | "warning" | "critical";

export const BAN_TTL: Record<string, number> = {
  honeypot: 86_400,
  sqli: 7_200,
  rce: 43_200,
  traversal: 21_600,
  xss: 3_600,
  ssti: 21_600,
  xxe: 21_600,
  ssrf: 10_800,
  crlf: 10_800,
  nosqli: 10_800,
  ldapi: 3_600,
  malformed: 3_600,
  probe: 43_200,
  tool: 10_800,
  spoof: 3_600,
  brute: 3_600,
  flood: 1_800,
  threat: 86_400,
  manual: 86_400,
};

const MAX_TTL = 2_592_000; // 30 יום

/** משך חסימה אפקטיבי — כל סטרייק מכפיל (עד 30 יום) */
export function banTtlSeconds(category: string, strikes = 1): number {
  const base = BAN_TTL[category] ?? BAN_TTL.threat;
  const factor = 2 ** Math.max(0, Math.min(strikes - 1, 10));
  return Math.min(MAX_TTL, base * factor);
}

export type BanRecord = {
  id: number;
  ip: string;
  reason: string;
  category: string;
  severity: string;
  strikes: number;
  hits: number;
  path: string | null;
  method: string | null;
  user_agent: string | null;
  action: string | null;
  auto: number;
  permanent: number;
  created_at: string;
  expires_at: string | null;
  lifted_at: string | null;
  lifted_by: string | null;
};

const ACTIVE = "(lifted_at IS NULL AND (permanent = 1 OR expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))";

/** האם ה-IP חסום כעת */
export function findActiveBan(ip: string | null | undefined): BanRecord | null {
  if (!ip) return null;
  return (
    get<BanRecord>(`SELECT * FROM ip_bans WHERE ip = ? AND ${ACTIVE} ORDER BY id DESC LIMIT 1`, [ip]) ?? null
  );
}

export function listActiveBans(limit = 100): BanRecord[] {
  return all<BanRecord>(`SELECT * FROM ip_bans WHERE ${ACTIVE} ORDER BY id DESC LIMIT ?`, [Math.min(500, limit)]);
}

export function listBanHistory(limit = 100): BanRecord[] {
  return all<BanRecord>("SELECT * FROM ip_bans ORDER BY id DESC LIMIT ?", [Math.min(500, limit)]);
}

/**
 * חסימת כתובת (עם החמרה בחזרה). מחזיר את זמן החסימה בשניות.
 * זהה לוגית ל-store.ban שבצד ה-JavaScript.
 */
export function banIp(input: {
  ip: string;
  category?: string;
  reason?: string;
  severity?: BanSeverity;
  path?: string | null;
  method?: string | null;
  userAgent?: string | null;
  action?: string | null;
  auto?: boolean;
  permanent?: boolean;
  ttlSec?: number | null;
}): { id: number; strikes: number; ttlSec: number | null; escalated: boolean } | null {
  const { ip } = input;
  if (!ip) return null;
  const category = input.category ?? "manual";

  try {
    const current = findActiveBan(ip);
    const strikes = current ? Number(current.strikes) + 1 : 1;
    const ttlSec = input.permanent ? null : (input.ttlSec ?? banTtlSeconds(category, strikes));
    const expiresAt = ttlSec ? new Date(Date.now() + ttlSec * 1000).toISOString() : null;

    if (current) {
      run(
        `UPDATE ip_bans SET strikes = ?, expires_at = ?, reason = ?, category = ?, severity = ?, path = ?, method = ?, user_agent = ?, action = ?, hits = hits + 1
          WHERE id = ?`,
        [
          strikes,
          expiresAt,
          (input.reason ?? current.reason).slice(0, 300),
          category,
          input.severity ?? "warning",
          input.path?.slice(0, 400) ?? null,
          input.method?.slice(0, 12) ?? null,
          input.userAgent?.slice(0, 400) ?? null,
          input.action?.slice(0, 40) ?? null,
          current.id,
        ],
      );
      return { id: current.id, strikes, ttlSec, escalated: true };
    }

    const info = run(
      `INSERT INTO ip_bans(ip, reason, category, severity, strikes, path, method, user_agent, action, auto, permanent, expires_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        ip,
        (input.reason ?? "פעילות חשודה").slice(0, 300),
        category,
        input.severity ?? "warning",
        strikes,
        input.path?.slice(0, 400) ?? null,
        input.method?.slice(0, 12) ?? null,
        input.userAgent?.slice(0, 400) ?? null,
        input.action?.slice(0, 40) ?? null,
        input.auto === false ? 0 : 1,
        input.permanent ? 1 : 0,
        expiresAt,
      ],
    );
    return { id: Number(info.lastInsertRowid), strikes, ttlSec, escalated: false };
  } catch (err) {
    console.error("[security] ban failed", err);
    return null;
  }
}

export function unbanIp(ip: string, by = "admin"): number {
  return run("UPDATE ip_bans SET lifted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), lifted_by = ? WHERE ip = ? AND lifted_at IS NULL", [
    by.slice(0, 120),
    ip,
  ]).changes;
}

export function unbanAll(by = "admin"): number {
  return run("UPDATE ip_bans SET lifted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), lifted_by = ? WHERE lifted_at IS NULL", [by.slice(0, 120)]).changes;
}

export function purgeBans(days = 90): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return run("DELETE FROM ip_bans WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (lifted_at IS NOT NULL AND lifted_at < ?)", [cutoff, cutoff]).changes;
}

export function banStats() {
  const active = Number(get<{ c: number }>(`SELECT COUNT(*) c FROM ip_bans WHERE ${ACTIVE}`)?.c ?? 0);
  const total = Number(get<{ c: number }>("SELECT COUNT(*) c FROM ip_bans")?.c ?? 0);
  const last24h = Number(get<{ c: number }>(`SELECT COUNT(*) c FROM ip_bans WHERE ${ACTIVE} AND created_at > datetime('now','-1 day')`)?.c ?? 0);
  const byCategory = all<{ category: string; c: number }>(
    `SELECT category, COUNT(*) c FROM ip_bans WHERE ${ACTIVE} GROUP BY category ORDER BY c DESC LIMIT 12`,
  );
  return { active, total, last24h, byCategory };
}

/* ──────────────────────────── הגדרות אבטחה ──────────────────────────────── */

export const DEFAULT_SECURITY_SETTINGS: Record<string, string> = {
  mode: "enforce",
  autoban: "on",
  honeypot: "ban",
  tool_block: "ban",
  proxy_policy: "score",
  datacenter_ban: "off",
  tor_ban: "on",
  empty_ua: "score",
  internal_bypass: "on",
  staff_bypass: "on",
  rate_per_minute: "600",
  flood_ban: "on",
  retention_days: "90",
  ip_mode: "full",
  honeypot_paths: "on",
};

export function securitySettings(): Record<string, string> {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM security_settings");
  const out = { ...DEFAULT_SECURITY_SETTINGS };
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export function setSecuritySetting(key: string, value: string): void {
  run(
    `INSERT INTO security_settings(key, value, updated_at) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key.slice(0, 60), String(value).slice(0, 200)],
  );
}
