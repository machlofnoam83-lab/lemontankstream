"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDuration, formatDate } from "@/lib/format";

export type PlayerEpisodeOption = {
  id: number;
  season_id: number;
  season_number: number;
  number: number;
  name_he: string;
  overview: string | null;
  runtime_sec: number;
  thumb_url: string | null;
  air_date: string | null;
  effective_access: "free" | "plus";
  views_count: number;
  is_premiere: number;
  is_finale: number;
};

/** בורר עונות ופרקים — כולל סימון ברור של פרקי חינם מול פרקי פלוס */
export function EpisodePicker({
  slug,
  seasons,
  episodes,
  isPlus,
  progressByEpisode = {},
}: {
  slug: string;
  seasons: { id: number; number: number; name_he: string | null; episodes_count: number }[];
  episodes: PlayerEpisodeOption[];
  isPlus: boolean;
  progressByEpisode?: Record<number, number>;
}) {
  const [seasonNumber, setSeasonNumber] = useState<number>(seasons[0]?.number ?? 1);
  const [reversed, setReversed] = useState(false);

  const filtered = useMemo(() => {
    const list = episodes.filter((e) => e.season_number === seasonNumber);
    return reversed ? [...list].reverse() : list;
  }, [episodes, seasonNumber, reversed]);

  if (!seasons.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-ink-400">
        עוד לא נוספו פרקים לסדרה הזו — האדמין יכול להוסיף בפאנל הניהול.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {seasons.map((s) => (
            <button
              key={s.id}
              onClick={() => setSeasonNumber(s.number)}
              aria-pressed={seasonNumber === s.number}
              className={`whitespace-nowrap rounded-xl border px-4 py-2 text-sm transition ${
                seasonNumber === s.number
                  ? "border-lemon-400 bg-lemon-400/15 font-bold text-lemon-200"
                  : "border-white/10 bg-white/5 text-ink-200 hover:bg-white/10"
              }`}
            >
              {s.name_he ?? `עונה ${s.number}`}
              <span className="ms-1 text-[10px] text-ink-400">({s.episodes_count})</span>
            </button>
          ))}
        </div>
        <button onClick={() => setReversed((r) => !r)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-300 hover:bg-white/10">
          {reversed ? "סדר עולה ↑" : "סדר יורד ↓"}
        </button>
      </div>

      <ul className="space-y-2">
        {filtered.map((ep) => {
          const locked = ep.effective_access === "plus" && !isPlus;
          const percent = progressByEpisode[ep.id] ?? 0;

          return (
            <li key={ep.id}>
              <Link
                href={locked ? "/plans" : `/watch/${slug}?ep=${ep.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-3 transition hover:border-lemon-400/30 hover:bg-white/[0.06]"
                aria-label={`${ep.name_he}${locked ? " — דורש מנוי פלוס" : ""}`}
              >
                <span className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-ink-800">
                  {ep.thumb_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ep.thumb_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl" aria-hidden="true">▶</span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                    <span className="rounded-full bg-lemon-400 p-2 text-ink-900">{locked ? "⭐" : "▶"}</span>
                  </span>
                  {percent > 0 ? (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                      <span className="block h-full bg-lemon-400" style={{ width: `${Math.min(100, percent * 100)}%` }} />
                    </span>
                  ) : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-ink-400">פרק {ep.number}</span>
                    {ep.is_premiere ? <span className="rounded bg-lemon-400/20 px-1.5 text-[10px] text-lemon-300">בכורה</span> : null}
                    {ep.is_finale ? <span className="rounded bg-red-500/20 px-1.5 text-[10px] text-red-300">סיום עונה</span> : null}
                    {ep.effective_access === "plus" ? <span className="badge-plus">פלוס</span> : <span className="badge-free">חינם</span>}
                  </span>
                  <span className="mt-1 block truncate font-bold">{ep.name_he}</span>
                  {ep.overview ? <span className="mt-0.5 line-clamp-2 block text-xs text-ink-400">{ep.overview}</span> : null}
                  <span className="mt-1 flex items-center gap-3 text-[11px] text-ink-400">
                    <span>{formatDuration(ep.runtime_sec)}</span>
                    {ep.air_date ? <span>{formatDate(ep.air_date)}</span> : null}
                    {ep.views_count > 0 ? <span>· {ep.views_count} צפיות</span> : null}
                  </span>
                </span>

                {locked ? (
                  <span className="shrink-0 rounded-xl bg-plus-500/20 px-3 py-2 text-xs font-bold text-plus-400">שדרג ⭐</span>
                ) : (
                  <span className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white group-hover:bg-lemon-400 group-hover:text-ink-900">
                    צפה ▶
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
