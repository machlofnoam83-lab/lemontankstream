import Link from "next/link";
import { ContentRow } from "@/components/site/content-row";
import { Icon } from "@/components/ui/icons";
import { OrnamentRule } from "@/components/ui/ornaments";
import { EmptyCatalog } from "@/components/site/empty-catalog";
import { Hero } from "@/components/site/hero";
import { TitleCard } from "@/components/site/title-card";
import { catalogStats, homeRows, listCatalog, recommendationsFor, type TitleCard as TitleCardType } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/session";
import { isStaff } from "@/lib/rbac";
import { all } from "@/lib/db";
import { formatPrice, formatNumber } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** עמוד הבית — במה ראשית, שורות תוכן דינמיות, עשרת הגדולים והמסלולים */
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
  // הקטלוג ריק לגמרי — מציגים מסך "מתחילים מכאן" במקום שורות ריקות
  const catalogEmpty = stats.movies + stats.series === 0;

  // מחירי המסלולים נטענים מהמסד — כדי שהבית לא יציג מחיר שאינו מעודכן
  const planRows = all<{ code: string; name_he: string; price_ils: number; features_json: string }>(
    "SELECT code, name_he, price_ils, features_json FROM plans WHERE is_active = 1 ORDER BY sort_order",
  );
  const plansFromDb = planRows.map((row) => ({
    ...row,
    features: (JSON.parse(row.features_json || "[]") as string[]).slice(0, 6),
  }));

  // באנר שדרוג למשתמשי חינם
  const showUpgrade = !isPlus && !catalogEmpty;

  return (
    <div className="space-y-12">
      <Hero slides={heroSlides} isPlus={isPlus} />

      {/* שורת עובדות מהירות — "לוחית המניין" של הארכיון */}
      <section className="grid grid-cols-2 gap-3.5 md:grid-cols-4" aria-label="הקטלוג במספרים">
        {[
          { label: "סרטים", value: formatNumber(stats.movies), icon: "film" as const },
          { label: "סדרות", value: formatNumber(stats.series), icon: "reel" as const },
          { label: "פרקים", value: formatNumber(stats.episodes), icon: "play" as const },
          { label: "זמין בחינם", value: formatNumber(stats.freeTitles), icon: "check" as const },
        ].map((item, index) => (
          <div
            key={item.label}
            style={{ animationDelay: `${index * 60}ms` }}
            className="card-surface chamfer reveal-item group relative overflow-hidden px-4 py-4 lift hover:lift-hover hover:border-brass-300/40"
          >
            <span
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-brass-300/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden="true"
            />
            <div className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-parchment-300/70">
              <span
                className="flex size-7 items-center justify-center border border-brass-400/22 bg-brass-400/[0.07] text-brass-300 chamfer transition-transform duration-500 [transition-timing-function:var(--ease-ink)] group-hover:-translate-y-0.5"
                aria-hidden="true"
              >
                <Icon name={item.icon} className="size-4" />
              </span>
              {item.label}
            </div>
            <div className="mt-2.5 font-display text-2xl font-bold tracking-tight text-parchment-50 tabular-nums">
              {item.value}
            </div>
          </div>
        ))}
      </section>

      {showUpgrade ? (
        <section className="framed chamfer relative overflow-hidden bg-obsidian-950 p-6 md:p-9">
          <span
            className="pointer-events-none absolute -left-20 -top-28 size-72 rounded-full bg-oxblood-600/25 blur-3xl"
            aria-hidden="true"
          />
          <span className="pointer-events-none absolute inset-[6px] border border-brass-400/12" aria-hidden="true" />
          <div className="relative flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 border border-brass-400/40 bg-brass-400/[0.08] px-3 py-1 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-brass-200">
                <Icon name="hourglass" className="size-3.5" />
                7 ימי ניסיון חינם
              </span>
              <h2 className="mt-3 font-display text-2xl font-bold text-parchment-50 md:text-3xl">
                עברו ל־LemonTank <span className="text-brass-300">פלוס</span>
              </h2>
              <p className="mt-2 max-w-xl text-base leading-relaxed text-parchment-200/80">
                כל הסרטים והסדרות בפרימיום, איכות 4K, ארבעה מסכים במקביל, הורדות לצפייה בלי אינטרנט — ובלי פרסומות.
              </p>
            </div>
            <Link href="/plans" className="btn-primary sheen shrink-0">
              <Icon name="crown" className="size-4" />
              התחילו ניסיון חינם
            </Link>
          </div>
        </section>
      ) : null}

      {catalogEmpty ? <EmptyCatalog isStaff={isStaff(user?.role)} /> : null}

      {/* שורות דינמיות שהאדמין מנהל */}
      {!catalogEmpty &&
        rows.map((row) => (
          <ContentRow
            key={row.id}
            title={row.title}
            items={row.items}
            showProgress={row.continueWatching}
            variant={row.layout === "wide" || row.continueWatching ? "wide" : "poster"}
          />
        ))}

      {recommended.length ? <ContentRow title="מומלץ עבורך" icon="sparkles" items={recommended} /> : null}

      {/* עשרת הגדולים */}
      {top10.length ? (
        <section aria-labelledby="top10-heading">
          <h2 id="top10-heading" className="section-heading mb-4 px-1 text-parchment-100">
            <span className="section-heading-bar" aria-hidden="true" />
            <Icon name="seal" className="size-5 text-brass-400/90" />
            עשרת הגדולים של השבוע
          </h2>
          <ol className="row-scroll">
            {top10.map((item, i) => (
              <li key={item.id} className="row-scroll-item relative flex items-end">
                <span
                  className="pointer-events-none select-none font-display text-[5.5rem] font-bold leading-[0.72] text-brass-200/25 [-webkit-text-stroke:1px_rgba(201,154,74,0.45)] md:text-[7rem]"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="-me-6 md:-me-8">
                  <TitleCard item={item} size="sm" />
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <ContentRow title="חדש בפלטפורמה" icon="sparkles" items={newReleases} href="/new" />
      <ContentRow title="חינם לכולם" icon="check" items={freeItems} href="/movies?plan=free" />
      <ContentRow title="פרימיום בפלוס" icon="crown" items={plusItems} href="/plans" />

      {/* אזור המסלולים — נתונים מהמסד (מתעדכן מ-/admin/plans) */}
      {plansFromDb.length ? (
        <section aria-labelledby="plans-heading" className="pt-2">
          <OrnamentRule className="mb-8" />
          <h2 id="plans-heading" className="section-heading mb-5 justify-center px-1 text-center text-parchment-100">
            <span className="section-heading-bar" aria-hidden="true" />
            <Icon name="tag" className="size-5 text-brass-400/90" />
            המסלולים שלנו
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            {plansFromDb.map((plan) => {
              const isPlusPlan = plan.code === "plus";
              return (
                <div
                  key={plan.code}
                  className={`chamfer relative overflow-hidden p-6 lift hover:lift-hover ${
                    isPlusPlan
                      ? "border border-oxblood-500/40 bg-gradient-to-b from-oxblood-600/[0.22] to-obsidian-900/70 shadow-[0_30px_70px_-40px_rgba(124,36,48,0.95)]"
                      : "card-surface"
                  }`}
                >
                  {isPlusPlan ? (
                    <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full bg-oxblood-600/20 blur-3xl" aria-hidden="true" />
                  ) : null}
                  <div className="relative flex items-center justify-between gap-3">
                    <h3 className={`font-display text-xl font-bold ${isPlusPlan ? "text-parchment-50" : "text-parchment-100"}`}>
                      מסלול {plan.name_he}
                    </h3>
                    <span className={isPlusPlan ? "badge-plus" : "badge-free"}>
                      {Number(plan.price_ils) === 0 ? formatPrice(0) : `${formatPrice(Number(plan.price_ils))} / חודש`}
                    </span>
                  </div>
                  <ul className="relative mt-4 space-y-2.5 text-sm text-parchment-200/85">
                    {(plan.features.length ? plan.features : ["גישה לקטלוג לפי המסלול הזה"]).map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[0.8rem] font-black ${
                            isPlusPlan ? "bg-plus-500/25 text-plus-300" : "bg-verdigris-500/20 text-verdigris-300"
                          }`}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={isPlusPlan ? "/plans" : "/register"}
                    className={`chamfer relative mt-6 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-bold transition ${
                      isPlusPlan
                        ? "bg-gradient-to-b from-oxblood-500 to-oxblood-600 text-parchment-50 shadow-[0_16px_40px_-18px_rgba(124,36,48,1)] hover:brightness-110"
                        : "border border-brass-400/35 text-parchment-100 hover:border-brass-300/70 hover:bg-brass-400/[0.07]"
                    }`}
                  >
                    {isPlusPlan ? "שדרג לפלוס" : "פתח חשבון חינם"}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
