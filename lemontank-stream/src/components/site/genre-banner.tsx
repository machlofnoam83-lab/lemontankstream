/**
 * באנר ז'אנר — לכל ז'אנר ציור שמן משלו שנשמר ב-public/art.
 *
 * איך זה עובד: הקובץ `public/art/genre-<slug>.jpg` הוא הציור. אם ז'אנר חדש
 * נוסף ואין לו ציור — נופלים למילוי מעוצב (poster-fallback) עם צבע הז'אנר,
 * כדי שאף מסך לא יראה שבור. כך גם אפשר להוסיף אמנות בהמשך בלי לשנות קוד.
 *
 * הרשימה כאן היא גם "מקור האמת" לתצוגה: תיאור קצר לכל ז'אנר בעברית,
 * שנכתב ביד ולא נוצר אוטומטית — זה מה שהופך את העמוד לקטלוג ולא לרשימה.
 */

import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";

export type GenreArt = {
  slug: string;
  name: string;
  /** תיאור אווירה — שורה אחת שמזמינה להיכנס */
  blurb: string;
  icon: IconName;
  /** האם יש קובץ אמנות מוכן ב-public/art */
  art: boolean;
};

/** ז'אנרי ליבה — עם אמנות שנוצרה במיוחד */
const CORE_GENRES: GenreArt[] = [
  { slug: "action", name: "פעולה", blurb: "להבות, מרדפים ומלחמה שאין ממנה חזרה", icon: "sword", art: true },
  { slug: "comedy", name: "קומדיה", blurb: "פונדק, בדיחה טובה, ועוד סבב אחד", icon: "chalice", art: true },
  { slug: "drama", name: "דרמה", blurb: "בני אדם בחדרים גדולים עם החלטות קטנות", icon: "mask", art: true },
  { slug: "thriller", name: "מתח", blurb: "סמטה בערפל, פנס אחד, מישהו עוקב", icon: "eye", art: true },
  { slug: "scifi", name: "מדע בדיוני", blurb: "עולמות שאינם, חוקים שאולי", icon: "compass", art: true },
  { slug: "horror", name: "אימה", blurb: "הבית ההוא מעל הכפר. החלון דלוק", icon: "skull", art: true },
  { slug: "romance", name: "רומנטיקה", blurb: "גשר באפלה, שתי ידיים שמחזיקות", icon: "heart", art: true },
  { slug: "animation", name: "אנימציה", blurb: "צבע, תנועה, ולב שנפתח לאט", icon: "feather", art: true },
  { slug: "kids", name: "ילדים", blurb: "בית קטן ביער, ומנורה שמחכה", icon: "lantern", art: true },
  { slug: "documentary", name: "דוקומנטרי", blurb: "מציאות, מסודרת בסבלנות", icon: "scroll", art: true },
  { slug: "israeli", name: "ישראלית", blurb: "כאן. בשפה שלנו, ברחוב שלנו", icon: "knot", art: true },
  { slug: "anime", name: "אנימה", blurb: "קו חד, רגש גדול, עולם שלם", icon: "dragon", art: true },
];

/** מחזיר את נתוני האמנות לז'אנר לפי slug (או undefined אם אין) */
export function genreArt(slug: string): GenreArt | undefined {
  return CORE_GENRES.find((genre) => genre.slug === slug);
}

/** נתיב התמונה — או null אם אין אמנות מוכנה */
export function genreArtSrc(slug: string): string | null {
  const art = genreArt(slug);
  if (!art?.art) return null;
  return `/art/genre-${slug}.jpg`;
}

/**
 * באנר ז'אנר רחב — לתצוגה בעמוד הז'אנרים ובעמוד הבית.
 * variant="tall" לגריד, "wide" לשורה ראשית.
 */
export function GenreBanner({
  slug,
  name,
  color,
  variant = "tall",
  count,
}: {
  slug: string;
  name: string;
  color?: string | null;
  variant?: "tall" | "wide";
  count?: number;
}) {
  const art = genreArt(slug);
  const src = genreArtSrc(slug);
  const label = art?.name ?? name;
  const blurb = art?.blurb ?? "אסופת כותרים בז'אנר";
  const icon = art?.icon ?? "film";
  const height = variant === "wide" ? "h-40 md:h-52" : "h-36 md:h-44";

  return (
    <Link
      href={`/genres/${slug}`}
      className="group chamfer relative block overflow-hidden border border-brass-400/18 bg-obsidian-900 transition duration-500 hover:border-brass-300/60"
      style={{ ["--poster-color" as string]: color ?? "#c99a4a" }}
    >
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className={`absolute inset-0 size-full object-cover transition duration-[1200ms] ease-out group-hover:scale-[1.06] ${height}`}
          />
          {/* כהות אחידה כדי שהטקסט ייקרא על כל ציור */}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian-950 via-obsidian-950/55 to-obsidian-950/10" />
          <span className="pointer-events-none absolute inset-0 bg-obsidian-950/25 transition group-hover:bg-obsidian-950/10" />
        </>
      ) : (
        <span className={`poster-fallback absolute inset-0 ${height}`} aria-hidden="true" />
      )}

      {/* מסגרת פנימית דקה */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-[6px] border border-brass-200/12" />

      <span className={`relative flex ${height} flex-col justify-end gap-1 p-4`}>
        <span className="flex items-center gap-2 text-brass-300">
          <Icon name={icon} className="size-4 opacity-90" />
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-brass-300/80">
            {slug}
          </span>
        </span>
        <span className="font-display text-xl font-bold text-parchment-50 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] md:text-2xl">
          {label}
        </span>
        <span className="line-clamp-1 text-sm text-parchment-200/75">{blurb}</span>
        {typeof count === "number" ? (
          <span className="mt-1 font-mono text-[0.7rem] text-brass-300/70 tabular-nums">
            {count} כותרים
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export { CORE_GENRES };
