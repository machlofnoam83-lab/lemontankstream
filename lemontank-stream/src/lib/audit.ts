/**
 * יומן ביקורת ואירועי אבטחה — כל פעולה רגישה נרשמת.
 *  • audit_log: מי עשה מה, מתי, מאיזה IP, לפני/אחרי (JSON).
 *  • security_events: ניסיונות CSRF, SQLi, brute-force, הרשאות לא תקינות...
 *
 * הרשומות אינן ניתנות למחיקה דרך ה-API (רק אדמין יכול לקרוא), ונשמרות לצמיתות.
 */

import { all, get, run, tx, parseJson } from "./db";
import { sha256 } from "./crypto";
import { clientIp, userAgent } from "./http";

export type AuditAction =
  | "auth.register" | "auth.login" | "auth.login_failed" | "auth.logout" | "auth.password_change"
  | "auth.password_reset" | "auth.2fa_enable" | "auth.2fa_disable" | "auth.session_revoke"
  | "auth.anomaly" | "auth.stepup" | "auth.breach_block"
  | "user.create" | "user.update" | "user.delete" | "user.plan_change" | "user.role_change"
  | "user.suspend" | "user.unsuspend" | "user.impersonate" | "user.export"
  | "title.create" | "title.update" | "title.delete" | "title.publish" | "title.unpublish"
  | "title.plan_change" | "title.feature" | "title.bulk_update"
  | "season.create" | "season.update" | "season.delete"
  | "episode.create" | "episode.update" | "episode.delete" | "episode.publish" | "episode.plan_change"
  | "asset.upload" | "asset.delete" | "asset.replace"
  | "genre.create" | "genre.update" | "genre.delete"
  | "collection.create" | "collection.update" | "collection.delete"
  | "promo.create" | "promo.update" | "promo.delete"
  | "plan.update" | "settings.update" | "feature_flag.update"
  | "payment.create" | "payment.refund" | "subscription.update" | "coupon.create" | "coupon.delete"
  | "review.moderate" | "comment.moderate" | "report.handle"
  | "security.csrf_failed" | "security.permission_denied" | "security.sqli_attempt"
  | "security.rate_limit" | "security.suspicious_request" | "security.breach_scan"
  | "security.ban" | "security.unban" | "security.settings_update"
  | "admin.export" | "admin.backup" | "admin.restore" | "admin.maintenance_toggle"
  | "live.create" | "live.update" | "live.delete"
  | "person.create" | "person.update" | "person.delete"
  | "party.create" | "party.end" | "newsletter.subscribe" | "newsletter.broadcast"
  | "api_key.create" | "api_key.revoke" | "badge.award" | "flag.update";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditContext = {
  req?: Request;
  actorId?: number | null;
  actorEmail?: string | null;
};

export type AuditInput = {
  action: AuditAction;
  entity?: string;
  entityId?: string | number;
  severity?: AuditSeverity;
  before?: unknown;
  after?: unknown;
  detail?: string;
};

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const s = JSON.stringify(value);
    return s.length > 20_000 ? `${s.slice(0, 20_000)}…` : s;
  } catch {
    return null;
  }
}

/**
 * חתימת רשומת יומן — משורשרת לרשומה הקודמת.
 *
 * הרעיון: כל רשומה מכילה את ה-Hash של כל מה שקדם לה, ולכן **כל** שינוי,
 * מחיקה או החדרה בדיעבד שוברים את השרשרת. זו הגנה מסוג "היסטוריה שלא
 * משכתבים בשקט" — בדיוק מה שמבקשים בביקורת פורנזית.
 */
export const GENESIS_HASH = "0".repeat(64);

const chainHash = (parts: {
  seq: number;
  prevHash: string;
  action: string;
  actorId: number | null;
  entity: string | null;
  entityId: string | null;
  severity: string;
  createdAt: string;
  payload: string | null;
}): string =>
  sha256(
    [
      parts.seq,
      parts.prevHash,
      parts.action,
      parts.actorId ?? "",
      parts.entity ?? "",
      parts.entityId ?? "",
      parts.severity,
      parts.createdAt,
      parts.payload ?? "",
    ].join("\u0001"),
  );

/** הרשומה האחרונה בשרשרת (לפי seq) */
function chainHead(): { seq: number; entry_hash: string | null } {
  const row = get<{ seq: number | null; entry_hash: string | null }>(
    "SELECT seq, entry_hash FROM audit_log WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1",
  );
  return { seq: Number(row?.seq ?? 0), entry_hash: row?.entry_hash ?? null };
}

