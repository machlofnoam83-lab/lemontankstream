import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { TitleCard } from "@/components/site/title-card";
import { availableYears, buildWrapUp } from "@/lib/wrapup";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "השנה שלי", robots: { index: false } };
export const dynamic = "force-dynamic";

const fmt = (value: number) => new Intl.NumberFormat("he-IL").format(Math.round(value));

export default async function WrappedPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser();
  const years = availableYears(user.id);
  const requested = Number((await searchParams).year);
  const year = years.includes(requested) ? requested : years[0];
  const wrap = buildWrapUp(user.id, year);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <header className="text-center">
        <div className="text-[0.9rem] uppercase tracking-[0.3em] text-lemon-300">Lemontank · Wrap-up</div>
        <h1 className="mt-2 text-4xl font-black md:text-6xl">השנה שלי {year}</h1>
        <p className="mt-3 text-lg text-ink-200">{wrap.personality}</p>
        <p className="mt-1 text-ink-400">{wrap.personalityNote}</p>
      </header>

      {years.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2">
          {years.map((option) => (
            <Link
              key={option}
              href={`/wrapped?year=${option}`}
              className={`rounded-full px-4 py-1.5 text-[0.92rem] ${
                option === year ? "bg-lemon-400 font-bold text-ink-950" : "bg-white/[0.07] hover:bg-white/[0.12]"
              }`}
            >
              {option}
            </Link>
          ))}
        </div>
      )}

      {!wrap.hasData ? (
        <Card className="p-8 text-center">
          <div className="text-4xl">🎬</div>
          <h2 className="mt-3 text-2xl font-black">עוד אין נתוני צפייה ל-{year}</h2>
          <p className="mt-2 text-ink-300">צפו במשהו, ותוך דקות תתחילו לראות כאן את הסיכום האישי שלכם.</p>
          <Link href="/movies" className="mt-4 inline-block rounded-xl bg-lemon-400 px-5 py-2.5 font-bold text-ink-950">
            לסרטים
          </Link>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "שעות צפייה", value: fmt(wrap.totalHours) },
              { label: "כותרים", value: fmt(wrap.titlesWatched) },
              { label: "פרקים", value: fmt(wrap.episodesWatched) },
              { label: "ימים עם צפייה", value: fmt(wrap.daysWatched) },
            ].map((stat) => (
              <Card key={stat.label} className="p-5 text-center">
                <div className="text-3xl font-black text-lemon-300">{stat.value}</div>
                <div className="mt-1 text-[0.9rem] text-ink-400">{stat.label}</div>
              </Card>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-5">
              <div className="text-[0.85rem] text-ink-400">הז&apos;אנר שלי</div>
              <div className="mt-1 text-2xl font-black">{wrap.favoriteGenre?.label ?? "—"}</div>
              {wrap.favoriteGenre && (
                <div className="mt-1 text-[0.9rem] text-ink-400">{fmt(Number(wrap.favoriteGenre.value))} דקות · {wrap.favoriteGenre.meta}</div>
              )}
            </Card>
            <Card className="p-5">
              <div className="text-[0.85rem] text-ink-400">החודש העמוס</div>
              <div className="mt-1 text-2xl font-black">{wrap.busiestMonth?.label ?? "—"}</div>
              <div className="mt-1 text-[0.9rem] text-ink-400">{wrap.busiestMonth ? `${wrap.busiestMonth.value} סשנים` : ""}</div>
            </Card>
            <Card className="p-5">
              <div className="text-[0.85rem] text-ink-400">הזמן שלי</div>
              <div className="mt-1 text-2xl font-black">{wrap.topHour?.label ?? "—"}</div>
              <div className="mt-1 text-[0.9rem] text-ink-400">{wrap.topDay ? `היום האהוב: ${wrap.topDay.label}` : ""}</div>
            </Card>
          </div>

          {wrap.topTitles.length > 0 && (
            <section>
              <h2 className="mb-3 text-2xl font-black">הטופ שלי</h2>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {wrap.topTitles.map((row, index) => (
                  <div key={row.slug ?? row.label} className="flex flex-col items-center">
                    <span className="mb-1 text-3xl font-black text-lemon-300">{index + 1}</span>
                    <div className="w-36">
                      <TitleCard
                        item={{ name_he: row.label, slug: row.slug ?? "", poster_url: row.poster_url ?? null, year: null } as never}
                        size="sm"
                      />
                    </div>
                    <span className="mt-1 text-[0.85rem] text-ink-400">{fmt(Number(row.value))} דקות</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {wrap.topPeople.length > 0 && (
            <section>
              <h2 className="mb-3 text-2xl font-black">האנשים של השנה</h2>
              <div className="flex flex-wrap gap-2">
                {wrap.topPeople.map((row) => (
                  <span key={row.label} className="rounded-full bg-white/[0.07] px-4 py-2 text-[0.95rem]">
                    {row.label} <span className="text-ink-400">· {row.value}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-5 text-center">
              <div className="text-3xl font-black">{wrap.longestStreak}</div>
              <div className="text-[0.9rem] text-ink-400">ימי רצף ארוך ביותר</div>
            </Card>
            <Card className="p-5 text-center">
              <div className="text-3xl font-black">{wrap.averageRating ?? "—"}</div>
              <div className="text-[0.9rem] text-ink-400">דירוג ממוצע שהענקת</div>
            </Card>
            <Card className="p-5 text-center">
              <div className="text-3xl font-black">{wrap.badgesEarned}</div>
              <div className="text-[0.9rem] text-ink-400">תגים שהרווחת</div>
            </Card>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/account/achievements" className="rounded-xl bg-white/[0.07] px-5 py-2.5 font-bold hover:bg-white/[0.12]">
              לתגים שלי
            </Link>
            <Link href="/account/history" className="rounded-xl bg-white/[0.07] px-5 py-2.5 font-bold hover:bg-white/[0.12]">
              היסטוריית צפייה
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
