/**
 * שכבת "המבצר" — הגנת עומק לחשבונות, סשנים ויומן ביקורת.
 *
 * ─ עיקרון מנחה ──────────────────────────────────────────────────────────────
 * אין דבר כזה "אתר שאי אפשר לפרוץ". מה שכן אפשר: להפוך פריצה ל**יקרה, איטית
 * ורועשת**. שלוש שכבות שעושות בדיוק את זה:
 *
 *  1. **התנגדות** — סיסמאות scrypt, 2FA לסגל, קישור סשן למכשיר ולרשת,
 *     פקיעות כפולות (sliding + absolute), ו-re-auth לפעולות הרסניות.
 *  2. **גילוי** — כל חריגה נרשמת, מתומחרת ומתריעה: מכשיר חדש, רשת חדשה,
 *     פעילות בשעות חריגות, ייצוא המוני, ניסיונות כושלים חוזרים.
 *  3. **עמידות בדיעבד** — יומן ביקורת עם חתימת Hash משורשרת (כל עריכה של
 *     היסטוריה ניתנת לגילוי), גיבויים מוצפנים, ושחזור מאומת.
 *
 * כל מה שקובע אבטחה יושב **בצד השרת**. הצד הלקוח רק מציג.
 */

import crypto from "node:crypto";
import { all, count, get, run } from "./db";
import { ApiError, clientIp } from "./http";
import { sha256 } from "./crypto";
import { isAdminRole, isStaff } from "./rbac";
import type { SessionUser } from "./session";
import { logSecurityEvent } from "./audit";

// ═══════════════════════════════════════════════════════════════════════════
//  מדיניות — משך חיים של סשן, לפי רגישות התפקיד
// ═══════════════════════════════════════════════════════════════════════════

export type SessionPolicy = {
  /** פקיעה נדיבה (sliding) — מתארכת בפעילות */
  idleMinutes: number;
  /** פקיעה מוחלטת — לא מתארכת לעולם */
  absoluteHours: number;
  /** משך חלון ה-re-auth לפעולות רגישות */
  stepupMinutes: number;
  /** האם חובה 2FA */
  require2fa: boolean;
};

const STAFF_POLICY: SessionPolicy = { idleMinutes: 45, absoluteHours: 12, stepupMinutes: 15, require2fa: true };
const USER_POLICY: SessionPolicy = { idleMinutes: 60 * 24 * 14, absoluteHours: 24 * 90, stepupMinutes: 15, require2fa: false };

export const policyFor = (role: string | undefined | null): SessionPolicy => (isStaff(role) ? STAFF_POLICY : USER_POLICY);

/** האם מדיניות החובה ל-2FA לסגל מופעלת (ניתנת לכיבוי בהגדרות האבטחה) */
export function staff2faRequired(): boolean {
  const row = get<{ value: string }>("SELECT value FROM security_settings WHERE key = 'require_staff_2fa'");
  return (row?.value ?? "on") !== "off";
}

/** האם החשבון חייב 2FA כדי לגשת לאזור הניהול */
export const needs2faSetup = (user: Pick<SessionUser, "role" | "twofa_enabled">): boolean =>
  staff2faRequired() && isStaff(user.role) && !user.twofa_enabled;

// ═══════════════════════════════════════════════════════════════════════════
//  קישור סשן למכשיר ולרשת
// ═══════════════════════════════════════════════════════════════════════════

/** רשת /24 (IPv4) או /64 (IPv6) — מספיק כדי לזהות מעבר רשת, לא מספיק כדי לזהות בית */
export function ipPrefix(ip: string | null | undefined): string | null {
  const value = String(ip ?? "").trim();
  if (!value) return null;
  if (value.includes(":")) return value.split(":").slice(0, 4).join(":");
  const parts = value.split(".");
  if (parts.length === 4) return parts.slice(0, 3).join(".");
  return value.slice(0, 24);
}

/** טביעת הדפדפן — Hash, לא הערך עצמו (פרטיות + השוואה מהירה) */
export const uaFingerprint = (userAgent: string | null | undefined): string | null => {
  const value = String(userAgent ?? "").trim();
  return value ? sha256(value).slice(0, 32) : null;
};

