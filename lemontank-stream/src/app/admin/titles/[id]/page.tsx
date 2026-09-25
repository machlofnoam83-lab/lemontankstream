import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TitleForm } from "@/components/admin/title-form";
import { EpisodeManager } from "@/components/admin/episode-manager";
import { Badge, Card } from "@/components/ui/primitives";
import { episodeAccess, genresOfTitle, getTitleById, listEpisodes, listGenres, listSeasons } from "@/lib/catalog";
import { all, get } from "@/lib/db";
import { formatNumber, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "עריכת כותר", robots: { index: false } };
export const dynamic = "force-dynamic";

/** עריכת כותר: פרטים, מדיה, עונות ופרקים (כולל העלאת וידאו לכל פרק) */
export default async function AdminTitleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const titleId = Number(id);
  if (!Number.isFinite(titleId)) notFound();

  const title = getTitleById(titleId);
  if (!title) notFound();

  const genres = listGenres();
  const titleGenres = genresOfTitle(titleId).map((g) => g.id);
  const seasons = listSeasons(titleId);
  const episodes = listEpisodes(titleId, { includeDrafts: true }).map((e) => ({
    ...e,
    effective_access: episodeAccess(e, seasons.find((s) => s.id === e.season_id) ?? null, title),
  }));

  const assets = all<{ id: number; kind: string; mime: string; bytes: number; original_name: string | null; created_at: string }>(
    `SELECT id, kind, mime, bytes, original_name, created_at FROM media_assets
     WHERE (title_id = ? OR episode_id IN (SELECT id FROM episodes WHERE title_id = ?)) AND deleted_at IS NULL
     ORDER BY id DESC LIMIT 50`,
    [titleId, titleId],
  );

  const subtitles = all<{ id: number; lang: string; label: string; episode_id: number | null; created_at: string }>(
    `SELECT st.id, st.lang, st.label, st.episode_id, st.created_at FROM subtitle_tracks st
     WHERE st.title_id = ? ORDER BY st.created_at DESC LIMIT 30`,
    [titleId],
  );

  const audit = all<{ action: string; actor_email: string | null; severity: string; created_at: string }>(
    "SELECT action, actor_email, severity, created_at FROM audit_log WHERE entity = 'title' AND entity_id = ? ORDER BY id DESC LIMIT 10",
    [String(titleId)],
  );

  const videoCount = get<{ c: number }>(
    `SELECT COUNT(*) c FROM media_assets WHERE kind IN ('video','trailer') AND deleted_at IS NULL
       AND (title_id = ? OR episode_id IN (SELECT id FROM episodes WHERE title_id = ?))`,
    [titleId, titleId],
  )?.c ?? 0;

  return (
    <div className="space-y-5">
      <nav className="text-xs text-ink-400">
        <Link href="/admin/titles" className="hover:text-lemon-300">ניהול תוכן</Link> / <span>{title.name_he}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{title.name_he}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-300">
            <Badge tone={title.kind === "movie" ? "info" : "neutral"}>{title.kind === "movie" ? "סרט" : "סדרה"}</Badge>
            <Badge tone={title.plan_access === "plus" ? "plus" : "free"}>{title.plan_access === "plus" ? "⭐ פלוס" : "🆓 חינם"}</Badge>
            <Badge tone={title.status === "published" ? "success" : "warn"}>{title.status === "published" ? "מפורסם" : "טיוטה"}</Badge>
            <span>{formatNumber(title.views_count)} צפיות</span>
            {title.kind === "series" ? <span>· {seasons.length} עונות / {episodes.length} פרקים</span> : null}
            <span>· עודכן {formatRelative(title.updated_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/title/${title.slug}`} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">תצוגה באתר ←</Link>
          <Link href={`/watch/${title.slug}`} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">פתח בנגן</Link>
        </div>
      </header>

      {videoCount === 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/[0.06] p-4">
          <p className="text-sm text-amber-200">
            ⚠️ עוד לא הועלה וידאו{title.kind === "series" ? " לאף פרק" : " לסרט הזה"}. גולשים שיפתחו את הנגן יראו הודעה שהווידאו בהכנה.
          </p>
        </Card>
      ) : null}

      {/* ── עונות ופרקים ── */}
      {title.kind === "series" ? (
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-bold">📺 עונות ופרקים</h2>
          <EpisodeManager
            titleId={title.id}
            titleName={title.name_he}
            seasons={seasons.map((s) => ({ id: s.id, number: s.number, name_he: s.name_he, episodes_count: s.episodes_count, plan_access: s.plan_access }))}
            episodes={episodes.map((e) => ({
              id: e.id,
              season_id: e.season_id,
              season_number: e.season_number,
              number: e.number,
              name_he: e.name_he,
              overview: e.overview,
              runtime_sec: e.runtime_sec,
              thumb_url: e.thumb_url,
              video_url: e.video_url,
              plan_access: e.plan_access,
              status: e.status,
              air_date: e.air_date,
              effective_access: e.effective_access,
            }))}
            titlePlan={title.plan_access}
          />
        </Card>
      ) : null}

      {/* ── טופס הכותר ── */}
      <TitleForm
        genres={genres}
        initial={{
          id: title.id,
          kind: title.kind,
          name_he: title.name_he,
          name_en: title.name_en ?? "",
          tagline: title.tagline ?? "",
          overview: title.overview ?? "",
          year: title.year ? String(title.year) : "",
          runtime_min: title.runtime_min ? String(title.runtime_min) : "",
          maturity: title.maturity,
          country: title.country ?? "",
          director: title.director ?? "",
          cast_text: title.cast_text ?? "",
          poster_url: title.poster_url ?? "",
          backdrop_url: title.backdrop_url ?? "",
          trailer_url: title.trailer_url ?? "",
          color: title.color,
          plan_access: title.plan_access,
          status: title.status as "draft" | "scheduled" | "published" | "archived",
          quality_max: title.quality_max,
          rating_imdb: title.rating_imdb ? String(title.rating_imdb) : "",
          keywords: title.keywords ?? "",
          seo_description: title.seo_description ?? "",
          is_featured: title.is_featured === 1,
          is_original: title.is_original === 1,
          is_downloadable: title.is_downloadable === 1,
          genres: titleGenres,
        }}
      />

      {/* ── נכסי מדיה ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-bold">🗂️ קבצים שהועלו ({assets.length})</h2>
          {assets.length === 0 ? (
            <p className="mt-2 text-xs text-ink-400">עוד לא הועלו קבצים לכותר הזה.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5 text-xs">
              {assets.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="truncate">
                    <Badge tone="neutral">{a.kind}</Badge> {a.original_name ?? `asset-${a.id}`}
                  </span>
                  <span className="shrink-0 text-ink-400">{Math.round(Number(a.bytes) / 1024 / 1024)}MB</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold">💬 כתוביות ({subtitles.length})</h2>
          {subtitles.length === 0 ? (
            <p className="mt-2 text-xs text-ink-400">
              אין כתוביות לכותר. אפשר להעלות קובץ SRT/VTT דרך עורך הפרק (שדה המדיה) — המערכת ממירה SRT ל-VTT אוטומטית.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5 text-xs">
              {subtitles.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span>{s.label} <span className="text-ink-500">({s.lang})</span></span>
                  <span className="text-ink-500">{s.episode_id ? `פרק #${s.episode_id}` : "כל הכותר"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── יומן שינויים לכותר ── */}
      <Card className="p-5">
        <h2 className="text-sm font-bold">📜 היסטוריית שינויים</h2>
        <ul className="mt-3 space-y-2 text-xs">
          {audit.length === 0 ? (
            <li className="text-ink-400">אין רשומות עדיין.</li>
          ) : (
            audit.map((a, i) => (
              <li key={i} className="flex items-center gap-2 border-b border-white/5 pb-2 last:border-0">
                <Badge tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warn" : "neutral"}>{a.action}</Badge>
                <span className="text-ink-300">{a.actor_email ?? "מערכת"}</span>
                <span className="ms-auto text-ink-500">{formatRelative(a.created_at)}</span>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
