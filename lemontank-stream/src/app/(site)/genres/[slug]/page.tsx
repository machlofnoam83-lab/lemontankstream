import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CatalogBrowser } from "@/components/site/catalog-browser";
import { GenreBanner, genreArt } from "@/components/site/genre-banner";
import { Icon } from "@/components/ui/icons";
import { get } from "@/lib/db";
import { isCatalogEmpty } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const genre = get<{ name_he: string }>("SELECT name_he FROM genres WHERE slug = ?", [slug]);
  return { title: genre ? `${genre.name_he} — סרטים וסדרות` : "ז'אנר" };
}

/**
 * עמוד ז'אנר — הבאנר של הז'אנר נפתח לרוחב מלא מעל הקטלוג המסונן.
 * כך ההיררכיה ברורה: קודם "איפה אני" (הציור), ואחר כך התוכן.
 */
export default async function GenrePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const genre = get<{ id: number; name_he: string; icon: string | null; color: string | null }>(
    "SELECT id, name_he, icon, color FROM genres WHERE slug = ?",
    [slug],
  );
  if (!genre) notFound();

  const art = genreArt(slug);
  const count = Number(
    get<{ c: number }>(
      `SELECT COUNT(*) c FROM title_genres tg JOIN titles t ON t.id = tg.title_id
        WHERE tg.genre_id = ? AND t.deleted_at IS NULL AND t.status = 'published'`,
      [genre.id],
    )?.c ?? 0,
  );

  return (
    <div className="space-y-7">
      <nav className="flex items-center gap-2 text-sm text-parchment-300/70 animate-ink-in" aria-label="מסלול ניווט">
        <Link href="/genres" className="transition hover:text-brass-200">ז'אנרים</Link>
        <Icon name="chevron-left" className="size-4" />
        <span className="text-parchment-100">{genre.name_he}</span>
      </nav>

      <div className="animate-ink-in">
        <GenreBanner slug={slug} name={genre.name_he} color={genre.color} variant="wide" count={count} />
      </div>

      {art?.blurb ? (
        <p className="max-w-2xl font-display text-base italic text-parchment-200/80 animate-ink-in">{art.blurb}</p>
      ) : null}

      <Suspense>
        <CatalogBrowser title={genre.name_he} initialGenre={slug} catalogEmpty={isCatalogEmpty()} hideHeading />
      </Suspense>
    </div>
  );
}
