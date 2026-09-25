"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TitleCard as TitleCardType } from "@/lib/catalog";
import { AddToListButton } from "./add-to-list-button";

type Slide = TitleCardType & { tagline?: string | null; trailer_url?: string | null; logo_url?: string | null };

/**
 * באנר ראשי עם סיבוב אוטומטי, טריילר בשקט בריחוף, ותמיכה מלאה ב-RTL.
 * נגישות: עצירה אוטומטית עם prefers-reduced-motion, כפתורי ניווט עם aria-labels.
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
    timer.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), 9000);
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
    <section className="relative mb-8 overflow-hidden rounded-2xl border border-white/5" aria-label="תוכן מומלץ">
      <div className="relative min-h-[420px] w-full md:min-h-[520px]">
        {background ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={background} alt="" className="absolute inset-0 h-full w-full object-cover" />
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

        <div className="absolute inset-0 bg-gradient-to-l from-ink-950/95 via-ink-950/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />

        <div className="relative flex min-h-[420px] flex-col justify-end gap-4 p-5 md:min-h-[520px] md:max-w-3xl md:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-lemon-400 px-3 py-1 text-[11px] font-black text-ink-900">
              {current.kind === "movie" ? "סרט" : "סדרה"} חדש/ה בפלטפורמה
            </span>
            {current.plan_access === "plus" ? <span className="badge-plus">⭐ פלוס בלבד</span> : <span className="badge-free">זמין בחינם</span>}
            {current.is_original ? <span className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-bold text-white">מקורי LemonTank</span> : null}
          </div>

          <h1 className="text-3xl font-black leading-tight text-white drop-shadow-lg md:text-5xl">{current.name_he}</h1>
          {current.tagline ? <p className="text-sm text-lemon-200 md:text-base">{current.tagline}</p> : null}

          <p className="line-clamp-3 max-w-2xl text-sm text-ink-200 md:text-base">{current.overview ?? "צפו עכשיו ב-LemonTank Stream"}</p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
            {current.year ? <span>{current.year}</span> : null}
            <span className="rounded border border-white/20 px-1.5 py-0.5">{current.maturity}</span>
            {current.kind === "series" ? <span>{current.seasons_count} עונות · {current.episodes_count} פרקים</span> : <span>{current.runtime_min ?? "—"} דק'</span>}
            {current.rating_imdb ? <span className="text-lemon-300">★ {current.rating_imdb.toFixed(1)}</span> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={`/watch/${current.slug}`}
              className="inline-flex items-center gap-2 rounded-xl bg-lemon-400 px-6 py-3 text-sm font-black text-ink-900 shadow-lg transition hover:bg-lemon-300"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="flip-rtl">
                <path d="M8 5v14l11-7z" />
              </svg>
              {current.plan_access === "plus" && !isPlus ? "שדרג וצפה" : "צפה עכשיו"}
            </Link>
            <Link
              href={`/title/${current.slug}`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              פרטים נוספים
            </Link>
            <AddToListButton titleId={current.id} compact />
            {current.trailer_url ? (
              <button
                onClick={() => setMuted((m) => !m)}
                className="rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-white backdrop-blur hover:bg-black/60"
                aria-label={muted ? "בטל השתקת טריילר" : "השתק טריילר"}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            ) : null}
          </div>
        </div>

        {/* מחווני שקופיות */}
        {slides.length > 1 ? (
          <div className="absolute bottom-4 left-4 flex gap-1.5" role="tablist" aria-label="בחירת תוכן מומלץ">
            {slides.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={i === index}
                aria-label={s.name_he}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-8 bg-lemon-400" : "w-3 bg-white/40 hover:bg-white/70"}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
