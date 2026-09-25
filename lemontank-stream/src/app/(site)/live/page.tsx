import type { Metadata } from "next";
import Link from "next/link";
import { all } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "שידורים חיים",
  description: "ערוצי טלוויזיה ושידורים חיים — חדשות, ספורט, סדרות וילדים",
};
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const user = await getCurrentUser();
  const isPlus = user?.effective_plan === "plus";
  const channels = all<{ id: number; number: number | null; name_he: string; logo_url: string | null; category: string; plan_access: string }>(
    "SELECT id, number, name_he, logo_url, category, plan_access FROM live_channels WHERE is_active = 1 ORDER BY sort_order, number",
  );

  const categories = [...new Set(channels.map((c) => c.category))];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-black md:text-3xl">📡 שידורים חיים</h1>
        <p className="text-sm text-ink-400">
          ערוצים בזמן אמת. ערוצי פרימיום (ספורט/סרטים ב-4K) זמינים למנויי פלוס.
        </p>
        {!isPlus ? (
          <Link href="/plans" className="w-fit rounded-xl bg-gradient-to-l from-plus-500 to-plus-600 px-4 py-2 text-xs font-bold text-white">
            ⭐ שדרג לפלוס לפתיחת כל הערוצים
          </Link>
        ) : null}
      </header>

      {channels.length === 0 ? (
        <EmptyState
          title="עוד אין ערוצים חיים"
          description="אדמין המערכת יכול להוסיף ערוצים בפאנל הניהול (ניהול תוכן → שידורים חיים)."
          icon="📡"
        />
      ) : (
        categories.map((cat) => (
          <section key={cat} aria-labelledby={`live-${cat}`}>
            <h2 id={`live-${cat}`} className="mb-3 text-lg font-extrabold">{cat}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {channels
                .filter((c) => c.category === cat)
                .map((c) => {
                  const locked = c.plan_access === "plus" && !isPlus;
                  return (
                    <Link
                      key={c.id}
                      href={locked ? "/plans" : `/live/${c.id}`}
                      className="card-surface group flex flex-col items-center gap-2 rounded-2xl p-4 transition hover:border-lemon-400/40"
                    >
                      <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-ink-800 text-2xl">
                        {c.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.logo_url} alt="" className="h-full w-full object-contain" loading="lazy" />
                        ) : (
                          "📺"
                        )}
                      </span>
                      <span className="text-center text-sm font-bold">{c.name_he}</span>
                      <span className="flex items-center gap-1 text-[0.8rem] text-ink-400">
                        {c.number ? <span>ערוץ {c.number}</span> : null}
                        {locked ? <span className="badge-plus">פלוס</span> : <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-red-500" />}
                      </span>
                    </Link>
                  );
                })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
