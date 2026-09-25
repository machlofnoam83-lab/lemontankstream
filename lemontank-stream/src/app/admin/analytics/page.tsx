import type { Metadata } from "next";
import { BarChart, type Bar } from "@/components/admin/bar-chart";
import { Card, DataTable, StatCard } from "@/components/ui/primitives";
import { all, count, get } from "@/lib/db";
import { formatCompact, formatMinutes, formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "אנליטיקה", robots: { index: false } };
export const dynamic = "force-dynamic";

const shortDay = (day: string) => day.slice(5); // MM-DD

/** לוח אנליטיקה — צפיות, זמן צפייה, המרות, התנהגות צופים וזמן תגובה של הקטלוג */
export default async function AdminAnalyticsPage() {
  const days = 30;

  const viewsByDay = all<{ day: string; views: number; minutes: number }>(
    `SELECT day, SUM(views) views, SUM(minutes) minutes FROM title_views_daily
     WHERE day >= date('now', '-${days} day') GROUP BY day ORDER BY day`,
  );
  const viewsBars: Bar[] = viewsByDay.map((r) => ({ label: shortDay(r.day), value: Number(r.views) }));

  const signupsByDay = all<{ day: string; c: number }>(
    `SELECT substr(created_at, 1, 10) day, COUNT(*) c FROM users
     WHERE created_at > datetime('now', '-${days} day') GROUP BY day ORDER BY day`,
  );
  const signupBars: Bar[] = signupsByDay.map((r) => ({ label: shortDay(r.day), value: Number(r.c) }));

  const plays = count(`SELECT COUNT(*) c FROM analytics_events WHERE kind='play'`);
  const finishes = count(`SELECT COUNT(*) c FROM analytics_events WHERE kind='finish'`);
  const events30 = count(`SELECT COUNT(*) c FROM analytics_events WHERE created_at > datetime('now','-${days} day')`);
  const searcheEvents = all<{ q: string; c: number }>(
    `SELECT json_extract(meta, '$.q') q, COUNT(*) c FROM analytics_events
     WHERE kind = 'search' AND meta IS NOT NULL AND created_at > datetime('now','-${days} day')
     GROUP BY q HAVING q IS NOT NULL ORDER BY c DESC LIMIT 12`,
  );

  const totals = {
    views30: Number(get<{ v: number }>(`SELECT COALESCE(SUM(views),0) v FROM title_views_daily WHERE day >= date('now','-${days} day')`)?.v ?? 0),
    minutes30: Number(get<{ v: number }>(`SELECT COALESCE(SUM(minutes),0) v FROM title_views_daily WHERE day >= date('now','-${days} day')`)?.v ?? 0),
    users: count("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL"),
    plus: count("SELECT COUNT(*) c FROM users WHERE plan_code='plus' AND deleted_at IS NULL"),
    active7: count("SELECT COUNT(DISTINCT user_id) c FROM analytics_events WHERE user_id IS NOT NULL AND created_at > datetime('now','-7 day')"),
    active30: count("SELECT COUNT(DISTINCT user_id) c FROM analytics_events WHERE user_id IS NOT NULL AND created_at > datetime('now','-30 day')"),
    withProgress30: count("SELECT COUNT(DISTINCT user_id) c FROM watch_progress WHERE updated_at > datetime('now','-30 day')"),
    titlesPublished: count("SELECT COUNT(*) c FROM titles WHERE status='published' AND deleted_at IS NULL"),
    titlesDraft: count("SELECT COUNT(*) c FROM titles WHERE status='draft' AND deleted_at IS NULL"),
    episodes: count("SELECT COUNT(*) c FROM episodes WHERE deleted_at IS NULL"),
    storageBytes: Number(get<{ s: number }>("SELECT COALESCE(SUM(bytes),0) s FROM media_assets")?.s ?? 0),
  };

  const topTitles = all<{ id: number; name_he: string; kind: string; plan_access: string; views: number; minutes: number }>(
    `SELECT t.id, t.name_he, t.kind, t.plan_access, SUM(v.views) views, SUM(v.minutes) minutes
     FROM title_views_daily v JOIN titles t ON t.id = v.title_id
     WHERE v.day >= date('now','-${days} day')
     GROUP BY t.id ORDER BY views DESC LIMIT 15`,
  );

  const topGenres = all<{ name_he: string; icon: string | null; views: number }>(
    `SELECT g.name_he, g.icon, COALESCE(SUM(v.views), 0) views
     FROM genres g
     LEFT JOIN title_genres tg ON tg.genre_id = g.id
     LEFT JOIN title_views_daily v ON v.title_id = tg.title_id AND v.day >= date('now','-${days} day')
     GROUP BY g.id ORDER BY views DESC LIMIT 12`,
  );

  const topEpisodes = all<{ id: number; name_he: string; series: string; views_count: number }>(
    `SELECT e.id, e.name_he, t.name_he series, e.views_count
     FROM episodes e JOIN titles t ON t.id = e.title_id
     WHERE e.deleted_at IS NULL ORDER BY e.views_count DESC LIMIT 10`,
  );

  const platforms = all<{ platform: string | null; c: number }>(
    `SELECT platform, COUNT(*) c FROM devices GROUP BY platform ORDER BY c DESC LIMIT 8`,
  );

  const completion = plays ? finishes / plays : 0;
  const plusShare = totals.users ? totals.plus / totals.users : 0;
  const stickiness = totals.active30 ? totals.active7 / totals.active30 : 0;

  const genreBars: Bar[] = topGenres.map((g) => ({ label: (g.icon ? `${g.icon} ` : "") + g.name_he, value: Number(g.views) }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">📊 אנליטיקה</h1>
        <p className="mt-1 text-sm text-ink-400">30 הימים האחרונים · מבוסס טבלאות title_views_daily, analytics_events ו-devices (ללא איסוף מידע אישי מזהה).</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="צפיות (30 יום)" value={formatCompact(totals.views30)} />
        <StatCard label="זמן צפייה" value={formatMinutes(totals.minutes30)} />
        <StatCard label="אירועים (30 יום)" value={formatCompact(events30)} />
        <StatCard label="שיעור השלמה" value={formatPercent(completion)} hint={`${formatNumber(finishes)} מתוך ${formatNumber(plays)}`} />
        <StatCard label="מנויי פלוס" value={formatPercent(plusShare)} hint={`${formatNumber(totals.plus)} משתמשים`} tone="success" />
        <StatCard label="חזרה שבועית" value={formatPercent(stickiness)} hint="פעילים השבוע / פעילים החודש" />
        <StatCard label="קטלוג" value={`${formatNumber(totals.titlesPublished)} ↓`} hint={`${formatNumber(totals.episodes)} פרקים · ${formatNumber(totals.titlesDraft)} טיוטות`} />
        <StatCard label="מדיה מאוחסנת" value={formatCompact(Math.round(totals.storageBytes / 1024))} hint="ק״ב" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">צפיות לפי יום</h2>
          {viewsBars.length ? <BarChart data={viewsBars} /> : <p className="text-xs text-ink-400">אין עדיין נתוני צפייה — הנתונים נאספים מהרגע שכותר פורסם.</p>}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">הרשמות חדשות לפי יום</h2>
          {signupBars.length ? <BarChart data={signupBars} tone="emerald" /> : <p className="text-xs text-ink-400">אין הרשמות ב-30 הימים האחרונים.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">🏆 הכותרים הנצפים</h2>
          {topTitles.length === 0 ? (
            <p className="text-xs text-ink-400">אין נתונים עדיין.</p>
          ) : (
            <DataTable head={["כותר", "סוג", "הרשאה", "צפיות", "זמן"]}>
              {topTitles.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.03]">
                  <td className="px-3 py-2 text-xs">{t.name_he}</td>
                  <td className="px-3 py-2 text-[11px] text-ink-400">{t.kind === "series" ? "סדרה" : "סרט"}</td>
                  <td className="px-3 py-2 text-[11px]">{t.plan_access === "plus" ? "⭐ פלוס" : "חינם"}</td>
                  <td className="px-3 py-2 text-xs">{formatNumber(Number(t.views))}</td>
                  <td className="px-3 py-2 text-[11px] text-ink-400">{formatMinutes(Number(t.minutes))}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">🎭 ז'אנרים מובילים</h2>
            {genreBars.length ? <BarChart data={genreBars} tone="plus" height={90} /> : <p className="text-xs text-ink-400">אין נתונים.</p>}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">🔍 חיפושים מובילים</h2>
            {searcheEvents.length === 0 ? (
              <p className="text-xs text-ink-400">אין חיפושים מתועדים עדיין.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {searcheEvents.map((s) => (
                  <li key={s.q} className="rounded-full bg-white/5 px-3 py-1 text-[11px]">
                    {s.q} <span className="text-ink-500">×{s.c}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">📺 פרקים נצפים</h2>
          {topEpisodes.length === 0 ? (
            <p className="text-xs text-ink-400">אין פרקים עדיין.</p>
          ) : (
            <DataTable head={["פרק", "סדרה", "צפיות"]}>
              {topEpisodes.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-xs">{e.name_he}</td>
                  <td className="px-3 py-2 text-[11px] text-ink-400">{e.series}</td>
                  <td className="px-3 py-2 text-xs">{formatNumber(Number(e.views_count))}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">📱 מכשירים</h2>
          {platforms.length === 0 ? (
            <p className="text-xs text-ink-400">אין מכשירים רשומים — מכשירים נרשמים בכניסה לחשבון.</p>
          ) : (
            <DataTable head={["פלטפורמה", "מכשירים"]}>
              {platforms.map((p, i) => (
                <tr key={`${p.platform ?? "unknown"}-${i}`}>
                  <td className="px-3 py-2 text-xs" dir="ltr">{p.platform ?? "לא ידוע"}</td>
                  <td className="px-3 py-2 text-xs">{formatNumber(Number(p.c))}</td>
                </tr>
              ))}
            </DataTable>
          )}
          <p className="mt-3 text-[11px] text-ink-500">
            צופים עם התקדמות צפייה ב-30 יום: {formatNumber(totals.withProgress30)} — זה המדד האמיתי לחזרה, לא מספר החיפושים.
          </p>
        </Card>
      </div>
    </div>
  );
}
