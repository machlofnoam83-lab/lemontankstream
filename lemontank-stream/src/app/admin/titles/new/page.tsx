import type { Metadata } from "next";
import Link from "next/link";
import { TitleForm } from "@/components/admin/title-form";
import { listGenres } from "@/lib/catalog";

export const metadata: Metadata = { title: "כותר חדש", robots: { index: false } };
export const dynamic = "force-dynamic";

/** יצירת סרט או סדרה חדשים */
export default async function NewTitlePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const params = await searchParams;
  const genres = listGenres();
  const kind = params.kind === "series" ? "series" : "movie";

  return (
    <div className="space-y-5">
      <nav className="text-xs text-ink-400">
        <Link href="/admin/titles" className="hover:text-lemon-300">ניהול תוכן</Link> / <span>כותר חדש</span>
      </nav>

      <header>
        <h1 className="text-2xl font-black">{kind === "series" ? "📺 סדרה חדשה" : "🎬 סרט חדש"}</h1>
        <p className="mt-1 text-sm text-ink-400">
          מלא את הפרטים, העלה פוסטר, ובחר אם התוכן יהיה חינם לכולם או זמין למנויי פלוס בלבד.
          {kind === "series" ? " אחרי השמירה תוכל להוסיף עונות ופרקים." : ""}
        </p>
      </header>

      <TitleForm isNew genres={genres} initial={{ kind }} />
    </div>
  );
}
