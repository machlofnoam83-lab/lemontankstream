"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TitleCard as TitleCardType } from "@/lib/catalog";
import { AddToListButton } from "./add-to-list-button";

type Slide = TitleCardType & { tagline?: string | null; trailer_url?: string | null; logo_url?: string | null };

/**
 * במת הבאנר הראשי — תמונה שמתקרבת לאט (Ken Burns), טריילר מושתק,
 * שכבות כהות לקריאות, וכפתורי פעולה ברורים. RTL מלא.
 * נגישות: עצירה עם prefers-reduced-motion, כפתורי שקופית עם aria-label.
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
    timer.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), 10000);
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

  if (!current) return null;

  const background = current.backdrop_url || current.poster_url;

  return (
    <section className="relative mb-10 overflow-hidden rounded-[24px] border border-white/[0.07] shadow-[0_60px_120px_-60px_rgba(0,0,0,1)]" aria-label="תוכן מומלץ">
      <div className="relative min-h-[78vw] w-full sm:min-h-[420px] md:min-h-[560px]">
        {/* רקע */}
        {background ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={background}
            alt=""
            className="absolute inset-0 h-full w-full animate-ken-burns object-cover"
            fetchPriority="high"
          />
        ) : (
          <div className="poster-fallback absolute inset-0" style={{ ["--poster-color" as string]: current.color }} />
        )}

        {current.trailer_url ? (
          <video
            ref={videoRef}
            src={current.trailer_url}
            className="absolute inset-0 h-full w-full object-cover"
            muted={muted}
            loop
            playsInline
            preload="none"
            poster={background ?? undefined}
          />
        ) : null}

        {/* שכבות כהות — מימין (RTL) ולמטה */}
        <div className="absolute inset-0 bg-gradient-to-l from-ink-950 via-ink-950/75 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/70 via-transparent to-transparent" />

        {/* תוכן */}
        <div className="relative flex min-h-[78vw] flex-col justify-end gap-4 p-6 sm:min-h-[420px] md:min-h-[560px] md:max-w-3xl md:p-12">
          <div className="animate-fade-up flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gradient-to-b from-lemon-300 to-lemon-400 px-3 py-1 text-[0.85rem] font-black text-ink-950 shadow-[0_8px_24px_-10px_rgba(247,194,43,0.9)]">
              {current.kind === "movie" ? "🎬 סרט" : "📺 סדרה"} מומלץ
            </span>
            {current.plan_access === "plus" ? (
              <span className="badge-plus">⭐ פלוס בלבד</span>
            ) : (
              <span className="badge-free">זמין בחינם</span>
            )}
            {current.is_original ? (
              <span className="rounded-full border border-white/25 bg-white/5 px-3 py-1 text-[0.85rem] font-bold text-white backdrop-blur">
                מקורי LemonTank
              </span>
            ) : null}
          </div>

          <h1 className="animate-fade-up text-4xl font-black leading-[1.05] tracking-tight text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.9)] sm:text-5xl md:text-6xl">
            {current.name_he}
          </h1>

          {current.tagline ? <p className="text-sm font-semibold text-lemon-200 md:text-base">{current.tagline}</p> : null}

          <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold text-ink-200 md:text-sm">
            {current.year ? <span>{current.year}</span> : null}
            <span className="rounded-md border border-white/25 px-1.5 py-0.5 text-[0.85rem]">{current.maturity}</span>
            {current.kind === "series" ? (
              <span>
                {current.seasons_count} עונות · {current.episodes_count} פרקים
              </span>
            ) : (
              <span>{current.runtime_min ?? "—"} דק'</span>
            )}
            {current.rating_imdb ? <span className="font-bold text-lemon-300">★ {current.rating_imdb.toFixed(1)}</span> : null}
          </div>

          <p className="line-clamp-3 max-w-2xl text-sm leading-relaxed text-ink-200 md:text-base">
            {current.overview ?? "צפו עכשיו ב-LemonTank Stream"}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <Link
              href={`/watch/${current.slug}`}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-lemon-300 to-lemon-400 px-7 py-3.5 text-sm font-black text-ink-950 shadow-[0_16px_40px_-14px_rgba(247,194,43,0.95)] transition hover:brightness-105 hover:-translate-y-0.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="flip-rtl">
                <path d="M8 5v14l11-7z" />
              </svg>
              {current.plan_access === "plus" && !isPlus ? "שדרג וצפה" : "צפה עכשיו"}
            </Link>
            <Link
              href={`/title/${current.slug}`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/20"
            >
              פרטים נוספים
            </Link>
            <AddToListButton titleId={current.id} compact />
            {current.trailer_url ? (
              <button
                onClick={() => setMuted((m) => !m)}
                className="rounded-xl border border-white/15 bg-black/40 px-3.5 py-3.5 text-sm text-white backdrop-blur transition hover:bg-black/60"
                aria-label={muted ? "בטל השתקת טריילר" : "השתק טריילר"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            ) : null}
          </div>
        </div>

        {/* בורר שקופיות — תמונות ממוזערות */}
        {slides.length > 1 ? (
          <div className="absolute bottom-5 left-5 hidden items-center gap-2 md:flex" role="tablist" aria-label="בחירת תוכן מומלץ">
            {slides.map((s, i) => {
              const thumb = s.backdrop_url || s.poster_url;
              return (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={s.name_he}
                  onClick={() => setIndex(i)}
                  className={`relative h-12 w-20 overflow-hidden rounded-lg border transition-all duration-300 [transition-timing-function:var(--ease-cinema)] ${
                    i === index
                      ? "scale-105 border-lemon-400/80 opacity-100 shadow-[0_0_22px_-4px_rgba(247,194,43,0.85)]"
                      : "border-white/15 opacity-55 hover:opacity-90"
                  }`}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="block h-full w-full bg-ink-800" />
                  )}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* נקודות למובייל */}
        {slides.length > 1 ? (
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-1.5 md:hidden">
            {slides.map((s, i) => (
              <button
                key={s.id}
                aria-label={s.name_he}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-7 bg-lemon-400" : "w-2.5 bg-white/40"}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
