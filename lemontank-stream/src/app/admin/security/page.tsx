import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, DataTable, StatCard } from "@/components/ui/primitives";
import { SecurityActions } from "@/components/admin/security-actions";
import { all, count, get } from "@/lib/db";
import { formatNumber, formatRelative } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "בקרת אבטחה", robots: { index: false } };
export const dynamic = "force-dynamic";

/** לוח בקרת האבטחה — אירועים, ניסיונות פריצה, חסימות ומצב המערכת */
export default async function AdminSecurityPage() {
  const settings = getSettings();
  const actor = await getCurrentUser();

  const events = all<{ id: number; kind: string; severity: string; ip: string | null; user_id: number | null; detail: string | null; created_at: string }>(
    "SELECT id, kind, severity, ip, user_id, detail, created_at FROM security_events ORDER BY id DESC LIMIT 60",
  );

  const failedLogins = all<{ email_norm: string | null; ip: string | null; reason: string | null; created_at: string }>(
    "SELECT email_norm, ip, reason, created_at FROM login_attempts WHERE success = 0 ORDER BY id DESC LIMIT 40",
  );

  const lockedAccounts = all<{ id: number; email: string; name: string; failed_logins: number; locked_until: string }>(
    "SELECT id, email, name, failed_logins, locked_until FROM users WHERE locked_until > strftime('%Y-%m-%dT%H:%M:%fZ','now') ORDER BY locked_until DESC",
  );

  const topIps = all<{ ip: string; hits: number; kinds: number }>(
    `SELECT ip, COUNT(*) hits, COUNT(DISTINCT kind) kinds FROM security_events
     WHERE created_at > datetime('now','-3 day') AND ip IS NOT NULL GROUP BY ip ORDER BY hits DESC LIMIT 12`,
  );

  const stats = {
    events24h: count("SELECT COUNT(*) c FROM security_events WHERE created_at > datetime('now','-1 day')"),
    critical7d: count("SELECT COUNT(*) c FROM security_events WHERE severity='critical' AND created_at > datetime('now','-7 day')"),
    csrf: count("SELECT COUNT(*) c FROM security_events WHERE kind LIKE 'csrf%' AND created_at > datetime('now','-7 day')"),
    attacks: count("SELECT COUNT(*) c FROM security_events WHERE kind LIKE 'attack_pattern%' AND created_at > datetime('now','-7 day')"),
    rateLimit: count("SELECT COUNT(*) c FROM security_events WHERE kind LIKE 'rate_limit%' AND created_at > datetime('now','-1 day')"),
    twoFactor: count("SELECT COUNT(*) c FROM users WHERE twofa_enabled=1"),
    adminsNo2fa: count("SELECT COUNT(*) c FROM users WHERE role IN ('admin','owner') AND twofa_enabled=0 AND deleted_at IS NULL"),
    integrity: get<{ integrity_check: string }>("PRAGMA integrity_check")?.integrity_check ?? "unknown",
    fkViolations: all("PRAGMA foreign_key_check").length,
    journalMode: (get<{ journal_mode: string }>("PRAGMA journal_mode") as { journal_mode?: string })?.journal_mode ?? "—",
    foreignKeys: (get<{ foreign_keys: number }>("PRAGMA foreign_keys") as { foreign_keys?: number })?.foreign_keys ?? 0,
  };

  const protections = [
    ["הצפנת סיסמאות", "scrypt N=2^15 (OWASP)", true],
    ["הגנת CSRF", "Double-submit + HMAC + Origin", true],
    ["מניעת SQL Injection", "Parameter binding בכל שאילתה + ולידציה", true],
    ["מניעת XSS", "React escaping, סניטציה, CSP עם nonce", true],
    ["הצפנת שדות רגישים", "AES-256-GCM (סודות 2FA)", true],
    ["העלאת קבצים", "בדיקת magic bytes + רשימת סוגים מותרים", true],
    ["הגבלת קצב", "חלונות פר-IP ופר-פעולה", true],
    ["נעילת חשבון", "5 ניסיונות → נעילה מדורגת עד שעתיים", true],
    ["סשנים", "טוקן אטום 256-bit, נשמר כ-SHA-256 בלבד", true],
    ["הרשאות", "RBAC נאכף בשרת בכל נקודת קצה", true],
    ["Header hardening", "HSTS, nosniff, Referrer-Policy, COOP/CORP", true],
    ["יומן ביקורת", "כל פעולה רגישה נרשמת עם IP וזהות", true],
    ["אימות דו-שלבי", stats.adminsNo2fa === 0 ? "כל המנהלים מוגנים" : `${stats.adminsNo2fa} מנהלים ללא 2FA`, stats.adminsNo2fa === 0],
    ["גיבוי", "ייצוא JSON מלא לבעלים", true],
    ["GDPR", "ייצוא/מחיקת נתונים עצמית", true],
    ["שמירת סודות", "משתני סביבה בלבד, לא בקוד", true],
  ] as const;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">🛡️ בקרת אבטחה</h1>
          <p className="mt-1 text-sm text-ink-400">ניטור אירועים, ניסיונות פריצה ומצב ההגנות בזמן אמת.</p>
        </div>
        {settings.force_2fa_for_admins ? <Badge tone="success">2FA חובה למנהלים: פעיל</Badge> : (
          <Badge tone="warn">2FA חובה למנהלים: כבוי (מומלץ להפעיל בהגדרות)</Badge>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="אירועים ב-24 שעות" value={formatNumber(stats.events24h)} />
        <StatCard label="קריטיים (7 ימים)" value={formatNumber(stats.critical7d)} tone={stats.critical7d ? "danger" : "success"} />
        <StatCard label="ניסיונות תקיפה" value={formatNumber(stats.attacks)} tone={stats.attacks ? "warn" : "success"} />
        <StatCard label="חריגות Rate Limit" value={formatNumber(stats.rateLimit)} />
        <StatCard label="כשלי CSRF" value={formatNumber(stats.csrf)} />
        <StatCard label="חשבונות עם 2FA" value={formatNumber(stats.twoFactor)} tone="success" />
      </div>

      <SecurityActions integrity={stats.integrity} fkViolations={stats.fkViolations} canManage={actor?.role === "owner"} />

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-bold">✅ מצב ההגנות במערכת</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {protections.map(([name, detail, ok]) => (
            <li key={name} className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
              <span className={ok ? "text-emerald-400" : "text-amber-300"} aria-hidden="true">{ok ? "✓" : "!"}</span>
              <span className="text-xs">
                <b className="text-ink-100">{name}</b>
                <span className="block text-ink-400">{detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">🚨 אירועי אבטחה אחרונים</h2>
          {events.length === 0 ? (
            <p className="text-xs text-ink-400">אין אירועים — מערכת נקייה 🎉</p>
          ) : (
            <DataTable head={["סוג", "חומרה", "IP", "פרטים", "מתי"]}>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 font-mono text-[11px]" dir="ltr">{e.kind}</td>
                  <td className="px-3 py-2">
                    <Badge tone={e.severity === "critical" ? "danger" : e.severity === "warning" ? "warn" : "neutral"}>{e.severity}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px]" dir="ltr">{e.ip ?? "—"}</td>
                  <td className="px-3 py-2 max-w-xs truncate text-[11px] text-ink-400" title={e.detail ?? ""}>{e.detail ?? "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-ink-500">{formatRelative(e.created_at)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">🔐 ניסיונות התחברות כושלים</h2>
            {failedLogins.length === 0 ? (
              <p className="text-xs text-ink-400">אין ניסיונות כושלים.</p>
            ) : (
              <ul className="space-y-1.5 text-[11px]">
                {failedLogins.slice(0, 15).map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                    <span dir="ltr" className="truncate font-mono text-ink-300">{f.email_norm ?? "—"}</span>
                    <span className="shrink-0 text-ink-500">{f.reason ?? "—"}</span>
                    <span dir="ltr" className="shrink-0 font-mono text-ink-500">{f.ip ?? "—"}</span>
                    <span className="shrink-0 text-ink-500">{formatRelative(f.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">🔒 חשבונות נעולים</h2>
            {lockedAccounts.length === 0 ? (
              <p className="text-xs text-ink-400">אין חשבונות נעולים.</p>
            ) : (
              <ul className="space-y-1.5 text-[11px]">
                {lockedAccounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span dir="ltr" className="truncate">{a.email}</span>
                    <span className="text-amber-300">{a.failed_logins} ניסיונות</span>
                    <span className="text-ink-500">עד {formatRelative(a.locked_until)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">🌐 כתובות IP חשודות</h2>
            {topIps.length === 0 ? (
              <p className="text-xs text-ink-400">אין כתובות חשודות ב-3 הימים האחרונים.</p>
            ) : (
              <ul className="space-y-1.5 text-[11px]">
                {topIps.map((ip) => (
                  <li key={ip.ip} className="flex items-center justify-between gap-2">
                    <span dir="ltr" className="font-mono text-ink-200">{ip.ip}</span>
                    <span className="text-ink-400">{ip.hits} אירועים ({ip.kinds} סוגים)</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <h2 className="mb-2 text-sm font-bold">🧬 שלמות מסד הנתונים</h2>
        <ul className="grid gap-2 text-xs md:grid-cols-4">
          <li className="rounded-xl bg-white/[0.03] p-3">
            <span className="block text-ink-400">integrity_check</span>
            <b className={stats.integrity === "ok" ? "text-emerald-400" : "text-red-400"}>{stats.integrity}</b>
          </li>
          <li className="rounded-xl bg-white/[0.03] p-3">
            <span className="block text-ink-400">הפרות מפתח זר</span>
            <b className={stats.fkViolations === 0 ? "text-emerald-400" : "text-red-400"}>{stats.fkViolations}</b>
          </li>
          <li className="rounded-xl bg-white/[0.03] p-3">
            <span className="block text-ink-400">מצב יומן</span>
            <b>{stats.journalMode}</b>
          </li>
          <li className="rounded-xl bg-white/[0.03] p-3">
            <span className="block text-ink-400">אכיפת מפתחות זרים</span>
            <b className={stats.foreignKeys ? "text-emerald-400" : "text-red-400"}>{stats.foreignKeys ? "מופעל" : "כבוי"}</b>
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-400">
          גיבוי אוטומטי: ייצוא מלא זמין ב-<Link href="/api/export?type=backup" className="text-lemon-300 hover:underline">/api/export?type=backup</Link>.
          מומלץ להוריד גיבוי פעם ביום ולשמור מחוץ לשרת.
        </p>
      </Card>
    </div>
  );
}
