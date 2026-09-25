import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { contentHealth, engagementOverview, revenueOverview } from "@/lib/insights";
import { requirePermission } from "@/lib/rbac";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = { title: "תובנות · ניהול", robots: { index: false } };
export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });
const money = (value: number) => `₪${nf.format(Math.round(value * 100) / 100)}`;
const HOUR_LABEL = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export default async function InsightsPage() {
  const session = await getCurrentSession();
  requirePermission(session?.user, "analytics.read");

  const revenue = revenueOverview();
  const engagement = engagementOverview();
  const health = contentHealth();

  const maxTrend = Math.max(1, ...engagement.trend.map((row) => row.plays));
  const maxHour = Math.max(1, ...engagement.peakHours.map((row) => row.events));
  const maxRevenue = Math.max(1, ...revenue.monthly.map((row) => Number(row.revenue)));

  const funnelSteps = [
    { label: "נרשמו", value: engagement.funnel.registered },
    { label: "צפו במשהו", value: engagement.funnel.watchedOnce },
    { label: "5+ כותרים", value: engagement.funnel.watched5 },
    { label: "מנוי פלוס", value: engagement.funnel.plusMembers },
  ];
  const funnelTop = Math.max(1, funnelSteps[0].value);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">📊 תובנות</h1>
          <p className="mt-1 text-ink-300">הכנסות, מעורבות ובריאות הקטלוג — ישירות מאותם נתונים שהמערכת כבר אוגרת.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[0.85rem]">
          {[
            ["plans", "הכנסות לפי מסלול"],
            ["revenue", "הכנסות חודשיות"],
            ["engagement", "מגמת מעורבות"],
            ["health", "חסרים בקטלוג"],
          ].map(([report, label]) => (
            <a
              key={report}
              href={`/api/admin/insights?format=csv&report=${report}`}
              className="rounded-xl bg-white/[0.07] px-3 py-2 hover:bg-white/[0.12]"
            >
              ⬇ {label} (CSV)
            </a>
          ))}
        </div>
      </header>

      {/* ── הכנסות ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-2xl font-black">💰 הכנסות</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="text-[0.85rem] text-ink-400">MRR (הכנסה חודשית חוזרת)</div>
            <div className="mt-1 text-3xl font-black text-lemon-300">{money(revenue.mrr)}</div>
            <div className="mt-1 text-[0.85rem] text-ink-400">ARR: {money(revenue.arr)}</div>
          </Card>
          <Card className="p-5">
            <div className="text-[0.85rem] text-ink-400">החודש מול חודש קודם</div>
            <div className="mt-1 text-3xl font-black">{money(revenue.revenueThisMonth)}</div>
            <div className="mt-1 text-[0.85rem] text-ink-400">
              חודש קודם {money(revenue.revenuePrevMonth)}
              {revenue.growthPct !== null && (
                <span className={revenue.growthPct >= 0 ? " text-emerald-300" : " text-red-300"}>
                  {" "}
                  ({revenue.growthPct >= 0 ? "+" : ""}
                  {revenue.growthPct}%)
                </span>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-[0.85rem] text-ink-400">מנויים משלמים</div>
            <div className="mt-1 text-3xl font-black">{revenue.payingUsers}</div>
            <div className="mt-1 text-[0.85rem] text-ink-400">
              ARPU {money(revenue.arpu)} · המרה {revenue.conversionRate}%
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-[0.85rem] text-ink-400">מנויים פעילים</div>
            <div className="mt-1 text-3xl font-black">{revenue.activeSubscriptions}</div>
            <div className="mt-1 text-[0.85rem] text-ink-400">
              ניסיון {revenue.trialing} · פג תוקף בקרוב {revenue.expiringSoon} · כשלי חיוב 30 יום {revenue.failuresLast30}
            </div>
          </Card>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="font-bold">הכנסות לפי מסלול</h3>
            <table className="mt-3 w-full text-right text-[0.92rem]">
              <thead className="text-ink-400">
                <tr>
                  <th className="pb-2">מסלול</th>
                  <th className="pb-2">מחיר</th>
                  <th className="pb-2">מנויים</th>
                  <th className="pb-2">MRR</th>
                </tr>
              </thead>
              <tbody>
                {revenue.byPlan.map((row) => (
                  <tr key={row.plan_code} className="border-t border-white/10">
                    <td className="py-2 font-bold">{row.name_he}</td>
                    <td className="py-2">{money(Number(row.price))}</td>
                    <td className="py-2">{row.subscribers}</td>
                    <td className="py-2 font-bold text-lemon-300">{money(Number(row.mrr))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h3 className="font-bold">12 חודשים אחרונים</h3>
            {revenue.monthly.length === 0 ? (
              <p className="mt-3 text-ink-400">עוד אין תשלומים רשומים — הדוח יתמלא אוטומטית.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {revenue.monthly.slice(0, 6).map((row) => (
                  <li key={row.month} className="flex items-center gap-3">
                    <span className="w-20 text-[0.85rem] text-ink-400">{row.month}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full bg-lemon-400"
                        style={{ width: `${Math.max(3, (Number(row.revenue) / maxRevenue) * 100)}%` }}
                      />
                    </span>
                    <span className="w-24 text-left text-[0.9rem] font-bold">{money(Number(row.revenue))}</span>
                    <span className="w-16 text-[0.8rem] text-ink-500">{row.payments} תשלומים</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {/* ── מעורבות ────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-2xl font-black">👀 מעורבות</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "פעילים היום", value: engagement.dau, meta: `7 ימים: ${engagement.wau} · 30 יום: ${engagement.mau}` },
            { label: "דביקות (DAU/MAU)", value: `${engagement.stickiness}%`, meta: `כרגע באתר: ${engagement.activeNow}` },
            { label: "שעות צפייה (30 יום)", value: engagement.watchHours30, meta: `השלמות: ${engagement.completions30}` },
            { label: "אורך סשן ממוצע", value: `${engagement.avgSessionMinutes} דק׳`, meta: "לפי אירועי נגן" },
          ].map((stat) => (
            <Card key={stat.label} className="p-5">
              <div className="text-[0.85rem] text-ink-400">{stat.label}</div>
              <div className="mt-1 text-3xl font-black">{stat.value}</div>
              <div className="mt-1 text-[0.82rem] text-ink-500">{stat.meta}</div>
            </Card>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card className="p-5">
            <h3 className="font-bold">14 ימים אחרונים</h3>
            <div className="mt-4 flex h-32 items-end gap-1">
              {engagement.trend.map((row) => (
                <div key={row.day} className="group flex flex-1 flex-col items-center justify-end gap-1">
                  <span
                    className="w-full rounded-t bg-lemon-400/80 transition group-hover:bg-lemon-300"
                    style={{ height: `${Math.max(2, (row.plays / maxTrend) * 100)}%` }}
                    title={`${row.day}: ${row.plays} נגינות, ${row.viewers} צופים`}
                  />
                  <span className="text-[0.6rem] text-ink-500">{row.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-bold">משפך משתמשים</h3>
            <ul className="mt-3 space-y-3">
              {funnelSteps.map((step) => (
                <li key={step.label}>
                  <div className="flex justify-between text-[0.88rem]">
                    <span>{step.label}</span>
                    <span className="font-bold">{step.value}</span>
                  </div>
                  <span className="mt-1 block h-2 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-plus-400" style={{ width: `${(step.value / funnelTop) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <h3 className="font-bold">הנצפים (30 יום)</h3>
            {engagement.topTitles.length === 0 ? (
              <p className="mt-2 text-[0.9rem] text-ink-400">אין נתוני צפייה עדיין.</p>
            ) : (
              <ol className="mt-3 space-y-1 text-[0.92rem]">
                {engagement.topTitles.slice(0, 6).map((row, index) => (
                  <li key={row.title_id} className="flex items-center gap-2">
                    <span className="text-ink-500">{index + 1}.</span>
                    <Link href={`/title/${row.slug}`} className="flex-1 truncate hover:text-lemon-300">{row.name}</Link>
                    <span className="text-ink-400">{row.views}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-bold">חיפושים מובילים</h3>
            {engagement.topSearches.length === 0 ? (
              <p className="mt-2 text-[0.9rem] text-ink-400">עוד אין חיפושים.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {engagement.topSearches.map((row) => (
                  <li key={row.term} className="rounded-full bg-white/[0.07] px-3 py-1 text-[0.85rem]">
                    {row.term} <span className="text-ink-500">· {row.hits}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-bold">שעות שיא</h3>
            <div className="mt-3 space-y-[3px]">
              {engagement.peakHours.filter((row) => row.events > 0).map((row) => (
                <div key={row.hour} className="flex items-center gap-2 text-[0.78rem]">
                  <span className="w-10 text-ink-500">{HOUR_LABEL(row.hour)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-sky-400/80" style={{ width: `${(row.events / maxHour) * 100}%` }} />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* ── בריאות הקטלוג ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-2xl font-black">🧩 בריאות הקטלוג</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="text-[0.85rem] text-ink-400">כותרים</div>
            <div className="mt-1 text-3xl font-black">{health.titles}</div>
            <div className="mt-1 text-[0.82rem] text-ink-400">
              {health.movies} סרטים · {health.series} סדרות · {health.published} מפורסמים
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-[0.85rem] text-ink-400">מוכנות לצפייה</div>
            <div className="mt-1 text-3xl font-black text-lemon-300">{health.completeness}%</div>
            <div className="mt-1 text-[0.82rem] text-ink-400">{health.noMedia} כותרים בלי קובץ וידאו</div>
          </Card>
          <Card className="p-5">
            <div className="text-[0.85rem] text-ink-400">פרקים</div>
            <div className="mt-1 text-3xl font-black">{health.episodes}</div>
            <div className="mt-1 text-[0.82rem] text-ink-400">{health.emptySeries} סדרות בלי פרקים</div>
          </Card>
          <Card className="p-5">
            <div className="text-[0.85rem] text-ink-400">הורדות</div>
            <div className="mt-1 text-3xl font-black">{health.titles - health.notDownloadable}</div>
            <div className="mt-1 text-[0.82rem] text-ink-400">מתוכם {health.notDownloadable} לא מאפשרים הורדה</div>
          </Card>
        </div>

        <Card className="mt-4 p-5">
          <h3 className="font-bold">מה כדאי להשלים (ממוין לפי כמות)</h3>
          {health.issues.length === 0 ? (
            <p className="mt-2 text-emerald-300">הכל מלא — כל הכותרות עם מטא-דאטה מלא 🎉</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/10">
              {health.issues.map((issue) => (
                <li key={issue.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <div className="font-bold">{issue.label}</div>
                    <div className="text-[0.85rem] text-ink-400">{issue.hint}</div>
                  </div>
                  <span className="rounded-full bg-white/[0.07] px-3 py-1 text-[0.9rem] font-bold">{issue.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[0.85rem] text-ink-500">
            {health.stale90} כותרים לא עודכנו 90 יום. הנתונים מחושבים בזמן אמת — אין כאן קאשינג.
          </p>
        </Card>
      </section>
    </div>
  );
}
