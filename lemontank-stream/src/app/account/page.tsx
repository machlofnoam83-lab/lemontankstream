import type { Metadata } from "next";
import Link from "next/link";
import { Card, StatCard } from "@/components/ui/primitives";
import { ContinueWatchingStrip } from "@/components/site/continue-watching-strip";
import { continueWatching } from "@/lib/catalog";
import { all, count, get } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMinutes, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "האזור האישי", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  const stats = {
    watched: count("SELECT COUNT(*) c FROM watch_progress WHERE user_id = ?", [user.id]),
    completed: count("SELECT COUNT(*) c FROM watch_progress WHERE user_id = ? AND completed = 1", [user.id]),
    inList: count("SELECT COUNT(*) c FROM watchlist WHERE user_id = ? AND kind='list'", [user.id]),
    minutes: Math.round(Number(get<{ m: number }>("SELECT COALESCE(SUM(duration_sec)/60,0) m FROM watch_progress WHERE user_id = ?", [user.id])?.m ?? 0)),
    profiles: count("SELECT COUNT(*) c FROM profiles WHERE user_id = ?", [user.id]),
  };

  const recent = all<{ title: string; slug: string; episode: string | null; updated_at: string; percent: number }>(
    `SELECT t.name_he AS title, t.slug, e.name_he AS episode, wp.updated_at, wp.percent
     FROM watch_progress wp JOIN titles t ON t.id = wp.title_id
     LEFT JOIN episodes e ON e.id = wp.episode_id
     WHERE wp.user_id = ? ORDER BY wp.updated_at DESC LIMIT 6`,
    [user.id],
  );

  const notifications = all<{ title: string; body: string | null; created_at: string }>(
    "SELECT title, body, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 4",
    [user.id],
  );

  const security = get<{ twofa_enabled: number; created_at: string; last_login_at: string | null; last_login_ip: string | null }>(
    "SELECT twofa_enabled, created_at, last_login_at, last_login_ip FROM users WHERE id = ?",
    [user.id],
  );
  const activeSessions = count("SELECT COUNT(*) c FROM sessions WHERE user_id = ? AND revoked_at IS NULL", [user.id]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black md:text-3xl">שלום, {user.name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-sm text-ink-400">הנה סיכום הפעילות שלך ב-LemonTank.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="כותרים שנצפו" value={stats.watched} icon={<span aria-hidden="true">🎬</span>} />
        <StatCard label="הושלמו" value={stats.completed} tone="success" icon={<span aria-hidden="true">✅</span>} />
        <StatCard label="ברשימה שלי" value={stats.inList} icon={<span aria-hidden="true">🔖</span>} />
        <StatCard label="זמן צפייה" value={formatMinutes(stats.minutes)} icon={<span aria-hidden="true">⏱️</span>} />
      </div>

      {!security?.twofa_enabled ? (
        <Card className="border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-amber-200">🔐 החשבון שלך לא מוגן באימות דו-שלבי</h2>
              <p className="mt-1 text-xs text-amber-200/80">
                הפעלת 2FA מוסיפה שכבת הגנה קריטית — גם אם הסיסמה תיחשף, אף אחד לא יוכל להתחבר.
              </p>
            </div>
            <Link href="/account/security" className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black">
              הפעל 2FA עכשיו
            </Link>
          </div>
        </Card>
      ) : null}

      {(() => {
        const items = continueWatching(user.id, 8);
        return items.length ? <ContinueWatchingStrip items={items} /> : null;
      })()}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">🕘 צפיות אחרונות</h2>
          {recent.length === 0 ? (
            <p className="text-xs text-ink-400">עוד לא צפית בכלום. אפשר להתחיל מהקטלוג.</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/title/${r.slug}`} className="min-w-0 flex-1 truncate hover:text-lemon-300">
                    {r.title}
                    {r.episode ? <span className="text-ink-400"> · {r.episode}</span> : null}
                  </Link>
                  <span className="shrink-0 text-[0.85rem] text-ink-400">{Math.round(r.percent * 100)}%</span>
                  <span className="shrink-0 text-[0.85rem] text-ink-500">{formatRelative(r.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">🔔 עדכונים</h2>
          {notifications.length === 0 ? (
            <p className="text-xs text-ink-400">אין התראות חדשות.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {notifications.map((n, i) => (
                <li key={i} className="rounded-xl bg-white/[0.02] p-3">
                  <div className="font-medium">{n.title}</div>
                  {n.body ? <div className="mt-0.5 text-xs text-ink-400">{n.body}</div> : null}
                  <div className="mt-1 text-[0.8rem] text-ink-500">{formatRelative(n.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notifications" className="mt-3 inline-block text-xs text-lemon-300 hover:underline">
            כל ההתראות ←
          </Link>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-bold">🔐 מצב האבטחה</h2>
        <dl className="grid gap-3 text-xs md:grid-cols-3">
          <div>
            <dt className="text-ink-400">אימות דו-שלבי</dt>
            <dd className={security?.twofa_enabled ? "font-bold text-emerald-400" : "font-bold text-amber-300"}>
              {security?.twofa_enabled ? "פעיל ✓" : "לא פעיל"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-400">מכשירים מחוברים</dt>
            <dd className="font-bold">{activeSessions}</dd>
          </div>
          <div>
            <dt className="text-ink-400">התחברות אחרונה</dt>
            <dd className="font-bold">{security?.last_login_at ? formatRelative(security.last_login_at) : "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-400">IP אחרון</dt>
            <dd className="font-mono text-[0.85rem]" dir="ltr">{security?.last_login_ip ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-400">חשבון נוצר</dt>
            <dd className="font-bold">{formatRelative(security?.created_at ?? "")}</dd>
          </div>
          <div>
            <dt className="text-ink-400">פרופילים</dt>
            <dd className="font-bold">{stats.profiles} / {user.effective_plan === "plus" ? 5 : 2}</dd>
          </div>
        </dl>
        <Link href="/account/security" className="mt-3 inline-block text-xs text-lemon-300 hover:underline">
          ניהול אבטחה ומכשירים ←
        </Link>
      </Card>
    </div>
  );
}
