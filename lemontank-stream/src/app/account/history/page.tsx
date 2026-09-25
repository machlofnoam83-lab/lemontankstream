import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDuration, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "היסטוריית צפייה", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireUser();

  const items = all<{
    id: number; percent: number; completed: number; updated_at: string;
    title: string; slug: string; episode: string | null; season_number: number | null; episode_number: number | null;
    poster_url: string | null; duration_sec: number;
  }>(
    `SELECT wp.id, wp.percent, wp.completed, wp.updated_at, wp.duration_sec,
            t.name_he AS title, t.slug, t.poster_url,
            e.name_he AS episode, e.season_number, e.number AS episode_number
     FROM watch_progress wp
     JOIN titles t ON t.id = wp.title_id
     LEFT JOIN episodes e ON e.id = wp.episode_id
     WHERE wp.user_id = ? ORDER BY wp.updated_at DESC LIMIT 200`,
    [user.id],
  );

  if (items.length === 0) {
    return (
      <EmptyState
        title="היסטוריית הצפייה ריקה"
        description="ברגע שתתחיל לצפות — כל ההתקדמות תישמר כאן ותוכל להמשיך מכל מכשיר."
        icon="🕘"
        action={<Link href="/" className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">לדף הבית</Link>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black md:text-3xl">🕘 היסטוריית צפייה</h1>
          <p className="mt-1 text-sm text-ink-400">{items.length} כותרים שנצפו לאחרונה</p>
        </div>
        <Link href="/account/privacy" className="rounded-xl border border-white/15 px-4 py-2 text-xs">
          ניהול הפרטיות והנתונים שלי
        </Link>
      </header>

      <ul className="space-y-2">
        {items.map((row) => {
          const href = row.episode_number ? `/watch/${row.slug}?ep=${row.id}` : `/watch/${row.slug}`;
          return (
            <li key={row.id} className="flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
              <span className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                {row.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.poster_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/title/${row.slug}`} className="truncate font-bold hover:text-lemon-300">{row.title}</Link>
                {row.episode ? (
                  <div className="text-xs text-ink-400">עונה {row.season_number} · פרק {row.episode_number} — {row.episode}</div>
                ) : null}
                <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-400">
                  <span>{Math.round(Number(row.percent) * 100)}%</span>
                  <span>{formatRelative(row.updated_at)}</span>
                  {row.duration_sec ? <span>{formatDuration(row.duration_sec)}</span> : null}
                  {row.completed ? <span className="text-emerald-400">הושלם ✓</span> : null}
                </div>
                <div className="mt-1.5 h-1 w-full max-w-md rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-lemon-400" style={{ width: `${Math.min(100, Number(row.percent) * 100)}%` }} />
                </div>
              </div>
              <Link href={href} className="shrink-0 rounded-xl bg-lemon-400 px-3 py-2 text-xs font-bold text-ink-900">
                המשך ▶
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
