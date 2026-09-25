import Link from "next/link";
import { ContentRow } from "@/components/site/content-row";
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

      {/* שורת עובדות מהירות — חיזוק אמון */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="הקטלוג במספרים">
        {[
          { label: "סרטים", value: formatNumber(stats.movies), icon: "🎬" },
          { label: "סדרות", value: formatNumber(stats.series), icon: "📺" },
          { label: "פרקים", value: formatNumber(stats.episodes), icon: "▶️" },
          { label: "זמין בחינם", value: formatNumber(stats.freeTitles), icon: "🆓" },
        ].map((item) => (
          <div
            key={item.label}
            className="card-surface group relative overflow-hidden rounded-2xl px-4 py-3.5 transition-colors duration-300 hover:border-white/15"
          >
            <span
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-lemon-400/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden="true"
            />
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-300">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] text-[0.95rem] transition-transform duration-300 group-hover:scale-105"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              {item.label}
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-white">{item.value}</div>
          </div>
        ))}
      </section>

      {showUpgrade ? (
        <section className="relative overflow-hidden rounded-[24px] border border-plus-500/25 bg-gradient-to-l from-plus-600/25 via-ink-900 to-ink-900 p-6 md:p-8">
          <div
            className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-plus-500/25 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative z-10 flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="mb-2 inline-block rounded-full border border-plus-400/30 bg-plus-500/15 px-3 py-1 text-[0.85rem] font-black text-plus-300">
                ⭐ 7 ימי ניסיון חינם
              </span>
              <h2 className="text-2xl font-black md:text-3xl">
                עברו ל-LemonTank <span className="text-gradient">פלוס</span>
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-300">
                כל הסרטים והסדרות בפרימיום, איכות 4K, 4 מסכים במקביל, הורדות לצפייה בלי אינטרנט — ובלי פרסומות.
              </p>
            </div>
            <Link
              href="/plans"
              className="shrink-0 rounded-xl bg-gradient-to-l from-plus-500 to-plus-600 px-7 py-3.5 text-sm font-black text-white shadow-[0_18px_44px_-16px_rgba(139,92,246,1)] transition hover:brightness-110 hover:-translate-y-0.5"
            >
              התחל ניסיון חינם
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

      {recommended.length ? <ContentRow title="מומלץ עבורך ✨" items={recommended} /> : null}

      {/* עשרת הגדולים */}
      {top10.length ? (
        <section aria-labelledby="top10-heading">
          <h2 id="top10-heading" className="section-heading mb-4 px-1">
            <span className="section-heading-bar" aria-hidden="true" />
            🏆 עשרת הגדולים של השבוע
          </h2>
          <ol className="row-scroll">
            {top10.map((item, i) => (
              <li key={item.id} className="row-scroll-item relative flex items-end">
                <span
                  className="pointer-events-none select-none text-[5.5rem] font-black leading-[0.72] text-transparent [-webkit-text-stroke:2px_rgba(255,255,255,0.22)] md:text-[7rem]"
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

      <ContentRow title="חדש בפלטפורמה" items={newReleases} href="/new" />
      <ContentRow title="חינם לכולם 🆓" items={freeItems} href="/movies?plan=free" />
      <ContentRow title="פרימיום בפלוס ⭐" items={plusItems} href="/plans" />

      {/* אזור המסלולים — נתונים מהמסד (מתעדכן מ-/admin/plans) */}
      {plansFromDb.length ? (
        <section aria-labelledby="plans-heading" className="pt-2">
          <h2 id="plans-heading" className="section-heading mb-5 justify-center px-1 text-center">
            <span className="section-heading-bar" aria-hidden="true" />
            המסלולים שלנו
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            {plansFromDb.map((plan) => {
              const isPlusPlan = plan.code === "plus";
              return (
                <div
                  key={plan.code}
                  className={`relative overflow-hidden rounded-[22px] p-6 transition-transform duration-300 [transition-timing-function:var(--ease-cinema)] hover:-translate-y-1 ${
                    isPlusPlan
                      ? "border border-plus-500/35 bg-gradient-to-b from-plus-600/[0.18] to-ink-900/60 shadow-[0_30px_70px_-40px_rgba(139,92,246,0.9)]"
                      : "card-surface"
                  }`}
                >
                  {isPlusPlan ? (
                    <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-plus-500/20 blur-3xl" aria-hidden="true" />
                  ) : null}
                  <div className="relative flex items-center justify-between gap-3">
                    <h3 className={`text-xl font-black ${isPlusPlan ? "text-plus-300" : "text-white"}`}>
                      מסלול {plan.name_he} {isPlusPlan ? "⭐" : ""}
                    </h3>
                    <span className={isPlusPlan ? "badge-plus" : "badge-free"}>
                      {Number(plan.price_ils) === 0 ? formatPrice(0) : `${formatPrice(Number(plan.price_ils))} / חודש`}
                    </span>
                  </div>
                  <ul className="relative mt-4 space-y-2.5 text-sm text-ink-200">
                    {(plan.features.length ? plan.features : ["גישה לקטלוג לפי המסלול הזה"]).map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[0.8rem] font-black ${
                            isPlusPlan ? "bg-plus-500/25 text-plus-300" : "bg-emerald-500/20 text-emerald-300"
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
                    className={`relative mt-6 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-black transition ${
                      isPlusPlan
                        ? "bg-gradient-to-l from-plus-500 to-plus-600 text-white shadow-[0_16px_40px_-16px_rgba(139,92,246,1)] hover:brightness-110"
                        : "border border-white/20 text-white hover:bg-white/10"
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
