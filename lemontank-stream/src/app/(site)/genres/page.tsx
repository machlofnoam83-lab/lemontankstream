import type { Metadata } from "next";
import { listGenres } from "@/lib/catalog";
import { GenreBanner } from "@/components/site/genre-banner";
import { Icon } from "@/components/ui/icons";
import { OrnamentRule } from "@/components/ui/ornaments";
import { all, get } from "@/lib/db";

export const metadata: Metadata = { title: "ז'אנרים", description: "כל הז'אנרים — אקשן, קומדיה, דרמה, מתח ועוד" };
export const dynamic = "force-dynamic";

/**
 * עמוד הז'אנרים — "מפת הארכיון".
 *
 * לכל ז'אנר יש ציור משלו (public/art/genre-<slug>.jpg) ומונה כותרים אמיתי
 * מהמסד. אם לז'אנר אין עדיין ציור — הרכיב נופל למשטח מעוצב בגוון הז'אנר,
 * כך שהעמוד נשאר אחיד ולא נראה חסר.
 */
export default function GenresPage() {
  const genres = listGenres();

  if (!genres.length) {
    return (
      <div className="card-surface chamfer mx-auto max-w-lg p-8 text-center animate-ink-in">
        <Icon name="tag" className="mx-auto size-8 text-brass-300" />
        <h1 className="mt-3 font-display text-2xl font-bold text-parchment-50">עוד אין ז'אנרים</h1>
        <p className="mt-2 text-parchment-200/75">אפשר להוסיף ז'אנרים בפאנל הניהול.</p>
      </div>
    );
  }

  // מונה כותרים לכל ז'אנר — שאילתה אחת, ולא אחת לכל ז'אנר
  const counts = all<{ genre_id: number; c: number }>(
    `SELECT tg.genre_id AS genre_id, COUNT(*) AS c
       FROM title_genres tg
       JOIN titles t ON t.id = tg.title_id
      WHERE t.deleted_at IS NULL AND t.status = 'published'
      GROUP BY tg.genre_id`,
  );
  const countMap = new Map(counts.map((row) => [Number(row.genre_id), Number(row.c)]));
  const total = [...countMap.values()].reduce((sum, value) => sum + value, 0);

  return (
    <div className="space-y-7">
      <header className="animate-ink-in">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-brass-300/80">מפת הארכיון</p>
        <h1 className="mt-2 flex items-center gap-2.5 font-display text-3xl font-bold text-parchment-50 md:text-4xl">
          <Icon name="compass" className="size-7 text-brass-300" />
          כל הז'אנרים
        </h1>
        <p className="mt-2 max-w-2xl text-base text-parchment-200/75">
          {genres.length} מדפים, {total > 0 ? `${total} כותרים` : "עדיין בלי כותרים"} — כל אחד עם הציור שלו.
          בחירת ז'אנר מסננת את הקטלוג מיד.
        </p>
        <OrnamentRule className="mt-5" />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {genres.map((genre, index) => (
          <div key={genre.id} className="reveal-item" style={{ animationDelay: `${Math.min(index * 55, 600)}ms` }}>
            <GenreBanner
              slug={genre.slug}
              name={genre.name_he}
              color={genre.color}
              count={countMap.get(Number(genre.id)) ?? 0}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
