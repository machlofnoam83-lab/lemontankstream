import Link from "next/link";
import { formatCompact } from "@/lib/format";
import type { TitleCard as TitleCardType } from "@/lib/catalog";

type Props = {
  item: TitleCardType & { percent?: number; episode_id?: number | null; seen_at?: string };
  size?: "sm" | "md" | "lg" | "wide";
  showProgress?: boolean;
  rank?: number;
};

const SIZES = {
  sm: "w-36",
  md: "w-44 sm:w-48",
  lg: "w-56",
  wide: "w-72 sm:w-80",
};

const RATIOS = {
  sm: "aspect-[2/3]",
  md: "aspect-[2/3]",
  lg: "aspect-[2/3]",
  wide: "aspect-video",
};

/**
 * כרטיס כותר — "לוחית בארכיון".
 *
 * מה שהשתנה מהגרסה הקודמת, ולמה:
 *   • פינות חרוטות ומסגרת כפולה במקום פינות עגולות — הכל נראה מגולף.
 *   • אין זכוכית מטושטשת ואין תגים צבעוניים: תווית פלוס היא חותם, חינם הוא
 *     ברונזה ירוקה, והדירוג בפונט ממוספר ולא בכוכב זוהר.
 *   • שם הכותר ב-serif מתחת לתמונה, עם קו פליז שנמשך בריחוף.
 *   • דירוג (rank) הוא ספרה גדולה ב-serif בצד — כמו מפתח קטלוג, לא "badge".
 */
export function TitleCard({ item, size = "md", showProgress = false, rank }: Props) {
  const percent = Math.max(0, Math.min(100, (item.percent ?? 0) * 100));
  const poster = size === "wide" ? item.backdrop_url || item.poster_url : item.poster_url;

  return (
    <Link
      href={`/title/${item.slug}`}
      className={`group relative block shrink-0 chamfer ${SIZES[size]} ${RATIOS[size]} poster-shell hover:poster-shell-hover`}
      aria-label={`${item.name_he}${item.year ? ` (${item.year})` : ""} — ${item.plan_access === "plus" ? "פלוס" : "חינם"}`}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={`פוסטר ${item.name_he}`}
          loading="lazy"
          decoding="async"
          className="size-full object-cover [filter:saturate(0.94)_contrast(1.04)] transition-transform duration-[1100ms] [transition-timing-function:var(--ease-cinema)] group-hover:scale-[1.06]"
        />
      ) : (
        <span className="poster-fallback size-full" style={{ ["--poster-color" as string]: item.color }}>
          <span className="text-balance text-sm">{item.name_he}</span>
        </span>
      )}

      {/* דהייה תחתונה — הטקסט יושב על חושך */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-obsidian-950 via-obsidian-950/55 to-transparent" />
      {/* מסגרת פנימית דקה */}
      <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-brass-200/12" />

      {/* תוויות עליונות */}
      <span className="absolute right-2.5 top-2.5 flex flex-col items-end gap-1.5">
        {item.plan_access === "plus" ? <span className="badge-plus">פלוס</span> : <span className="badge-free">חינם</span>}
        {item.is_original ? (
          <span className="border border-brass-400/45 bg-obsidian-950/80 px-1.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-brass-200 backdrop-blur">
            מקורי
          </span>
        ) : null}
      </span>

      {item.rating_imdb ? (
        <span className="chip-meta absolute left-2.5 top-2.5 font-mono text-brass-200 tabular-nums">
          {item.rating_imdb.toFixed(1)}
        </span>
      ) : null}

      {rank ? (
        <span
          aria-hidden="true"
          className="absolute -right-2 bottom-6 select-none font-display text-6xl font-bold leading-none text-brass-200/35 drop-shadow-[0_4px_18px_rgba(0,0,0,0.95)]"
        >
          {rank}
        </span>
      ) : null}

      {/* פרטי הכותר */}
      <span className="absolute inset-x-0 bottom-0 block p-3">
        <span className="block font-display text-[1.02rem] font-bold leading-snug text-parchment-50 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          {item.name_he}
        </span>
        {/* קו פליז שנמשך בריחוף */}
        <span className="mt-1 block h-px w-6 bg-brass-400/60 transition-all duration-500 [transition-timing-function:var(--ease-ink)] group-hover:w-full group-hover:bg-brass-300" />
        <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[0.76rem] text-parchment-300/80">
          {item.year ? <span className="tabular-nums">{item.year}</span> : null}
          {item.kind === "series" && item.seasons_count > 0 ? <span>· {item.seasons_count} עונות</span> : null}
          {item.kind === "movie" && item.runtime_min ? <span>· {item.runtime_min} דק׳</span> : null}
          {item.views_count > 999 ? <span className="ms-auto tabular-nums">{formatCompact(item.views_count)} צפיות</span> : null}
        </span>
      </span>

      {/* שכבת ריחוף — "חותם הצפייה" */}
      <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-obsidian-950/90 via-obsidian-950/40 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <span className="flex size-12 translate-y-2 items-center justify-center border border-brass-300/70 bg-obsidian-950/70 text-brass-200 chamfer shadow-[0_0_26px_-6px_rgba(201,154,74,0.85)] transition-transform duration-500 [transition-timing-function:var(--ease-ink)] group-hover:translate-y-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-4 flip-rtl" aria-hidden="true">
            <path d="M7 4.5v15l12-7.5z" />
          </svg>
        </span>
      </span>

      {showProgress && percent > 0 ? (
        <span className="absolute inset-x-0 bottom-0 block h-[3px] bg-parchment-200/15">
          <span
            className="block h-full bg-gradient-to-l from-brass-200 to-brass-500 shadow-[0_0_10px_1px_rgba(201,154,74,0.65)]"
            style={{ width: `${percent}%` }}
          />
        </span>
      ) : null}
    </Link>
  );
}

/** כרטיס רחב (לתצוגת "המשך לצפות" ולבאנרים) */
export function WideTitleCard({ item }: { item: TitleCardType & { percent?: number } }) {
  return <TitleCard item={item} size="wide" showProgress />;
}
