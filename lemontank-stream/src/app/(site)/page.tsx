import Link from "next/link";
import { ContentRow } from "@/components/site/content-row";
import { Hero } from "@/components/site/hero";
import { TitleCard } from "@/components/site/title-card";
import { catalogStats, homeRows, listCatalog, recommendationsFor, type TitleCard as TitleCardType } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

/** עמוד הבית — באנר, המשך צפייה, שורות תוכן דינמיות והמלצות מותאמות */
export default async function HomePage() {
  const user = await getCurrentUser();
  const settings = getSettings();
  const isPlus = user?.effective_plan === "plus";

  const featured = listCatalog({ sort: "trending", limit: 5, featuredOnly: false }).items;
  const heroSlides = (settings.hero_slides?.length
    ? settings.hero_slides
        .map((slide) => (slide.title_id ? featured.find((f) => f.id === slide.title_id) : undefined))
        .filter(Boolean)
    : featured.slice(0, 4)) as TitleCardType[];

  const rows = homeRows(user);
  const recommended = user ? recommendationsFor(user.id, 18) : [];
  const newReleases = listCatalog({ sort: "added", limit: 18 }).items;
  const top10 = listCatalog({ sort: "popular", limit: 10 }).items;
  const freeItems = listCatalog({ plan: "free", sort: "trending", limit: 18 }).items;
  const plusItems = listCatalog({ plan: "plus", sort: "trending", limit: 18 }).items;
  const stats = catalogStats();

  // באנר שדרוג למשתמשי חינם
  const showUpgrade = !isPlus;

  return (
    <div className="space-y-10">
      <Hero slides={heroSlides} isPlus={isPlus} />

      {/* שורת עובדות מהירות — חיזוק אמון */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "סרטים", value: formatNumber(stats.movies), icon: "🎬" },
          { label: "סדרות", value: formatNumber(stats.series), icon: "📺" },
          { label: "פרקים", value: formatNumber(stats.episodes), icon: "▶️" },
          { label: "זמין בחינם", value: formatNumber(stats.freeTitles), icon: "🆓" },
        ].map((item) => (
          <div key={item.label} className="card-surface rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-ink-300">
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </div>
            <div className="mt-1 text-xl font-black">{item.value}</div>
          </div>
        ))}
      </section>

      {showUpgrade ? (
        <section className="relative overflow-hidden rounded-2xl border border-plus-500/30 bg-gradient-to-l from-plus-600/25 via-ink-850 to-ink-850 p-5 md:p-7">
          <div className="relative z-10 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black md:text-2xl">עברו ל-LemonTank <span className="text-plus-400">פלוס</span> ⭐</h2>
              <p className="mt-1 max-w-xl text-sm text-ink-300">
                כל הסרטים והסדרות בפרימיום, איכות 4K, 4 מסכים במקביל, הורדות לצפייה בלי אינטרנט — ובלי פרסומות. 7 ימי ניסיון חינם.
              </p>
            </div>
            <Link href="/plans" className="shrink-0 rounded-xl bg-gradient-to-l from-plus-500 to-plus-600 px-6 py-3 text-sm font-black text-white hover:brightness-110">
              התחל ניסיון חינם
            </Link>
          </div>
        </section>
      ) : null}

      {/* שורות דינמיות שהאדמין מנהל */}
      {rows.map((row) => (
        <ContentRow
          key={row.id}
          title={row.title}
          items={row.items}
          showProgress={row.continueWatching}
          variant={row.layout === "wide" || row.continueWatching ? "wide" : "poster"}
        />
      ))}

      {recommended.length ? <ContentRow title="מומלץ עבורך ✨" items={recommended} /> : null}

      {/* עשרת הגדולים */}
      {top10.length ? (
        <section aria-labelledby="top10-heading">
          <h2 id="top10-heading" className="mb-4 text-lg font-extrabold md:text-2xl">
            🏆 עשרת הגדולים של השבוע
          </h2>
          <ol className="row-scroll">
            {top10.map((item, i) => (
              <li key={item.id} className="row-scroll-item relative flex items-end gap-1">
                <span className="select-none text-6xl font-black leading-none text-white/15 md:text-8xl" aria-hidden="true">
                  {i + 1}
                </span>
                <TitleCard item={item} size="sm" />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <ContentRow title="חדש בפלטפורמה" items={newReleases} href="/new" />
      <ContentRow title="חינם לכולם 🆓" items={freeItems} href="/movies?plan=free" />
      <ContentRow title="פרימיום בפלוס ⭐" items={plusItems} href="/plans" />

      {/* אזור הסבר על המסלולים */}
      <section className="grid gap-4 md:grid-cols-2" aria-label="המסלולים שלנו">
        <div className="card-surface rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black">מסלול חינם</h3>
            <span className="badge-free">₪0</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-300">
            <li>✓ כל תוכן החינם — סרטים, סדרות ופרקים</li>
            <li>✓ איכות עד 720p</li>
            <li>✓ מסך אחד בכל פעם</li>
            <li>✓ עם פרסומות קצרות</li>
          </ul>
          <Link href="/register" className="mt-4 inline-block rounded-xl border border-white/20 px-5 py-2.5 text-sm font-bold hover:bg-white/10">
            פתח חשבון חינם
          </Link>
        </div>
        <div className="card-surface rounded-2xl border-plus-500/30 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-plus-400">מסלול פלוס ⭐</h3>
            <span className="badge-plus">₪19.90 / חודש</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-300">
            <li>✓ כל התוכן כולל פרימיום ומקורי LemonTank</li>
            <li>✓ איכות עד 4K + Dolby</li>
            <li>✓ 4 מסכים במקביל ו-5 פרופילים</li>
            <li>✓ הורדות לצפייה בלי אינטרנט</li>
            <li>✓ ללא פרסומות, גישה מוקדמת לפרקים</li>
          </ul>
          <Link href="/plans" className="mt-4 inline-block rounded-xl bg-gradient-to-l from-plus-500 to-plus-600 px-5 py-2.5 text-sm font-black text-white">
            שדרג לפלוס
          </Link>
        </div>
      </section>
    </div>
  );
}
