import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentRow } from "@/components/site/content-row";
import { EpisodePicker } from "@/components/site/episode-picker";
import { AddToListButton } from "@/components/site/add-to-list-button";
import { DownloadButton, LikeButtons, ShareButton, StarRating } from "@/components/site/title-actions";
import { CommentsSection, ReviewsSection } from "@/components/site/social-sections";
import {
  episodeAccess,
  getTitleBySlug,
  genresOfTitle,
  listEpisodes,
  listSeasons,
  similarTitles,
  watchPayload,
} from "@/lib/catalog";
import { all, get, run } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isStaff } from "@/lib/rbac";
import { formatDate, formatNumber, formatRuntime, maturityLabel } from "@/lib/format";
import { LANGUAGES, SITE } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const title = getTitleBySlug(slug);
  if (!title) return { title: "כותר לא נמצא" };
  const image = title.poster_url ?? title.backdrop_url ?? undefined;
  return {
    title: `${title.name_he}${title.year ? ` (${title.year})` : ""}`,
    description: title.seo_description ?? title.overview?.slice(0, 300) ?? `${title.name_he} — צפייה ב-${SITE.nameHe}`,
    openGraph: { title: title.name_he, description: title.overview?.slice(0, 300) ?? "", images: image ? [image] : undefined, type: "video.other" },
    alternates: { canonical: `/title/${title.slug}` },
  };
}

