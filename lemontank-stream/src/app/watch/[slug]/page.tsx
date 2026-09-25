import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Player } from "@/components/site/player";
import { ContentRow } from "@/components/site/content-row";
import { AddToListButton, } from "@/components/site/add-to-list-button";
import { StartPartyButton } from "@/components/site/party-widgets";
import { CommentsSection } from "@/components/site/social-sections";
import { buildPlayback } from "@/server/playback";
import { getCurrentUser } from "@/lib/session";
import { similarTitles } from "@/lib/catalog";
import { count, get, run } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatRuntime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "צפייה", robots: { index: false } };

/** עמוד הנגן — מוגן בהתחברות (middleware + בדיקה כאן) */
export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string; profile?: string; autoplay?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/watch/${slug}`)}`);

  const profileId = query.profile ? Number(query.profile) : null;
  if (profileId) {
    const owned = get<{ id: number }>("SELECT id FROM profiles WHERE id = ? AND user_id = ?", [profileId, user.id]);
    if (!owned) redirect(`/watch/${slug}`);
  }

  const playback = buildPlayback({
    slug,
    episodeId: query.ep ? Number(query.ep) : null,
    user,
    profileId,
  });
  if (!playback) notFound();

  const settings = getSettings();
  const similar = similarTitles(playback.title.id, 12);
  const inList = Boolean(get<{ id: number }>("SELECT id FROM watchlist WHERE user_id = ? AND title_id = ? AND kind='list'", [user.id, playback.title.id]));

  // מונה צפיות לפרק (לא חוסם)
  if (playback.episode) {
    try {
      run("UPDATE episodes SET views_count = views_count + 1 WHERE id = ?", [playback.episode.id]);
    } catch {
      /* ignore */
    }
  }

  const episodesWatched = count(
    "SELECT COUNT(*) c FROM watch_progress WHERE user_id = ? AND title_id = ? AND completed = 1",
    [user.id, playback.title.id],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-4">
      {/* ── נגן ── */}
      <Player
        titleId={playback.title.id}
        titleName={playback.title.name_he}
        slug={playback.title.slug}
        episodeId={playback.episode?.id ?? null}
        sources={playback.sources}
        subtitles={playback.subtitles}
        poster={playback.episode?.thumb_url ?? playback.title.backdrop_url ?? playback.title.poster_url}
        startAtSec={playback.resumeAtSec}
        locked={playback.locked}
        lockReason={playback.lockReason}
        introStart={playback.episode?.intro_start_sec ?? null}
        introEnd={playback.episode?.intro_end_sec ?? null}
        creditsStart={playback.episode?.credits_start_sec ?? null}
        nextEpisode={playback.nextEpisode}
        episodes={playback.episodes}
        autoplayNext={playback.autoplayNext && query.autoplay !== "0"}
        preferredSubLang={playback.preferredSubLang}
        isPlus={user.effective_plan === "plus"}
      />

      {/* ── פרטי הצפייה ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
          <Link href={`/title/${playback.title.slug}`} className="text-lemon-300 hover:underline">
            ← חזרה לדף הכותר
          </Link>
          <StartPartyButton
            titleId={playback.title.id}
            episodeId={playback.episode?.id ?? null}
            positionSec={playback.resumeAtSec}
            label="ארח צפייה משותפת"
          />
          {playback.episode ? (
            <span className="rounded-full bg-white/10 px-2.5 py-1">
              עונה {playback.episode.season_number} · פרק {playback.episode.number}
            </span>
          ) : null}
          {playback.access === "plus" ? <span className="badge-plus">⭐ תוכן פלוס</span> : <span className="badge-free">חינם</span>}
          {playback.episode?.runtime_sec ? <span>{formatRuntime(playback.episode.runtime_sec)}</span> : null}
        </div>

        <h1 className="text-2xl font-black md:text-3xl">
          {playback.episode ? playback.episode.name_he : playback.title.name_he}
        </h1>
        {playback.episode ? <p className="text-sm text-ink-400">{playback.title.name_he}</p> : null}
        {playback.episode?.overview ? <p className="max-w-3xl text-sm leading-relaxed text-ink-200">{playback.episode.overview}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <AddToListButton titleId={playback.title.id} initial={inList} />
          <Link href={`/title/${playback.title.slug}`} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/15">
            כל הפרקים והפרטים
          </Link>
          {episodesWatched > 0 ? (
            <span className="text-xs text-ink-400">צפית ב-{episodesWatched} פרקים מהסדרה</span>
          ) : null}
        </div>
      </section>

      {settings.comments_enabled ? (
        <CommentsSection titleId={playback.title.id} episodeId={playback.episode?.id} enabled />
      ) : null}

      {similar.length ? <ContentRow title="עוד משהו שכדאי לראות" items={similar} /> : null}
    </div>
  );
}
