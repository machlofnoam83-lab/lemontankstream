import type { Metadata } from "next";
import Link from "next/link";
import { ContinueWatchingStrip } from "@/components/site/continue-watching-strip";
import { TitleCard } from "@/components/site/title-card";
import { EmptyState } from "@/components/ui/primitives";
import { continueWatching, listCatalog, type TitleCard as TitleCardType } from "@/lib/catalog";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "הרשימה שלי", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyListPage() {
  const user = await requireUser().catch(() => null);
  if (!user) {
    return (
      <EmptyState
        title="צריך להתחבר"
        description="הרשימה האישית נשמרת בחשבון שלך וזמינה בכל מכשיר."
        icon="🔐"
        action={<Link href="/login?next=/my-list" className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">התחברות</Link>}
      />
    );
  }

  const inList = all<Record<string, unknown>>(
    `SELECT t.id, t.kind, t.slug, t.name_he, t.year, t.poster_url, t.backdrop_url, t.color, t.plan_access,
            t.rating_imdb, t.seasons_count, t.runtime_min, t.maturity, t.quality_max, t.is_featured, t.is_original,
            t.trending_score, t.views_count, t.status, t.updated_at
     FROM watchlist w JOIN titles t ON t.id = w.title_id
     WHERE w.user_id = ? AND w.kind = 'list' AND t.deleted_at IS NULL ORDER BY w.created_at DESC LIMIT 200`,
    [user.id],
  ) as unknown as TitleCardType[];

  const liked = all<Record<string, unknown>>(
    `SELECT t.id, t.kind, t.slug, t.name_he, t.year, t.poster_url, t.backdrop_url, t.color, t.plan_access,
            t.rating_imdb, t.seasons_count, t.runtime_min, t.maturity, t.quality_max, t.is_featured, t.is_original,
            t.trending_score, t.views_count, t.status, t.updated_at
     FROM watchlist w JOIN titles t ON t.id = w.title_id
     WHERE w.user_id = ? AND w.kind = 'like' AND t.deleted_at IS NULL ORDER BY w.created_at DESC LIMIT 60`,
    [user.id],
  ) as unknown as TitleCardType[];

  const continueItems = continueWatching(user.id, 18);
  const recommended = listCatalog({ sort: "trending", limit: 12 }).items;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-black md:text-3xl">🔖 הרשימה שלי</h1>

      {continueItems.length ? <ContinueWatchingStrip items={continueItems} /> : null}

      <section aria-labelledby="list-heading">
        <h2 id="list-heading" className="mb-4 text-lg font-extrabold">שמורים לצפייה</h2>
        {inList.length === 0 ? (
          <EmptyState
            title="הרשימה ריקה"
            description="לחץ על 'הוסף לרשימה' בכל סרט או סדרה כדי לשמור אותם כאן."
            icon="📌"
            action={<Link href="/movies" className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">גלה סרטים</Link>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {inList.map((item) => (
              <div key={`${item.kind}-${item.id}`} className="flex justify-center">
                <TitleCard item={item} size="md" />
              </div>
            ))}
          </div>
        )}
      </section>

      {liked.length ? (
        <section aria-labelledby="liked-heading">
          <h2 id="liked-heading" className="mb-4 text-lg font-extrabold">👍 אהבתי</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {liked.map((item) => (
              <div key={`like-${item.id}`} className="flex justify-center">
                <TitleCard item={item} size="md" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="rec-heading">
        <h2 id="rec-heading" className="mb-4 text-lg font-extrabold">✨ אולי יעניין אותך</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {recommended.map((item) => (
            <div key={`rec-${item.id}`} className="flex justify-center">
              <TitleCard item={item} size="md" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