export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const staff = isStaff(user?.role);

  const title = getTitleBySlug(slug, { includeUnpublished: staff });
  if (!title) notFound();

  const settings = getSettings();
  const payload = watchPayload(slug, { includeDrafts: staff });
  const seasons = payload?.seasons ?? listSeasons(title.id);
  const seasonMap = new Map(seasons.map((s) => [s.id, s]));
  const episodes = (payload?.episodes ?? listEpisodes(title.id, { includeDrafts: staff })).map((e) => ({
    ...e,
    effective_access: "effective_access" in e && typeof e.effective_access === "string"
      ? (e.effective_access as "free" | "plus")
      : episodeAccess(e, seasonMap.get(e.season_id) ?? null, title),
  }));

  const genres = genresOfTitle(title.id);
  const similar = similarTitles(title.id, 12);
  const firstEpisode = episodes[0];
  const playable = title.kind === "series" ? firstEpisode : null;
  const isPlus = user?.effective_plan === "plus";
  const titleLocked = title.plan_access === "plus" && !isPlus && !staff;
  const episodeLocked = playable ? playable.effective_access === "plus" && !isPlus && !staff : false;

  // מצב אישי: רשימה, לייקים, דירוג והתקדמות
  const inList = user
    ? Boolean(get<{ id: number }>("SELECT id FROM watchlist WHERE user_id = ? AND title_id = ? AND kind='list'", [user.id, title.id]))
    : false;
  const liked = user
    ? Boolean(get<{ id: number }>("SELECT id FROM watchlist WHERE user_id = ? AND title_id = ? AND kind='like'", [user.id, title.id]))
    : false;
  const disliked = user
    ? Boolean(get<{ id: number }>("SELECT id FROM watchlist WHERE user_id = ? AND title_id = ? AND kind='dislike'", [user.id, title.id]))
    : false;
  const myRating = user
    ? get<{ stars: number }>("SELECT stars FROM ratings WHERE user_id = ? AND title_id = ?", [user.id, title.id])?.stars ?? null
    : null;

  const progressRows = user
    ? all<{ episode_id: number | null; percent: number; position_sec: number }>(
        "SELECT episode_id, percent, position_sec FROM watch_progress WHERE user_id = ? AND title_id = ?",
        [user.id, title.id],
      )
    : [];
  const progressByEpisode: Record<number, number> = {};
  let resumeEpisode: number | null = null;
  let resumeTitlePercent = 0;
  for (const row of progressRows) {
    if (row.episode_id) {
      progressByEpisode[row.episode_id] = Number(row.percent);
      resumeEpisode = row.episode_id;
      resumeTitlePercent = Number(row.percent);
    }
  }

  // רישום צפייה בדף הכותר (מונה פופולריות)
  try {
    run("UPDATE titles SET views_count = views_count + 1 WHERE id = ?", [title.id]);
  } catch {
    /* לא קריטי */
  }

  const playHref = resumeEpisode
    ? `/watch/${title.slug}?ep=${resumeEpisode}`
    : playable
      ? `/watch/${title.slug}?ep=${firstEpisode!.id}`
      : `/watch/${title.slug}`;

  const audioLangs = (title.audio_langs ?? "he").split(",").filter(Boolean);
  const subLangs = (title.subtitle_langs ?? "he").split(",").filter(Boolean);

  return (
    <div className="space-y-10">
      {/* ── גיבור הכותר ── */}
      <div className="relative overflow-hidden rounded-[26px] border border-white/[0.07] shadow-[0_60px_120px_-60px_rgba(0,0,0,1)]">
        <div className="absolute inset-0">
          {title.backdrop_url || title.poster_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={title.backdrop_url ?? title.poster_url ?? ""}
              alt=""
              className="h-full w-full animate-ken-burns object-cover"
              fetchPriority="high"
            />
          ) : (
            <div className="poster-fallback h-full w-full" style={{ ["--poster-color" as string]: title.color }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-l from-ink-950 via-ink-950/85 to-ink-950/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/25 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-transparent to-transparent" />
        </div>

        <div className="relative grid gap-7 p-5 md:grid-cols-[240px_1fr] md:p-10">
          <div className="mx-auto w-40 md:mx-0 md:w-full">
            {title.poster_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={title.poster_url}
                alt={`פוסטר ${title.name_he}`}
                className="w-full rounded-2xl shadow-[0_30px_70px_-30px_rgba(0,0,0,1)] ring-1 ring-white/12 transition-transform duration-500 [transition-timing-function:var(--ease-cinema)] hover:-translate-y-1.5 hover:ring-lemon-400/40"
              />
            ) : (
              <div className="poster-fallback aspect-2/3 w-full rounded-2xl text-lg ring-1 ring-white/12" style={{ ["--poster-color" as string]: title.color }}>
                {title.name_he}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-[0.85rem] font-bold">{title.kind === "movie" ? "סרט" : "סדרה"}</span>
              {title.plan_access === "plus" ? <span className="badge-plus">⭐ פלוס בלבד</span> : <span className="badge-free">זמין בחינם</span>}
              {title.is_original ? <span className="rounded-full border border-lemon-400/40 px-3 py-1 text-[0.85rem] font-bold text-lemon-300">מקורי LemonTank</span> : null}
              {title.status !== "published" ? <span className="rounded-full bg-amber-500/20 px-3 py-1 text-[0.85rem] font-bold text-amber-300">טיוטה (לא מפורסם)</span> : null}
            </div>

            <h1 className="text-3xl font-black leading-[1.05] tracking-tight drop-shadow-[0_6px_30px_rgba(0,0,0,0.9)] md:text-6xl">{title.name_he}</h1>
            {title.name_en || title.original_name ? (
              <p className="text-sm text-ink-300" dir="ltr">{title.name_en ?? title.original_name}</p>
            ) : null}
            {title.tagline ? <p className="text-lemon-200">{title.tagline}</p> : null}

            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-200">
              {title.year ? <span className="chip-meta">{title.year}</span> : null}
              <span className="chip-meta">{maturityLabel(title.maturity)}</span>
              {title.kind === "movie" ? (
                <span className="chip-meta">⏱ {formatRuntime((title.runtime_min ?? 0) * 60)}</span>
              ) : (
                <span className="chip-meta">📺 {title.seasons_count} עונות · {title.episodes_count} פרקים</span>
              )}
              {title.rating_imdb ? <span className="chip-meta text-lemon-300">★ {title.rating_imdb.toFixed(1)}</span> : null}
              {title.rating_site ? <span className="chip-meta text-lemon-300">דירוג האתר ★ {Number(title.rating_site).toFixed(1)}</span> : null}
              <span className="chip-meta">{formatNumber(title.views_count)} צפיות</span>
            </div>

            {title.overview ? <p className="max-w-3xl text-sm leading-relaxed text-ink-200 md:text-base">{title.overview}</p> : null}

            <div className="flex flex-wrap items-center gap-2.5">
              {titleLocked || episodeLocked ? (
                <>
                  <Link
                    href="/plans"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-plus-500 to-plus-600 px-6 py-3.5 text-sm font-black text-white shadow-[0_18px_44px_-16px_rgba(139,92,246,1)] transition hover:-translate-y-0.5 hover:brightness-110"
                  >
                    ⭐ שדרג לפלוס כדי לצפות
                  </Link>
                  {title.trailer_url ? (
                    <a
                      href={title.trailer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold backdrop-blur-md transition hover:bg-white/20"
                    >
                      ▶ צפה בטריילר
                    </a>
                  ) : null}
                </>
              ) : (
                <>
                  <Link
                    href={playHref}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-lemon-300 to-lemon-400 px-7 py-3.5 text-sm font-black text-ink-950 shadow-[0_18px_44px_-16px_rgba(247,194,43,0.95)] transition hover:-translate-y-0.5 hover:brightness-105"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="flip-rtl"><path d="M8 5v14l11-7z" /></svg>
                    {resumeTitlePercent > 0.02 ? `המשך לצפות (${Math.round(resumeTitlePercent * 100)}%)` : title.kind === "series" ? "צפה בפרק הראשון" : "צפה עכשיו"}
                  </Link>
                  {user ? <AddToListButton titleId={title.id} initial={inList} /> : null}
                </>
              )}
              <ShareButton title={title.name_he} slug={title.slug} />
              {user ? (
                <DownloadButton
                  titleId={title.id}
                  episodeId={playable?.id ?? null}
                  allowed={isPlus && (title.is_downloadable === 1 || isPlus) && settings.downloads_enabled}
                />
              ) : null}
            </div>

            {user ? (
              <div className="flex flex-wrap items-center gap-3">
                <LikeButtons titleId={title.id} initialLike={liked} initialDislike={disliked} />
                <StarRating titleId={title.id} initial={myRating} />
              </div>
            ) : (
              <p className="text-sm text-ink-400">
                <Link href="/login" className="text-lemon-300 hover:underline">התחבר</Link> כדי לשמור לרשימה, לדרג ולצפות מכל מכשיר.
              </p>
            )}

            {/* מטא-דאטה */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-white/[0.07] bg-black/25 p-4 text-xs backdrop-blur-md md:grid-cols-3">
              {title.director ? (
                <div>
                  <dt className="text-ink-400">בימוי</dt>
                  <dd className="font-medium">{title.director}</dd>
                </div>
              ) : null}
              {title.cast_text ? (
                <div className="col-span-2">
                  <dt className="text-ink-400">שחקנים</dt>
                  <dd className="font-medium">{title.cast_text}</dd>
                </div>
              ) : null}
              {title.country ? (
                <div>
                  <dt className="text-ink-400">מדינה</dt>
                  <dd className="font-medium">{title.country}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-ink-400">אודיו</dt>
                <dd className="font-medium">{audioLangs.map((l) => LANGUAGES[l] ?? l).join(", ")}</dd>
              </div>
              <div>
                <dt className="text-ink-400">כתוביות</dt>
                <dd className="font-medium">{subLangs.map((l) => LANGUAGES[l] ?? l).join(", ")}</dd>
              </div>
              <div>
                <dt className="text-ink-400">איכות מקסימלית</dt>
                <dd className="font-medium">{title.quality_max}</dd>
              </div>
              {title.release_date ? (
                <div>
                  <dt className="text-ink-400">תאריך יציאה</dt>
                  <dd className="font-medium">{formatDate(title.release_date)}</dd>
                </div>
              ) : null}
            </dl>

            {genres.length ? (
              <div className="flex flex-wrap gap-2">
                {genres.map((g) => (
                  <Link
                    key={g.id}
                    href={`/genres/${g.slug}`}
                    className="rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-ink-200 transition hover:border-lemon-400/50 hover:bg-lemon-400/10 hover:text-lemon-200"
                  >
                    {g.icon} {g.name_he}
                  </Link>
                ))}
              </div>
            ) : null}

            {title.awards ? (
              <p className="text-xs text-lemon-300">🏆 {title.awards}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── פרקים (סדרות) ── */}
      {title.kind === "series" ? (
        <section aria-labelledby="episodes-heading">
          <h2 id="episodes-heading" className="mb-4 text-lg font-extrabold md:text-2xl">📺 פרקים</h2>
          <EpisodePicker slug={title.slug} seasons={seasons} episodes={episodes} isPlus={isPlus || staff} progressByEpisode={progressByEpisode} />
        </section>
      ) : null}

      {/* ── דומים ── */}
      {similar.length ? <ContentRow title="סרטים וסדרות דומים" items={similar} /> : null}

      {/* ── תוכן משני ── */}
      {title.trivia ? (
        <section className="card-surface rounded-2xl p-5">
          <h2 className="mb-2 text-lg font-bold">🔎 מאחורי הקלעים</h2>
          <p className="text-sm leading-relaxed text-ink-200">{title.trivia}</p>
        </section>
      ) : null}

      {title.content_warnings ? (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
          <h2 className="text-sm font-bold text-amber-300">⚠️ אזהרות תוכן</h2>
          <p className="mt-1 text-sm text-amber-200/80">{title.content_warnings}</p>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <ReviewsSection titleId={title.id} canReview={Boolean(user)} />
        <CommentsSection
          titleId={title.id}
          episodeId={title.kind === "series" ? firstEpisode?.id : undefined}
          enabled={settings.comments_enabled && title.allow_comments === 1}
        />
      </div>

      {/* JSON-LD לעמוד — SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": title.kind === "movie" ? "Movie" : "TVSeries",
            name: title.name_he,
            alternateName: title.name_en ?? undefined,
            description: title.overview ?? undefined,
            image: title.poster_url ?? undefined,
            datePublished: title.release_date ?? undefined,
            aggregateRating: title.rating_site
              ? { "@type": "AggregateRating", ratingValue: Number(title.rating_site).toFixed(1), bestRating: 10, ratingCount: Math.max(1, title.votes_count ?? 0) }
              : undefined,
            genre: genres.map((g) => g.name_he),
          }).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
