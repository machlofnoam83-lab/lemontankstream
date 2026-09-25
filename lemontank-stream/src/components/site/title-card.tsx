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
 * כרטיס כותר קולנועי — פוסטר שמתרומם בריחוף, זכוכית מעל התמונה,
 * תג מסלול (חינם/פלוס), דירוג, ופס התקדמות לצפייה.
 */
export function TitleCard({ item, size = "md", showProgress = false, rank }: Props) {
  const percent = Math.max(0, Math.min(100, (item.percent ?? 0) * 100));
  const poster = size === "wide" ? item.backdrop_url || item.poster_url : item.poster_url;

  return (
    <Link
      href={`/title/${item.slug}`}
      className={`group relative block shrink-0 ${SIZES[size]} ${RATIOS[size]} poster-shell hover:poster-shell-hover`}
      aria-label={`${item.name_he}${item.year ? ` (${item.year})` : ""} — ${item.plan_access === "plus" ? "פלוס" : "חינם"}`}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={`פוסטר ${item.name_he}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-[900ms] [transition-timing-function:var(--ease-cinema)] group-hover:scale-[1.07]"
        />
      ) : (
        <div className="poster-fallback h-full w-full" style={{ ["--poster-color" as string]: item.color }}>
          <span className="text-balance text-sm">{item.name_he}</span>
        </div>
      )}

      {/* דהייה תחתונה לקריאות */}
      <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />

      {/* תגיות עליונות */}
      <div className="absolute right-2.5 top-2.5 flex flex-col items-end gap-1.5">
        {item.plan_access === "plus" ? <span className="badge-plus">⭐ פלוס</span> : <span className="badge-free">חינם</span>}
        {item.is_original ? (
          <span className="rounded-full border border-lemon-400/40 bg-black/70 px-2 py-0.5 text-[10px] font-black text-lemon-300 backdrop-blur">
            מקורי LT
          </span>
        ) : null}
      </div>

      {/* דירוג */}
      {item.rating_imdb ? (
        <span className="chip-meta absolute left-2.5 top-2.5 text-lemon-300">★ {item.rating_imdb.toFixed(1)}</span>
      ) : null}

      {rank ? (
        <span
          className="absolute -right-2 bottom-8 select-none text-6xl font-black leading-none text-white/25 drop-shadow-[0_4px_18px_rgba(0,0,0,0.9)]"
          aria-hidden="true"
        >
          {rank}
        </span>
      ) : null}

      {/* פרטי כותר */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <h3 className="line-clamp-2 text-[13.5px] font-black leading-snug text-white drop-shadow">{item.name_he}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] font-semibold text-ink-200">
          {item.year ? <span>{item.year}</span> : null}
          {item.kind === "series" && item.seasons_count > 0 ? <span className="text-ink-400">· {item.seasons_count} עונות</span> : null}
          {item.kind === "movie" && item.runtime_min ? <span className="text-ink-400">· {item.runtime_min} דק'</span> : null}
          {item.views_count > 999 ? <span className="ms-auto text-ink-400">{formatCompact(item.views_count)} צפיות</span> : null}
        </div>
      </div>

      {/* שכבת ריחוף */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/85 via-black/35 to-transparent opacity-0 backdrop-blur-[1px] transition-opacity duration-300 group-hover:opacity-100">
        <span
          className="flex h-12 w-12 translate-y-2 items-center justify-center rounded-full bg-gradient-to-b from-lemon-300 to-lemon-400 text-ink-950 shadow-[0_10px_30px_-8px_rgba(247,194,43,0.9)] transition-transform duration-300 [transition-timing-function:var(--ease-cinema)] group-hover:translate-y-0"
          aria-hidden="true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="flip-rtl">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>

      {/* פס התקדמות */}
      {showProgress && percent > 0 ? (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
          <div
            className="h-full bg-gradient-to-l from-lemon-300 to-lemon-500 shadow-[0_0_10px_1px_rgba(247,194,43,0.7)]"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </Link>
  );
}

/** כרטיס רחב (לתצוגת "המשך לצפות" ולבאנרים) */
export function WideTitleCard({ item }: { item: TitleCardType & { percent?: number } }) {
  return <TitleCard item={item} size="wide" showProgress />;
}