export type SessionPosture = {
  posture: "ok" | "new_network" | "device_changed" | "idle_expired" | "absolute_expired" | "no_binding";
  /** האם מותר להמשיך */
  allow: boolean;
  /** האם צריך re-auth לפעולות רגישות */
  stepupRequired: boolean;
  reason: string | null;
  riskScore: number;
};

/**
 * בדיקת מצב הסשן — הלב של זיהוי גניבת עוגייה.
 *
 *  · מכשיר שונה (UA) על אותה עוגייה = סימן קלאסי לדלת אחורית. הסשן מבוטל מיד.
 *  · רשת שונה = מותר להמשיך, אבל מסומן בסיכון ומחייב re-auth לפעולות רגישות.
 *    (נייד שעובר מ-WiFi לסלולר הוא מקרה לגיטימי — לכן לא חוסמים.)
 *  · פקיעות: idle לפי התפקיד, ו-absolute שלעולם לא מתארך.
 */
export function evaluateSession(input: {
  row: {
    id?: string;
    ip?: string | null;
    ua_hash?: string | null;
    ip_prefix?: string | null;
    created_at?: string | null;
    last_seen_at?: string | null;
    absolute_expires_at?: string | null;
    stepup_until?: string | null;
    risk_score?: number | null;
  };
  now: number;
  ip: string;
  userAgent: string;
  role: string | undefined | null;
}): SessionPosture {
  const policy = policyFor(input.role);
  const risk = Number(input.row.risk_score ?? 0);
  const stepupUntil = input.row.stepup_until ? Date.parse(input.row.stepup_until) : 0;
  const stepupActive = stepupUntil > input.now;

  // ── פקיעה מוחלטת (אם נרשמה; התאימות לאחור מטופלת אצל הקורא) ─────────────
  const absolute = input.row.absolute_expires_at ? Date.parse(input.row.absolute_expires_at) : null;
  if (absolute !== null && absolute <= input.now) {
    return { posture: "absolute_expired", allow: false, stepupRequired: true, reason: "הסשן הגיע לסוף חייו — יש להתחבר מחדש", riskScore: risk };
  }

  const lastSeen = input.row.last_seen_at ? Date.parse(input.row.last_seen_at) : input.now;
  if (input.now - lastSeen > policy.idleMinutes * 60_000) {
    return {
      posture: "idle_expired",
      allow: false,
      stepupRequired: true,
      reason: `אין פעילות כבר מעל ${policy.idleMinutes} דקות — נדרשת התחברות מחדש`,
      riskScore: risk,
    };
  }

  // ── קישור המכשיר ──────────────────────────────────────────────────────────
  const ua = uaFingerprint(input.userAgent);
  const bound = input.row.ua_hash ?? null;
  if (bound && ua && bound !== ua) {
    return {
      posture: "device_changed",
      allow: false,
      stepupRequired: true,
      reason: "זוהתה עוגיית סשן מדפדפן אחר — הסשן בוטל מטעמי ביטחון",
      riskScore: risk + 40,
    };
  }

  // ── קישור הרשת ────────────────────────────────────────────────────────────
  const prefix = ipPrefix(input.ip);
  const boundPrefix = input.row.ip_prefix ?? null;
  if (boundPrefix && prefix && boundPrefix !== prefix) {
    return {
      posture: "new_network",
      allow: true,
      stepupRequired: !stepupActive,
      reason: "התחברת מרשת חדשה — פעולות רגישות ידרשו אימות חוזר",
      riskScore: risk + 15,
    };
  }

  return {
    posture: bound && boundPrefix ? "ok" : "no_binding",
    allow: true,
    stepupRequired: !stepupActive,
    reason: null,
    riskScore: risk,
  };
}

/** עדכון רישום הסשן אחרי בדיקה (חסימה/סימון סיכון) — נקרא משכבת הסשן */
export function applyPosture(sessionId: string, posture: SessionPosture): void {
  if (!posture.allow) {
    run(
      "UPDATE sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revoked_reason=? WHERE id=?",
      [posture.posture.slice(0, 40), sessionId],
    );
    return;
  }
  if (posture.riskScore > 0) {
    run("UPDATE sessions SET risk_score = ? WHERE id = ?", [Math.min(posture.riskScore, 100), sessionId]);
  }
}

