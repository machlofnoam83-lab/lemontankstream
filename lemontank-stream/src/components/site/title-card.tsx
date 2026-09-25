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
  sm: "w-32 h-48",
  md: "w-40 h-60",
  lg: "w-48 h-72",
  wide: "w-64 h-36",
};

/** כרטיס כותר אחיד — עובד גם לסרטים וגם לסדרות, כולל תג "פלוס/חינם" */
export function TitleCard({ item, size = "md", showProgress = false, rank }: Props) {
  const percent = Math.max(0, Math.min(100, (item.percent ?? 0) * 100));
  const poster = size === "wide" ? item.backdrop_url || item.poster_url : item.poster_url;

  return (
    <Link
      href={`/title/${item.slug}`}
      className={`group relative block shrink-0 overflow-hidden rounded-xl bg-ink-850 ring-1 ring-white/5 transition-all duration-300 hover:z-10 hover:ring-lemon-400/50 focus-visible:ring-2 focus-visible:ring-lemon-400 ${SIZES[size]}`}
      aria-label={`${item.name_he}${item.year ? ` (${item.year})` : ""} — ${item.plan_access === "plus" ? "פלוס" : "חינם"}`}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={`פוסטר ${item.name_he}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="poster-fallback h-full w-full" style={{ ["--poster-color" as string]: item.color }}>
          <span className="text-balance">{item.name_he}</span>
        </div>
      )}

      {/* גרדיאנט תחתון לקריאות */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      {/* תגיות עליונות */}
      <div className="absolute right-2 top-2 flex flex-col items-start gap-1">
        {item.plan_access === "plus" ? <span className="badge-plus shadow">⭐ פלוס</span> : <span className="badge-free shadow">חינם</span>}
        {item.is_original ? <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-lemon-300">מקורי LT</span> : null}
      </div>

      {typeof rank === "number" ? (
        <div className="absolute -right-1 -top-2 select-none text-5xl font-black text-white/25 drop-shadow-lg" aria-hidden="true">
          {rank}
        </div>
      ) : null}

      {/* פרטי כותר */}
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <h3 className="line-clamp-2 text-[13px] font-bold leading-tight text-white">{item.name_he}</h3>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-200">
          {item.year ? <span>{item.year}</span> : null}
          {item.kind === "series" && item.seasons_count > 0 ? <span>· {item.seasons_count} עונות</span> : null}
          {item.kind === "movie" && item.runtime_min ? <span>· {item.runtime_min} דק'</span> : null}
          {item.rating_imdb ? <span className="ms-auto font-semibold text-lemon-300">★ {item.rating_imdb.toFixed(1)}</span> : null}
        </div>
        {item.views_count > 999 ? <div className="mt-0.5 text-[10px] text-ink-400">{formatCompact(item.views_count)} צפיות</div> : null}
      </div>

      {/* שכבת ריחוף */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lemon-400 text-ink-900 shadow-lg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="flip-rtl">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>

      {/* פס התקדמות */}
      {showProgress && percent > 0 ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
          <div className="h-full bg-lemon-400" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </Link>
  );
}

/** כרטיס רחב (לתצוגת "המשך לצפות" ולבאנרים) */
export function WideTitleCard({ item }: { item: TitleCardType & { percent?: number } }) {
  return <TitleCard item={item} size="wide" showProgress />;
}
