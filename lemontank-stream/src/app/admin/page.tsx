import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, DataTable, StatCard } from "@/components/ui/primitives";
import { all, count, dbStats, get } from "@/lib/db";
import { catalogStats } from "@/lib/catalog";
import { securitySummary } from "@/lib/audit";
import { formatBytes, formatNumber, formatRelative, formatPrice } from "@/lib/format";
import { isAdminRole } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "דשבורד ניהול", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  if (!isAdminRole(user?.role)) redirect("/?error=forbidden");

  const catalog = catalogStats();
  const db = dbStats();
  const security = securitySummary();

  const revenue = get<{ total: number; month: number; count: number }>(
    `SELECT COALESCE(SUM(amount),0) total,
            COALESCE(SUM(CASE WHEN created_at > datetime('now','-30 day') THEN amount ELSE 0 END),0) month,
            COUNT(*) count
     FROM payments WHERE status='paid'`,
  );

  const usersByDay = all<{ day: string; count: number }>(
    `SELECT date(created_at) day, COUNT(*) count FROM users WHERE created_at > datetime('now','-14 day') AND deleted_at IS NULL GROUP BY day ORDER BY day`,
  );

  const topTitles = all<{ id: number; slug: string; name_he: string; kind: string; plan_access: string; views_count: number }>(
    "SELECT id, slug, name_he, kind, plan_access, views_count FROM titles WHERE deleted_at IS NULL ORDER BY views_count DESC LIMIT 8",
  );

  const recentAudit = all<{ action: string; actor_email: string | null; entity: string | null; severity: string; ip: string | null; created_at: string }>(
    "SELECT action, actor_email, entity, severity, ip, created_at FROM audit_log ORDER BY id DESC LIMIT 10",
  );

  const planSplit = all<{ plan_code: string; count: number }>("SELECT plan_code, COUNT(*) count FROM users WHERE deleted_at IS NULL GROUP BY plan_code");
  const newUsers7d = count("SELECT COUNT(*) c FROM users WHERE created_at > datetime('now','-7 day')");
  const activeNow = count("SELECT COUNT(*) c FROM sessions WHERE revoked_at IS NULL AND last_seen_at > datetime('now','-5 minute')");
  const watchMinutes = Math.round(
    Number(get<{ m: number }>("SELECT COALESCE(SUM(duration_sec)/60,0) m FROM watch_progress WHERE updated_at > datetime('now','-30 day')")?.m ?? 0),
  );

  const maxDay = Math.max(1, ...usersByDay.map((d) => Number(d.count)));
  const totalUsers = planSplit.reduce((sum, p) => sum + Number(p.count), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">דשבורד ניהול 📊</h1>
          <p className="mt-1 text-sm text-ink-400">תמונת מצב מלאה של הקטלוג, המשתמשים, ההכנסות והאבטחה.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/titles/new" className="rounded-xl bg-lemon-400 px-4 py-2.5 text-sm font-bold text-ink-900">+ הוסף סרט/סדרה</Link>
          <Link href="/admin/security" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm">בקרת אבטחה</Link>
        </div>
      </header>

      {/* ── מדדי קטלוג ── */}
      <section aria-labelledby="catalog-stats">
        <h2 id="catalog-stats" className="mb-3 text-sm font-bold text-ink-300">קטלוג</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <StatCard label="סרטים" value={formatNumber(catalog.movies)} icon={<span>🎬</span>} />
          <StatCard label="סדרות" value={formatNumber(catalog.series)} icon={<span>📺</span>} />
          <StatCard label="פרקים" value={formatNumber(catalog.episodes)} icon={<span>▶️</span>} />
          <StatCard label="תוכן חינם" value={formatNumber(catalog.freeTitles)} tone="success" />
          <StatCard label="תוכן פלוס" value={formatNumber(catalog.plusTitles)} />
          <StatCard label="סה״כ צפיות" value={formatNumber(catalog.views)} icon={<span>👀</span>} />
        </div>
      </section>

      {/* ── מדדי משתמשים והכנסות ── */}
      <section aria-labelledby="business-stats">
        <h2 id="business-stats" className="mb-3 text-sm font-bold text-ink-300">משתמשים והכנסות</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="משתמשים רשומים" value={formatNumber(totalUsers)} hint={`+${newUsers7d} בשבוע האחרון`} />
          <StatCard label="מנויי פלוס" value={formatNumber(catalog.plusUsers)} hint={`${totalUsers ? Math.round((catalog.plusUsers / totalUsers) * 100) : 0}% מהמשתמשים`} />
          <StatCard label="הכנסות (30 יום)" value={formatPrice(Number(revenue?.month ?? 0))} tone="success" hint={`סה״כ ${formatPrice(Number(revenue?.total ?? 0))}`} />
          <StatCard label="צופים פעילים כעת" value={formatNumber(activeNow)} hint={`${formatNumber(watchMinutes)} דקות צפייה ב-30 יום`} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── הרשמות לפי יום ── */}
        <Card className="p-5">
          <h2 className="text-sm font-bold">הרשמות ב-14 הימים האחרונים</h2>
          {usersByDay.length === 0 ? (
            <p className="mt-3 text-xs text-ink-400">אין הרשמות בתקופה הזו.</p>
          ) : (
            <div className="mt-4 flex h-32 items-end gap-1.5" role="img" aria-label="גרף הרשמות יומי">
              {usersByDay.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[9px] text-ink-400">{d.count}</span>
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-lemon-600 to-lemon-400"
                    style={{ height: `${(Number(d.count) / maxDay) * 100}%`, minHeight: "3px" }}
                    title={`${d.day}: ${d.count}`}
                  />
                  <span className="text-[8px] text-ink-500">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── מצב אבטחה ── */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">🛡️ מצב אבטחה (24 שעות)</h2>
            <Link href="/admin/security" className="text-xs text-lemon-300 hover:underline">פירוט ←</Link>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/[0.03] p-3">
              <dt className="text-ink-400">ניסיונות התחברות כושלים</dt>
              <dd className="mt-1 text-lg font-bold text-amber-300">{formatNumber(security.failedLogins)}</dd>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <dt className="text-ink-400">סשנים פעילים</dt>
              <dd className="mt-1 text-lg font-bold">{formatNumber(security.activeSessions)}</dd>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <dt className="text-ink-400">חריגות Rate Limit</dt>
              <dd className="mt-1 text-lg font-bold">{formatNumber(Number(get<{ c: number }>("SELECT COUNT(*) c FROM security_events WHERE kind LIKE 'rate_limit%' AND created_at > datetime('now','-1 day')")?.c ?? 0))}</dd>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-3">
              <dt className="text-ink-400">חסימות תקיפה</dt>
              <dd className="mt-1 text-lg font-bold text-red-300">{formatNumber(Number(get<{ c: number }>("SELECT COUNT(*) c FROM security_events WHERE kind LIKE 'attack_pattern%' AND created_at > datetime('now','-1 day')")?.c ?? 0))}</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Badge tone="success">מנוע: {db.settings.journalMode ?? "journal"}</Badge>
            <Badge tone="info">מסד: {formatBytes(db.sizeBytes)}</Badge>
            <Badge tone="neutral">{db.tableCount} טבלאות</Badge>
            <Badge tone={count("SELECT COUNT(*) c FROM users WHERE role IN ('admin','owner') AND twofa_enabled=0 AND deleted_at IS NULL") > 0 ? "warn" : "success"}>
              {count("SELECT COUNT(*) c FROM users WHERE role IN ('admin','owner') AND twofa_enabled=0 AND deleted_at IS NULL")} מנהלים בלי 2FA
            </Badge>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── הכותרים הנצפים ── */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">🔥 הכותרים הנצפים</h2>
          <DataTable head={["כותר", "סוג", "מסלול", "צפיות", ""]}>
            {topTitles.map((t) => (
              <tr key={t.id} className="hover:bg-white/[0.03]">
                <td className="px-3 py-2 font-medium">{t.name_he}</td>
                <td className="px-3 py-2 text-xs text-ink-300">{t.kind === "movie" ? "סרט" : "סדרה"}</td>
                <td className="px-3 py-2">{t.plan_access === "plus" ? <Badge tone="plus">פלוס</Badge> : <Badge tone="free">חינם</Badge>}</td>
                <td className="px-3 py-2 text-xs">{formatNumber(t.views_count)}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/titles/${t.id}`} className="text-xs text-lemon-300 hover:underline">עריכה</Link>
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>

        {/* ── יומן אחרון ── */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">📜 פעולות אחרונות</h2>
            <Link href="/admin/audit" className="text-xs text-lemon-300 hover:underline">יומן מלא ←</Link>
          </div>
          <ul className="mt-3 space-y-2 text-xs">
            {recentAudit.map((a, i) => (
              <li key={i} className="flex items-center gap-2 border-b border-white/5 pb-2 last:border-0">
                <Badge tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warn" : "neutral"}>{a.action}</Badge>
                <span className="min-w-0 flex-1 truncate text-ink-300">{a.actor_email ?? "מערכת"} · {a.entity ?? ""}</span>
                <span className="shrink-0 text-ink-500">{formatRelative(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-bold">🔧 פעולות מהירות</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link href="/admin/titles/new" className="rounded-xl bg-lemon-400 px-4 py-2 font-bold text-ink-900">+ סרט חדש</Link>
          <Link href="/admin/titles/new?kind=series" className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15">+ סדרה חדשה</Link>
          <Link href="/admin/collections" className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15">ניהול שורות הבית</Link>
          <Link href="/admin/users" className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15">הוספת משתמש / שינוי מנוי</Link>
          <Link href="/api/export?type=backup" className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15">גיבוי מלא (JSON)</Link>
          <Link href="/api/export?type=catalog&format=csv" className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15">ייצוא קטלוג (CSV)</Link>
        </div>
      </Card>
    </div>
  );
}
