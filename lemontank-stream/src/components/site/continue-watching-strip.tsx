"use client";

import Link from "next/link";
import type { TitleCard as TitleCardType } from "@/lib/catalog";
import { formatPercent } from "@/lib/format";

type Item = TitleCardType & { percent?: number; position_sec?: number; duration_sec?: number; episode_id?: number | null };

/** רצועת "המשך לצפות" עם פס התקדמות וכפתור המשך ישיר לנגן */
export function ContinueWatchingStrip({ items }: { items: Item[] }) {
  if (!items.length) return null;

  return (
    <section aria-labelledby="cw-heading">
      <h2 id="cw-heading" className="mb-4 text-lg font-extrabold">▶️ המשך לצפות</h2>
      <div className="row-scroll">
        {items.map((item) => {
          const href = item.episode_id ? `/watch/${item.slug}?ep=${item.episode_id}` : `/watch/${item.slug}`;
          return (
            <Link key={`${item.id}-${item.episode_id ?? 0}`} href={href} className="row-scroll-item group w-64 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/5 transition hover:ring-lemon-400/50">
              <div className="relative h-36 w-full bg-ink-800">
                {item.backdrop_url || item.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.backdrop_url ?? item.poster_url ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="poster-fallback h-full w-full" style={{ ["--poster-color" as string]: item.color }} />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                  <span className="rounded-full bg-lemon-400 p-3 text-ink-900">▶</span>
                </div>
                {item.percent ? (
                  <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/25">
                    <div className="h-full bg-lemon-400" style={{ width: `${Math.min(100, item.percent * 100)}%` }} />
                  </div>
                ) : null}
              </div>
              <div className="p-3">
                <h3 className="truncate text-sm font-bold">{item.name_he}</h3>
                <div className="mt-1 flex items-center justify-between text-[11px] text-ink-400">
                  <span>{item.kind === "movie" ? "סרט" : "סדרה"}</span>
                  {item.percent ? <span>{formatPercent(item.percent)}</span> : null}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