/** רישום פעולה ביומן הביקורת. לעולם לא זורק — לוג לא אמור להפיל בקשה. */
export function writeAudit(input: AuditInput, ctx: AuditContext = {}): void {
  try {
    const createdAt = new Date().toISOString();
    const payload = serialize(input.after ?? (input.detail ? { detail: input.detail } : undefined));

    tx(() => {
      const head = chainHead();
      const seq = head.seq + 1;
      const prevHash = head.entry_hash ?? GENESIS_HASH;
      const entryHash = chainHash({
        seq,
        prevHash,
        action: input.action,
        actorId: ctx.actorId ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId != null ? String(input.entityId) : null,
        severity: input.severity ?? "info",
        createdAt,
        payload,
      });

      run(
        `INSERT INTO audit_log(actor_id, actor_email, action, entity, entity_id, severity, before_json, after_json, ip, user_agent, request_id,
                               seq, prev_hash, entry_hash, created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          ctx.actorId ?? null,
          ctx.actorEmail ?? null,
          input.action,
          input.entity ?? null,
          input.entityId != null ? String(input.entityId) : null,
          input.severity ?? "info",
          serialize(input.before),
          payload,
          ctx.req ? clientIp(ctx.req) : null,
          ctx.req ? userAgent(ctx.req) : null,
          ctx.req?.headers.get("x-request-id") ?? null,
          seq,
          prevHash,
          entryHash,
          createdAt,
        ],
      );
    });
  } catch (err) {
    console.error("[audit] failed to write", err);
  }
}

export type ChainVerification = {
  ok: boolean;
  checked: number;
  broken: { id: number; seq: number | null; reason: string }[];
  head: { seq: number; entryHash: string | null };
  legacyRows: number;
  verifiedAt: string;
};

/**
 * אימות שלמות השרשרת.
 * רשומות ותיקות (מלפני שהשרשרת הופעלה) מדולגות בכוונה ומדווחות בנפרד —
 * הן לא "שבורות", הן פשוט טרום-שרשרת.
 */
export function verifyAuditChain(limit = 5000): ChainVerification {
  const rows = all<{
    id: number;
    seq: number | null;
    prev_hash: string | null;
    entry_hash: string | null;
    action: string;
    actor_id: number | null;
    entity: string | null;
    entity_id: string | null;
    severity: string;
    after_json: string | null;
    created_at: string;
  }>(
    `SELECT id, seq, prev_hash, entry_hash, action, actor_id, entity, entity_id, severity, after_json, created_at
     FROM audit_log WHERE seq IS NOT NULL ORDER BY seq ASC LIMIT ?`,
    [Math.min(Math.max(limit, 1), 20_000)],
  );

  const broken: { id: number; seq: number | null; reason: string }[] = [];
  let previous = GENESIS_HASH;
  let expectedSeq = rows.length ? Number(rows[0].seq) : 1;

  for (const row of rows) {
    if (Number(row.seq) !== expectedSeq) {
      broken.push({ id: row.id, seq: row.seq, reason: `רצף לא תקין (צפוי ${expectedSeq})` });
    }
    if ((row.prev_hash ?? GENESIS_HASH) !== previous) {
      broken.push({ id: row.id, seq: row.seq, reason: "החוליה הקודמת לא תואמת" });
    }
    const expected = chainHash({
      seq: Number(row.seq),
      prevHash: row.prev_hash ?? GENESIS_HASH,
      action: row.action,
      actorId: row.actor_id,
      entity: row.entity,
      entityId: row.entity_id,
      severity: row.severity,
      createdAt: row.created_at,
      payload: row.after_json,
    });
    if (expected !== row.entry_hash) {
      broken.push({ id: row.id, seq: row.seq, reason: "תוכן הרשומה שונה מהחתימה" });
    }
    previous = row.entry_hash ?? previous;
    expectedSeq += 1;
  }

  const head = chainHead();
  return {
    ok: broken.length === 0,
    checked: rows.length,
    broken: broken.slice(0, 50),
    head: { seq: head.seq, entryHash: head.entry_hash },
    legacyRows: Number(get<{ c: number }>("SELECT COUNT(*) c FROM audit_log WHERE seq IS NULL")?.c ?? 0),
    verifiedAt: new Date().toISOString(),
  };
}

/** רישום אירוע אבטחה (משמש גם את ה-rate limiter ואת מנוע הזיהוי) */
export async function logSecurityEvent(input: {
  kind: string;
  severity?: AuditSeverity;
  ip?: string;
  userId?: number | null;
  detail?: string;
}): Promise<void> {
  try {
    run("INSERT INTO security_events(kind, severity, ip, user_id, detail) VALUES(?,?,?,?,?)", [
      input.kind,
      input.severity ?? "warning",
      input.ip ?? null,
      input.userId ?? null,
      input.detail?.slice(0, 2000) ?? null,
    ]);
  } catch (err) {
    console.error("[security] failed to log", err);
  }
}

export type AuditRow = {
  id: number;
  actor_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  severity: string;
  ip: string | null;
  created_at: string;
  after_json: string | null;
};

/** שליפת יומן הביקורת לפאנל האדמין עם סינון ועמודים */
export function listAudit(opts: { limit?: number; offset?: number; action?: string; severity?: string; actor?: number } = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.action) {
    clauses.push("action LIKE ?");
    params.push(`${opts.action}%`);
  }
  if (opts.severity) {
    clauses.push("severity = ?");
    params.push(opts.severity);
  }
  if (opts.actor) {
    clauses.push("actor_id = ?");
    params.push(opts.actor);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const rows = all<AuditRow & { after_json: string }>(
    `SELECT id, actor_email, action, entity, entity_id, severity, ip, created_at, after_json
     FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const total = Number(
    (all<{ c: number }>(`SELECT COUNT(*) c FROM audit_log ${where}`, params)[0]?.c ?? 0),
  );
  return { rows: rows.map((r) => ({ ...r, detail: parseJson(r.after_json, null) })), total, limit, offset };
}

/** 20 האירועים האחרונים לתצוגה מהירה בדשבורד */
export const recentSecurityEvents = (limit = 20) =>
  all("SELECT * FROM security_events ORDER BY id DESC LIMIT ?", [limit]);

/** סטטיסטיקת אבטחה ל-24 השעות האחרונות */
export function securitySummary() {
  const byKind = all<{ kind: string; c: number; severity: string }>(
    `SELECT kind, severity, COUNT(*) c FROM security_events
     WHERE created_at > datetime('now','-1 day') GROUP BY kind, severity ORDER BY c DESC`,
  );
  const failedLogins = Number(
    all<{ c: number }>(
      "SELECT COUNT(*) c FROM login_attempts WHERE success = 0 AND created_at > datetime('now','-1 day')",
    )[0]?.c ?? 0,
  );
  const activeSessions = Number(
    all<{ c: number }>(
      "SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    )[0]?.c ?? 0,
  );
  return { byKind, failedLogins, activeSessions };
}
