"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TitleCard as TitleCardType } from "@/lib/catalog";
import { Icon } from "@/components/ui/icons";
import { DustMotes, EngravedLabel } from "@/components/ui/ornaments";
import { AddToListButton } from "./add-to-list-button";
import { CORE_GENRES, genreArtSrc } from "./genre-banner";

type Slide = TitleCardType & { tagline?: string | null; trailer_url?: string | null; logo_url?: string | null };

/**
 * הבמה הראשית.
 *
 * שני מצבים, ובכוונה ambos מעוצבים באותה מידה:
 *
 *   1. יש תוכן → שקופית קולנועית: ציור שמתקרב לאט, כותרת ב-serif, כפתור פליז
 *      עם ברק שחולף, ופס בחירה בצורת לוחיות פליז.
 *   2. הקטלוג ריק → "האולם" — הציור של הארכיון, שורת פתיחה, וכניסות לז'אנרים.
 *      זה המצב שהבעלים רואה בהתחלה, ולכן אסור שייראה כמו מסך שגיאה ריק.
 *
 * כל אנימציה מדמה חומר (דיו, אבק, ניצוץ) ולא "spring" מודרני.
 */
export function Hero({ slides, isPlus }: { slides: Slide[]; isPlus: boolean }) {
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = slides[index];

  useEffect(() => {
    if (slides.length <= 1) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), 11000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [slides.length]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && current?.trailer_url) {
      v.muted = muted;
      v.play().catch(() => undefined);
    }
  }, [index, muted, current?.trailer_url]);

  if (!current) return <EmptyStage />;

  const background = current.backdrop_url || current.poster_url;

  return (
    <section className="relative mb-12 animate-ink-in" aria-label="תוכן מומלץ">
      {/* מסגרת כפולה עם פינות חרוטות — כמו לוחית במוזיאון */}
      <div className="framed chamfer relative overflow-hidden bg-obsidian-950">
        <div className="relative min-h-[86vw] w-full sm:min-h-[440px] md:min-h-[580px]">
          {background ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={background}
              alt=""
              fetchPriority="high"
              className="absolute inset-0 size-full object-cover animate-ken-burns"
            />
          ) : (
            <span className="poster-fallback absolute inset-0" style={{ ["--poster-color" as string]: current.color }} />
          )}

          {current.trailer_url ? (
            <video
              ref={videoRef}
              src={current.trailer_url}
              className="absolute inset-0 size-full object-cover"
              muted={muted}
              loop
              playsInline
              preload="none"
              poster={background ?? undefined}
            />
          ) : null}

          {/* שכבות אור: חושך מהצד שבו יושב הטקסט, והצפה כללית */}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-l from-obsidian-950 via-obsidian-950/80 to-transparent" />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian-950 via-obsidian-950/25 to-transparent" />
          <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-brass-400/15" />
          <DustMotes count={14} />

          <div className="relative flex min-h-[86vw] flex-col justify-end gap-4 p-6 sm:min-h-[440px] md:min-h-[580px] md:max-w-3xl md:p-14">
            <div className="flex flex-wrap items-center gap-2 animate-ink-in">
              <EngravedLabel>
                <Icon name={current.kind === "movie" ? "film" : "reel"} className="size-3.5" />
                {current.kind === "movie" ? "סרט" : "סדרה"} · מומלץ
              </EngravedLabel>
              {current.plan_access === "plus" ? (
                <span className="badge-plus inline-flex items-center gap-1.5">
                  <Icon name="crown" className="size-3.5" /> פלוס
                </span>
              ) : (
                <span className="badge-free inline-flex items-center gap-1.5">
                  <Icon name="check" className="size-3.5" /> חינם
                </span>
              )}
              {current.is_original ? (
                <span className="inline-flex items-center gap-1.5 border border-brass-400/35 bg-obsidian-950/60 px-2.5 py-1 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-brass-200 backdrop-blur">
                  <Icon name="quill" className="size-3.5" /> מקורי
                </span>
              ) : null}
            </div>

            <h1
              className="animate-ink-in font-display text-4xl font-bold leading-[1.08] tracking-tight text-parchment-50 drop-shadow-[0_6px_30px_rgba(0,0,0,0.95)] sm:text-5xl md:text-6xl"
              style={{ animationDelay: "80ms" }}
            >
              {current.name_he}
            </h1>

            {current.tagline ? (
              <p className="animate-ink-in font-display text-base italic text-brass-200 md:text-lg" style={{ animationDelay: "160ms" }}>
                {current.tagline}
              </p>
            ) : null}

            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-semibold text-parchment-300 animate-ink-in"
              style={{ animationDelay: "220ms" }}
            >
              {current.year ? <span className="tabular-nums">{current.year}</span> : null}
              <span className="border border-brass-400/35 px-1.5 py-0.5 font-mono text-[0.78rem] text-brass-200">
                {current.maturity}
              </span>
              {current.kind === "series" ? (
                <span className="tabular-nums">
                  {current.seasons_count} עונות · {current.episodes_count} פרקים
                </span>
              ) : (
                <span className="tabular-nums">{current.runtime_min ?? "—"} דק׳</span>
              )}
              {current.rating_imdb ? (
                <span className="inline-flex items-center gap-1 font-bold text-brass-300">
                  <Icon name="star" className="size-4" /> {current.rating_imdb.toFixed(1)}
                </span>
              ) : null}
            </div>

            <p
              className="line-clamp-3 max-w-2xl text-base leading-relaxed text-parchment-200/85 animate-ink-in"
              style={{ animationDelay: "280ms" }}
            >
              {current.overview ?? "הצגה עכשיו בארכיון."}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-3 animate-ink-in" style={{ animationDelay: "340ms" }}>
              <Link href={`/watch/${current.slug}`} className="btn-primary sheen">
                <Icon name="play" className="size-4" strokeWidth={2} />
                {current.plan_access === "plus" && !isPlus ? "שדרג וצפה" : "צפה עכשיו"}
              </Link>
              <Link
                href={`/title/${current.slug}`}
                className="inline-flex items-center gap-2 border border-brass-400/35 bg-obsidian-950/55 px-5 py-3 text-sm font-bold text-parchment-100 chamfer backdrop-blur-md transition hover:border-brass-300/70 hover:bg-obsidian-900/70"
              >
                <Icon name="scroll" className="size-4" />
                פרטים נוספים
              </Link>
              <AddToListButton titleId={current.id} compact />
              {current.trailer_url ? (
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="flex size-11 items-center justify-center border border-brass-400/25 bg-obsidian-950/60 text-parchment-200 chamfer backdrop-blur transition hover:border-brass-300/60 hover:text-parchment-50"
                  aria-label={muted ? "בטל השתקת טריילר" : "השתק טריילר"}
                >
                  <Icon name={muted ? "eye-off" : "eye"} className="size-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* בורר שקופיות — לוחיות פליז */}
          {slides.length > 1 ? (
            <div className="absolute bottom-5 left-5 hidden items-center gap-2 md:flex" role="tablist" aria-label="בחירת תוכן מומלץ">
              {slides.map((slide, i) => {
                const thumb = slide.backdrop_url || slide.poster_url;
                return (
                  <button
                    key={slide.id}
                    role="tab"
                    type="button"
                    aria-selected={i === index}
                    aria-label={slide.name_he}
                    onClick={() => setIndex(i)}
                    className={`relative h-12 w-20 overflow-hidden border transition-all duration-500 [transition-timing-function:var(--ease-ink)] ${
                      i === index
                        ? "border-brass-300/90 opacity-100 shadow-[0_0_24px_-6px_rgba(201,154,74,0.9)]"
                        : "border-brass-400/20 opacity-50 hover:opacity-90"
                    }`}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="block size-full bg-obsidian-800" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}

          {slides.length > 1 ? (
            <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-1.5 md:hidden">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={slide.name_he}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 transition-all ${i === index ? "w-8 bg-brass-300" : "w-2.5 bg-parchment-200/40"}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * "האולם" — במה לקטלוג ריק.
 *
 * זו התמונה הראשונה שהבעלים רואה אחרי ההתקנה. במקום מסך ריק: ציור הארכיון,
 * שורת פתיחה בכתב ספר, שתי כניסות, ופס ז'אנרים שמראה שהאתר חי.
 */
function EmptyStage() {
  const [artReady, setArtReady] = useState(true);

  return (
    <section className="relative mb-12 animate-ink-in" aria-label="פתיחה">
      <div className="framed chamfer relative overflow-hidden bg-obsidian-950">
        <div className="relative min-h-[70vw] sm:min-h-[380px] md:min-h-[470px]">
          {artReady ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/art/hero-archive.jpg"
              alt=""
              fetchPriority="high"
              onError={() => setArtReady(false)}
              className="absolute inset-0 size-full object-cover animate-ken-burns"
            />
          ) : (
            <span className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(201,154,74,0.22),transparent_70%),linear-gradient(170deg,#1a1712,#0a0806)]" />
          )}

          <span className="pointer-events-none absolute inset-0 bg-gradient-to-l from-obsidian-950 via-obsidian-950/78 to-transparent" />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian-950 via-obsidian-950/20 to-transparent" />
          <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-brass-400/15" />
          <DustMotes count={18} />

          <div className="relative flex min-h-[70vw] flex-col justify-center gap-5 p-6 sm:min-h-[380px] md:min-h-[470px] md:max-w-2xl md:p-14">
            <span className="animate-ink-in">
              <EngravedLabel>
                <Icon name="lantern" className="size-3.5" />
                ארכיון האור
              </EngravedLabel>
            </span>

            <h1
              className="animate-ink-in font-display text-4xl font-bold leading-tight tracking-tight text-parchment-50 drop-shadow-[0_6px_30px_rgba(0,0,0,0.95)] sm:text-5xl md:text-6xl"
              style={{ animationDelay: "100ms" }}
            >
              כל סרט וכל סדרה
              <br />
              <span className="text-brass-300">במקום אחד, בסדר מופתי.</span>
            </h1>

            <p
              className="max-w-xl text-base leading-relaxed text-parchment-200/85 animate-ink-in md:text-lg"
              style={{ animationDelay: "200ms" }}
            >
              מדפים עמוקים, שקט, ואור שנשאר דלוק. פתחו חשבון — חלק מהתוכן פתוח לכולם,
              והשאר במסלול פלוס.
            </p>

            <div className="flex flex-wrap items-center gap-3 animate-ink-in" style={{ animationDelay: "300ms" }}>
              <Link href="/register" className="btn-primary sheen">
                <Icon name="key" className="size-4" />
                פתחו חשבון חינם
              </Link>
              <Link
                href="/plans"
                className="inline-flex items-center gap-2 border border-brass-400/35 bg-obsidian-950/55 px-5 py-3 text-sm font-bold text-parchment-100 chamfer backdrop-blur-md transition hover:border-brass-300/70 hover:bg-obsidian-900/70"
              >
                <Icon name="tag" className="size-4" />
                למסלולים ולמחירים
              </Link>
            </div>
          </div>
        </div>

        {/* פס ז'אנרים — רוחב מלא, נחתך בקצה כדי לרמוז שיש עוד */}
        <div className="relative border-t border-brass-400/18 bg-obsidian-950/85 px-4 py-4 backdrop-blur">
          <div className="row-scroll no-scrollbar gap-3" aria-label="ז'אנרים">
            {CORE_GENRES.map((genre, i) => {
              const src = genreArtSrc(genre.slug);
              return (
                <Link
                  key={genre.slug}
                  href={`/genres/${genre.slug}`}
                  className="row-scroll-item group relative block h-20 w-40 shrink-0 overflow-hidden border border-brass-400/20 bg-obsidian-900 chamfer transition duration-500 hover:border-brass-300/60"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 size-full object-cover opacity-80 transition duration-[1200ms] group-hover:scale-105 group-hover:opacity-100"
                    />
                  ) : (
                    <span className="absolute inset-0 bg-gradient-to-br from-obsidian-700 to-obsidian-950" />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-obsidian-950 via-obsidian-950/35 to-transparent" />
                  <span className="absolute bottom-2 right-3 flex items-center gap-1.5 text-sm font-bold text-parchment-100">
                    <Icon name={genre.icon} className="size-4 text-brass-300" />
                    {genre.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
