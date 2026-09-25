/**
 * בניית מטען הנגן — הקישורים המדויקים לפרק, לכתוביות ולפרקים הבאים.
 *
 * חשוב: הקישורים נבנים רק אחרי בדיקת הרשאה אמיתית בשרת.
 *   • תוכן 'plus' — הקישור לא נשלח כלל למשתמש חינם (lock=true במקום src).
 *   • כתוביות מוגשות דרך /api/media (עם בדיקת הרשאה בכל בקשה).
 *   • קישורים חיצוניים מוחזרים כמו שהם, אבל רק אחרי אותה בדיקה.
 */

import { all, get } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { isStaff } from "@/lib/rbac";
import { episodeAccess, listEpisodes, listSeasons, getTitleBySlug, type EpisodeRow, type SeasonRow } from "@/lib/catalog";

export type PlayerSource = { label: string; src: string; type?: string };
export type PlayerSubtitle = { label: string; lang: string; src: string; isDefault?: boolean };
export type PlaybackEpisode = {
  id: number;
  label: string;
  season: number;
  number: number;
  locked: boolean;
  thumb?: string | null;
};

export type PlaybackPayload = {
  title: {
    id: number;
    slug: string;
    name_he: string;
    kind: "movie" | "series";
    plan_access: "free" | "plus";
    poster_url: string | null;
    backdrop_url: string | null;
    quality_max: string;
  };
  episode: {
    id: number;
    name_he: string;
    season_number: number;
    number: number;
    overview: string | null;
    runtime_sec: number;
    thumb_url: string | null;
    intro_start_sec: number | null;
    intro_end_sec: number | null;
    credits_start_sec: number | null;
  } | null;
  access: "free" | "plus";
  locked: boolean;
  lockReason?: string;
  sources: PlayerSource[];
  subtitles: PlayerSubtitle[];
  nextEpisode: PlaybackEpisode | null;
  episodes: PlaybackEpisode[];
  resumeAtSec: number;
  preferredSubLang: string;
  autoplayNext: boolean;
};

const VIDEO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
};

function mimeFromPath(pathOrUrl: string | null | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  const clean = pathOrUrl.split("?")[0].toLowerCase();
  const ext = clean.slice(clean.lastIndexOf("."));
  return VIDEO_MIME[ext];
}