/** קישור סשן חדש לרשת/מכשיר — נקרא ביצירת סשן */
export function bindSession(sessionId: string, input: { ip: string; userAgent: string; role?: string | null; now?: number }): void {
  const policy = policyFor(input.role);
  const now = input.now ?? Date.now();
  run(
    `UPDATE sessions SET ua_hash = ?, ip_prefix = ?, last_ip = ?, absolute_expires_at = ?
     WHERE id = ?`,
    [
      uaFingerprint(input.userAgent),
      ipPrefix(input.ip),
      input.ip,
      new Date(now + policy.absoluteHours * 3_600_000).toISOString(),
      sessionId,
    ],
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  re-auth מדורג (step-up) לפעולות הרסניות
// ═══════════════════════════════════════════════════════════════════════════

/** פתיחת חלון re-auth לאחר אימות מחדש מוצלח */
export function grantStepUp(sessionId: string, role: string | undefined | null, now = Date.now()): string {
  const until = new Date(now + policyFor(role).stepupMinutes * 60_000).toISOString();
  run("UPDATE sessions SET stepup_until = ? WHERE id = ?", [until, sessionId]);
  return until;
}

export function stepUpActive(sessionId: string, now = Date.now()): boolean {
  const row = get<{ stepup_until: string | null }>("SELECT stepup_until FROM sessions WHERE id = ?", [sessionId]);
  return Boolean(row?.stepup_until && Date.parse(row.stepup_until) > now);
}

/**
 * פעולות שדורשות אימות מחדש (סיסמה) בתוך חלון ה-re-auth.
 * לפי שם הפעולה שהנתב מעביר.
 */
export const CRITICAL_ACTIONS = new Set([
  "user.role_change",
  "user.delete",
  "user.change_role",
  "admin.backup",
  "admin.restore",
  "admin.impersonate",
  "settings.update",
  "security.settings_update",
  "api_key.create",
  "api_key.revoke",
  "title.delete",
  "payment.refund",
  "admin.export",
]);

export function requireStepUp(user: SessionUser | null | undefined, sessionId: string | undefined, action: string): void {
  if (!user || !sessionId) throw new ApiError("UNAUTHORIZED", 401);
  if (!CRITICAL_ACTIONS.has(action)) return;
  if (stepUpActive(sessionId)) return;
  throw new ApiError(
    "STEP_UP_REQUIRED",
    403,
    { action, windowMinutes: policyFor(user.role).stepupMinutes },
    "פעולה רגישה — יש לאמת מחדש את הסיסמה (חלון אימות קצר)",
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  רשימת היתר לכתובות ניהול (רשות, ריקה = פתוח)
// ═══════════════════════════════════════════════════════════════════════════

export function adminIpAllowlist(): string[] {
  const row = get<{ value: string }>("SELECT value FROM security_settings WHERE key = 'admin_ip_allowlist'");
  return String(row?.value ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * האם מותר לכתובת הזו להיכנס לאזור הניהול.
 * תומך ב-CIDR בסיסי (‎10.0.0.0/8) ובהתאמת prefix (‎203.0.113.).
 */
export function adminIpAllowed(ip: string): boolean {
  const list = adminIpAllowlist();
  if (list.length === 0) return true;

  const value = String(ip ?? "");
  for (const entry of list) {
    if (entry === value) return true;
    if (entry.includes("/")) {
      const [base, bitsRaw] = entry.split("/");
      const bits = Number(bitsRaw);
      if (value.includes(":") || base.includes(":")) {
        if (value.startsWith(base.split(":").slice(0, Math.max(1, Math.floor((Number.isFinite(bits) ? bits : 64) / 16))).join(":"))) return true;
        continue;
      }
      const mask = bits >= 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
      const toInt = (addr: string) =>
        addr.split(".").reduce((acc, part) => ((acc << 8) | (Number(part) & 255)) >>> 0, 0) >>> 0;
      if (((toInt(base) & mask) >>> 0) === ((toInt(value) & mask) >>> 0)) return true;
      continue;
    }
    if (value.startsWith(entry)) return true;
  }
  return false;
}

export function setAdminIpAllowlist(entries: string[]): void {
  const clean = entries
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length < 60)
    .slice(0, 50)
    .join(",");
  run(
    `INSERT INTO security_settings(key, value, updated_at) VALUES('admin_ip_allowlist', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [clean],
  );
}

/**
 * שער הכניסה לאזור הניהול.
 *  · 2FA חובה לסגל — בלעדיו אין ניהול (כי סיסמה אחת לא מספיקה למי שמחזיק הכל).
 *  · רשימת היתר ל-IP, אם הוגדרה.
 */
export function assertAdminAccess(user: SessionUser, ip: string, opts: { allowWithout2fa?: boolean } = {}): void {
  if (!isAdminRole(user.role)) throw new ApiError("FORBIDDEN", 403, undefined, "אין הרשאת ניהול");
  if (!opts.allowWithout2fa && needs2faSetup(user)) {
    throw new ApiError("TWOFA_REQUIRED", 403, { setup: "/account/security" }, "אזור הניהול דורש אימות דו-שלבי — יש להפעיל אותו קודם");
  }
  if (!adminIpAllowed(ip)) {
    void logSecurityEvent({ kind: "admin_ip_blocked", severity: "warning", ip, userId: user.id, detail: "כתובת לא ברשימת ההיתר של הניהול" });
    throw new ApiError("FORBIDDEN", 403, undefined, "הכתובת שלך אינה מורשית לאזור הניהול");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  גילוי חריגות
// ═══════════════════════════════════════════════════════════════════════════

export type Anomaly = {
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  actorId?: number | null;
  at: string;
};

/** אירועי התחברות חריגים: מכשיר חדש או רשת חדשה למשתמש */
export function detectLoginAnomalies(userId: number, ip: string, userAgent: string): Anomaly[] {
  const prefix = ipPrefix(ip);
  const ua = uaFingerprint(userAgent);
  const out: Anomaly[] = [];
  const now = new Date().toISOString();

  const seenNetwork = count(
    "SELECT COUNT(*) c FROM sessions WHERE user_id = ? AND ip_prefix = ? AND ip_prefix IS NOT NULL",
    [userId, prefix],
  );
  if (prefix && seenNetwork === 0) {
    out.push({
      kind: "new_network",
      severity: "warning",
      title: "התחברות מרשת חדשה",
      detail: `התחברות ראשונה מרשת ${prefix}.x — אם זה לא אתה, החלף סיסמה מיד.`,
      actorId: userId,
      at: now,
    });
  }

  const seenDevice = count("SELECT COUNT(*) c FROM sessions WHERE user_id = ? AND ua_hash = ? AND ua_hash IS NOT NULL", [userId, ua]);
  if (ua && seenDevice === 0) {
    out.push({
      kind: "new_device",
      severity: "info",
      title: "התחברות ממכשיר חדש",
      detail: "זוהה דפדפן שלא התחבר לחשבון הזה בעבר.",
      actorId: userId,
      at: now,
    });
  }

  // התחברות מוצלחת מיד אחרי שורת כישלונות — דגל אדום קלאסי (ניחוש שהצליח)
  const recentFailures = count(
    `SELECT COUNT(*) c FROM login_attempts WHERE success = 0 AND created_at > datetime('now','-30 minutes')
     AND (ip = ? OR user_id = ?)`,
    [ip, userId],
  );
  if (recentFailures >= 5) {
    out.push({
      kind: "success_after_failures",
      severity: "warning",
      title: "התחברות מוצלחת אחרי ניסיונות כושלים",
      detail: `${recentFailures} ניסיונות כושלים ב-30 הדקות שקדמו להתחברות הזו. אם זו לא הייתה התחברות שלך — החלף סיסמה עכשיו.`,
      actorId: userId,
      at: now,
    });
  }
  return out;
}

/** התראת חריגה בתוך האתר + רישום אבטחה */
export function alertAnomaly(anomaly: Anomaly, link = "/account/security"): void {
  if (anomaly.actorId) {
    run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
      anomaly.actorId,
      "security",
      anomaly.title,
      anomaly.detail,
      link,
    ]);
  }
  void logSecurityEvent({
    kind: `anomaly_${anomaly.kind}`,
    severity: anomaly.severity,
    userId: anomaly.actorId ?? null,
    detail: anomaly.detail,
  });
}

/** חריגות ברמת המערכת — לאדמין, מחושב בזמן אמת */
export function systemAnomalies(): Anomaly[] {
  const since24 = new Date(Date.now() - 86_400_000).toISOString();
  const out: Anomaly[] = [];

  const failedLogins = count("SELECT COUNT(*) c FROM login_attempts WHERE success = 0 AND created_at >= ?", [since24]);
  if (failedLogins >= 25) {
    out.push({
      kind: "login_storm",
      severity: failedLogins >= 100 ? "critical" : "warning",
      title: "גל ניסיונות התחברות כושלים",
      detail: `${failedLogins} ניסיונות כושלים ב-24 השעות האחרונות — ייתכן ניסיון brute-force.`,
      at: new Date().toISOString(),
    });
  }

  const revokedByDevice = count(
    "SELECT COUNT(*) c FROM sessions WHERE revoked_reason = 'device_changed' AND revoked_at >= ?",
    [since24],
  );
  if (revokedByDevice > 0) {
    out.push({
      kind: "session_hijack_attempt",
      severity: "critical",
      title: "סשן שנחטף?",
      detail: `${revokedByDevice} סשנים בוטלו אוטומטית כי העוגייה הופיעה מדפדפן אחר.`,
      at: new Date().toISOString(),
    });
  }

  const riskySessions = count("SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL AND risk_score >= 15");
  if (riskySessions > 0) {
    out.push({
      kind: "risky_sessions",
      severity: "warning",
      title: "סשנים בסיכון",
      detail: `${riskySessions} סשנים פעילים סומנו בסיכון (רשת חדשה / חריגה).`,
      at: new Date().toISOString(),
    });
  }

  const bulkExports = count(
    "SELECT COUNT(*) c FROM audit_log WHERE action IN ('admin.export','user.export') AND created_at >= ?",
    [since24],
  );
  if (bulkExports >= 5) {
    out.push({
      kind: "bulk_export",
      severity: "warning",
      title: "ייצוא נתונים מרובה",
      detail: `${bulkExports} פעולות ייצוא ב-24 שעות — בדוק שלא מדובר בשאיבה.`,
      at: new Date().toISOString(),
    });
  }

  const offHoursStaff = count(
    `SELECT COUNT(*) c FROM audit_log
     WHERE actor_id IN (SELECT id FROM users WHERE role IN ('editor','admin','owner'))
       AND created_at >= ?
       AND CAST(strftime('%H', created_at) AS INTEGER) BETWEEN 1 AND 5
       AND severity <> 'info'`,
    [since24],
  );
  if (offHoursStaff >= 3) {
    out.push({
      kind: "off_hours_staff",
      severity: "info",
      title: "פעילות ניהול בשעות חריגות",
      detail: `${offHoursStaff} פעולות ניהול משמעותיות בין 01:00–05:00.`,
      at: new Date().toISOString(),
    });
  }
  return out;
}

/**
 * נקרא אחרי התחברות מוצלחת (סיסמה, או סיסמה+2FA).
 *
 * כל חריגה מייצרת גם התראה בתוך האתר למשתמש עצמו, וגם — אם מדובר בחשבון
 * צוות — התראה לכל שאר הצוות. הרעיון: אם תוקף נכנס לחשבון שלי, אני אמור
 * לדעת מזה מיד, ולא מהממונה שלי בעוד שבוע.
 */
export function noteSuccessfulLogin(
  user: { id: number; role?: string | null; email?: string | null },
  req: Request,
): Anomaly[] {
  const anomalies = detectLoginAnomalies(user.id, clientIp(req), userAgentHeader(req));
  for (const anomaly of anomalies) {
    alertAnomaly(anomaly);
    if (anomaly.severity !== "info" && isStaff(user.role)) notifyStaff(anomaly, user);
  }
  return anomalies;
}

/** התראה לכל חברי הצוות (חוץ מהמשתמש עצמו) — על חריגה בחשבון של צוות */
function notifyStaff(anomaly: Anomaly, actor: { id: number; email?: string | null }): void {
  const staff = all<{ id: number }>(
    "SELECT id FROM users WHERE role IN ('editor','admin','owner') AND deleted_at IS NULL AND status = 'active' AND id != ?",
    [actor.id],
  );
  const who = maskEmail(actor.email);
  for (const member of staff) {
    run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
      member.id,
      "security_staff",
      `התראת אבטחה: ${anomaly.title}`,
      `בחשבון הצוות ${who}: ${anomaly.detail}`,
      "/admin/fortress",
    ]);
  }
}

/** שליפת ה-User-Agent מהבקשה (נשמר כ-Hash בלבד) */
function userAgentHeader(req: Request): string {
  try {
    return req.headers.get("user-agent") ?? "";
  } catch {
    return "";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  תמונת מצב כוללת — למסך האבטחה ולבדיקות
// ═══════════════════════════════════════════════════════════════════════════

export type FortressReport = {
  generatedAt: string;
  sessions: { active: number; risky: number; staffWithoutBinding: number; unbounded: number };
  staff: { total: number; with2fa: number; missing2fa: string[]; accounts: string[] };
  anomalies: Anomaly[];
  allowlist: { enabled: boolean; entries: number };
  criticalActions: number;
  migrations: number;
};

export function fortressReport(): FortressReport {
  const staffRows = all<{ email: string; role: string; twofa_enabled: number }>(
    "SELECT email, role, twofa_enabled FROM users WHERE role IN ('editor','admin','owner') AND deleted_at IS NULL",
  );
  return {
    generatedAt: new Date().toISOString(),
    sessions: {
      active: count("SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')"),
      risky: count("SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL AND risk_score >= 15"),
      staffWithoutBinding: count(
        `SELECT COUNT(*) c FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.revoked_at IS NULL AND u.role IN ('editor','admin','owner') AND s.ua_hash IS NULL`,
      ),
      unbounded: count("SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL AND absolute_expires_at IS NULL"),
    },
    staff: {
      total: staffRows.length,
      with2fa: staffRows.filter((row) => row.twofa_enabled === 1).length,
      missing2fa: staffRows.filter((row) => row.twofa_enabled !== 1).map((row) => row.email),
      accounts: staffRows.map((row) => row.email),
    },
    anomalies: systemAnomalies(),
    allowlist: { enabled: adminIpAllowlist().length > 0, entries: adminIpAllowlist().length },
    criticalActions: CRITICAL_ACTIONS.size,
    migrations: count("SELECT COUNT(*) c FROM schema_migrations"),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  מיסוך פרטים מזהים (PII) — מידע מוגן לא נכתב גלוי ולא מוצג גלוי
// ═══════════════════════════════════════════════════════════════════════════

/**
 * מיסוך אימייל לתצוגה וליומנים: `noam@gmail.com` → `n**m@g****.com`.
 * נשמר מספיק מידע כדי לזהות "איזה חשבון", בלי לפרסם את הכתובת המלאה
 * בכל מסך ניהול, ייצוא או התראה.
 */
export function maskEmail(email: string | null | undefined): string {
  const value = String(email ?? "").trim();
  if (!value.includes("@")) return value ? `${value.slice(0, 2)}***` : "";
  const [local, domain] = value.split("@");
  const [host, ...rest] = domain.split(".");
  const maskPart = (part: string): string =>
    part.length <= 2 ? `${part.slice(0, 1)}*` : `${part[0]}${"*".repeat(Math.min(3, Math.max(1, part.length - 2)))}${part.slice(-1)}`;
  return `${maskPart(local)}@${maskPart(host)}${rest.length ? `.${rest.join(".")}` : ""}`;
}

/** מיסוך כתובת IP: `203.0.113.45` → `203.0.113.x` (רשת, בלי המארח) */
export function maskIp(ip: string | null | undefined): string {
  const value = String(ip ?? "").trim();
  if (!value) return "";
  if (value.includes(":")) return `${value.split(":").slice(0, 4).join(":")}::x`;
  const parts = value.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : value.slice(0, 8) + "…";
}

/** כמה רשומות PII נחשפו בפועל במסך הזה — לבדיקות ולסטטיסטיקה */
export const containsRawEmail = (value: unknown): boolean =>
  /[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(typeof value === "string" ? value : JSON.stringify(value ?? ""));

// ═══════════════════════════════════════════════════════════════════════════
//  חתימה על הפעולה — "מה בדיוק אושר" (אימות מדורג עם ראיה)
// ═══════════════════════════════════════════════════════════════════════════

/** חתימת פעולה רגישה: מזהה ייחודי שמאפשר לקשר בין האישור לביצוע ביומן */
export const actionSignature = (input: { userId: number; action: string; at?: number }): string =>
  crypto
    .createHash("sha256")
    .update(`${input.userId}|${input.action}|${input.at ?? Date.now()}`)
    .digest("hex")
    .slice(0, 32);
