import type { Metadata } from "next";
import Link from "next/link";
import { listGenres } from "@/lib/catalog";
import { GENRE_ICONS } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "ז'אנרים", description: "כל הז'אנרים — אקשן, קומדיה, דרמה, מתח ועוד" };
export const dynamic = "force-dynamic";

export default function GenresPage() {
  const genres = listGenres();

  if (!genres.length) {
    return <EmptyState title="עוד אין ז'אנרים" description="אדמין המערכת יכול להוסיף ז'אנרים בפאנל הניהול." icon="🏷️" />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black md:text-3xl">🏷️ כל הז'אנרים</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {genres.map((g) => (
          <Link
            key={g.id}
            href={`/genres/${g.slug}`}
            className="group card-surface flex items-center gap-3 rounded-2xl p-4 transition hover:border-lemon-400/40 hover:bg-white/[0.06]"
          >
            <span className="text-3xl" aria-hidden="true">{g.icon ?? GENRE_ICONS[g.slug] ?? "🎬"}</span>
            <span className="text-sm font-bold group-hover:text-lemon-300">{g.name_he}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