export function buildPlayback(opts: {
  slug: string;
  episodeId?: number | null;
  user: SessionUser | null;
  profileId?: number | null;
}): PlaybackPayload | null {
  const staff = isStaff(opts.user?.role);
  const isPlus = opts.user?.effective_plan === "plus";

  const title = getTitleBySlug(opts.slug, { includeUnpublished: staff });
  if (!title) return null;

  const seasons = listSeasons(title.id);
  const seasonMap = new Map<number, SeasonRow>(seasons.map((s) => [s.id, s]));
  const rawEpisodes = listEpisodes(title.id, { includeDrafts: staff });

  const episodesWithAccess = rawEpisodes.map((e) => ({
    ...e,
    effective: episodeAccess(e, seasonMap.get(e.season_id) ?? null, title),
  }));

  // בחירת הפרק המבוקש (או הראשון הזמין)
  let chosen = opts.episodeId ? episodesWithAccess.find((e) => e.id === Number(opts.episodeId)) : undefined;
  if (!chosen && title.kind === "series") {
    // ברירת מחדל: הפרק הבא שלא נצפה, אחרת הראשון
    chosen = episodesWithAccess.find((e) => e.number === 1) ?? episodesWithAccess[0];
  }

  const access: "free" | "plus" = title.kind === "series" && chosen ? chosen.effective : title.plan_access;
  const locked = access === "plus" && !isPlus && !staff;

  /* ── מקורות וידאו ─────────────────────────────────────────────────────── */
  const sources: PlayerSource[] = [];

  if (!locked) {
    const assetRow = chosen?.id
      ? get<{ id: number; mime: string; bytes: number; original_name: string | null }>(
          "SELECT id, mime, bytes, original_name FROM media_assets WHERE episode_id = ? AND kind IN ('video','trailer') AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
          [chosen.id],
        )
      : get<{ id: number; mime: string; bytes: number; original_name: string | null }>(
          "SELECT id, mime, bytes, original_name FROM media_assets WHERE title_id = ? AND episode_id IS NULL AND kind IN ('video','trailer') AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
          [title.id],
        );

    if (assetRow) {
      sources.push({
        label: `${title.quality_max} · מקור`,
        src: `/api/media/${assetRow.id}`,
        type: assetRow.mime || mimeFromPath(assetRow.original_name),
      });
    }

    // קישור חיצוני (CDN / שרת חיצוני) — מקור גיבוי
    const externalUrl = chosen?.video_url ?? (!chosen ? get<{ trailer_url: string | null }>("SELECT trailer_url FROM titles WHERE id = ?", [title.id])?.trailer_url : null);
    if (externalUrl && /^https?:\/\//.test(externalUrl)) {
      sources.push({ label: `${title.quality_max} · CDN`, src: externalUrl, type: mimeFromPath(externalUrl) });
    }
  }

  /* ── כתוביות ──────────────────────────────────────────────────────────── */
  const subs = locked
    ? []
    : all<{ lang: string; label: string; url: string | null; asset_id: number | null; is_default: number }>(
        `SELECT lang, label, url, asset_id, is_default FROM subtitle_tracks
         WHERE (title_id = ? AND (episode_id IS NULL OR episode_id = ?))
            OR (episode_id = ?) ORDER BY is_default DESC, lang`,
        [title.id, chosen?.id ?? -1, chosen?.id ?? -1],
      );

  const subtitles: PlayerSubtitle[] = subs
    .map((s) => ({
      lang: s.lang,
      label: s.label,
      src: s.asset_id ? `/api/media/${s.asset_id}` : (s.url ?? ""),
      isDefault: Boolean(s.is_default),
    }))
    .filter((s) => s.src);

  /* ── נקודת המשך ───────────────────────────────────────────────────────── */
  let resumeAtSec = 0;
  if (opts.user) {
    const progress = chosen
      ? get<{ position_sec: number; completed: number }>(
          "SELECT position_sec, completed FROM watch_progress WHERE user_id = ? AND profile_id IS ? AND episode_id = ?",
          [opts.user.id, opts.profileId ?? null, chosen.id],
        )
      : get<{ position_sec: number; completed: number }>(
          "SELECT position_sec, completed FROM watch_progress WHERE user_id = ? AND profile_id IS ? AND title_id = ? AND episode_id IS NULL",
          [opts.user.id, opts.profileId ?? null, title.id],
        );
    if (progress && !progress.completed) resumeAtSec = Number(progress.position_sec) || 0;
  }

  /* ── פרקי הנגן ────────────────────────────────────────────────────────── */
  const episodes: PlaybackEpisode[] = episodesWithAccess.map((e) => ({
    id: e.id,
    label: e.name_he,
    season: e.season_number,
    number: e.number,
    locked: e.effective === "plus" && !isPlus && !staff,
    thumb: e.thumb_url,
  }));

  const currentIndex = chosen ? episodesWithAccess.findIndex((e) => e.id === chosen!.id) : -1;
  const next = currentIndex >= 0 ? episodesWithAccess[currentIndex + 1] : undefined;
  const nextEpisode: PlaybackEpisode | null = next
    ? {
        id: next.id,
        label: next.name_he,
        season: next.season_number,
        number: next.number,
        locked: next.effective === "plus" && !isPlus && !staff,
        thumb: next.thumb_url,
      }
    : null;

  const profile = opts.profileId
    ? get<{ autoplay_next: number; lang_subs: string }>("SELECT autoplay_next, lang_subs FROM profiles WHERE id = ?", [opts.profileId])
    : undefined;

  return {
    title: {
      id: title.id,
      slug: title.slug,
      name_he: title.name_he,
      kind: title.kind,
      plan_access: title.plan_access,
      poster_url: title.poster_url,
      backdrop_url: title.backdrop_url,
      quality_max: title.quality_max,
    },
    episode: chosen
      ? {
          id: chosen.id,
          name_he: chosen.name_he,
          season_number: chosen.season_number,
          number: chosen.number,
          overview: chosen.overview,
          runtime_sec: chosen.runtime_sec,
          thumb_url: chosen.thumb_url,
          intro_start_sec: chosen.intro_start_sec,
          intro_end_sec: chosen.intro_end_sec,
          credits_start_sec: chosen.credits_start_sec,
        }
      : null,
    access,
    locked,
    lockReason: locked
      ? `"${title.name_he}" זמין למנויי פלוס בלבד. שדרגו כדי לצפות באיכות ${title.quality_max} ובלי פרסומות.`
      : undefined,
    sources,
    subtitles,
    nextEpisode,
    episodes,
    resumeAtSec,
    preferredSubLang: profile?.lang_subs ?? "he",
    autoplayNext: profile ? Boolean(profile.autoplay_next) : true,
  };
}

export type { EpisodeRow };
