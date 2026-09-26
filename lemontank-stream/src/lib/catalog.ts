/**
 * שכבת הקטלוג: שאילתות לתוכן + הכרעת הרשאות צפייה (חינם / פלוס).
 *
 * ─ חוק הגישה ────────────────────────────────────────────────────────────────
 *   כל תוכן מסומן 'free' או 'plus' ע"י האדמין (טבלת titles.plan_access,
 *   seasons.plan_access, episodes.plan_access).
 *   לפרק בודד בסדרה יש דריסה:  episode → season → title  (inherit).
 *   צוות (editor/admin/owner) רואה הכל. מנוי 'plus' רואה הכל.
 *   משתמש 'free' רואה רק free.
 *   האכיפה מתבצעת בשרת לפני שמוחזר קישור לנגן — לא רק בהסתרת כפתור ב-UI.
 */

import { all, count, get, parseJson, run, safeOrderBy } from "./db";
import type { SessionUser } from "./session";
import { isStaff } from "./rbac";

export type PlanAccess = "free" | "plus";

export type TitleCard = {
  id: number;
  kind: "movie" | "series";
  slug: string;
  name_he: string;
  name_en: string | null;
  original_name?: string | null;
  votes_count?: number;
  overview: string | null;
  year: number | null;
  poster_url: string | null;
  backdrop_url: string | null;
  color: string;
  plan_access: PlanAccess;
  rating_site: number | null;
  rating_imdb: number | null;
  runtime_min: number | null;
  seasons_count: number;
  episodes_count: number;
  maturity: string;
  quality_max: string;
  is_featured: number;
  is_original: number;
  trending_score: number;
  views_count: number;
  status: string;
  updated_at: string;
  genres?: string | null;
};

export type TitleDetail = TitleCard & {
  tagline: string | null;
  release_date: string | null;
  end_date: string | null;
  country: string | null;
  language: string;
  director: string | null;
  writer: string | null;
  cast_text: string | null;
  studios: string | null;
  logo_url: string | null;
  trailer_url: string | null;
  audio_langs: string;
  subtitle_langs: string;
  awards: string | null;
  trivia: string | null;
  content_warnings: string | null;
  keywords: string | null;
  allow_comments: number;
  is_downloadable: number;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  ai_summary: string | null;
};

export type EpisodeRow = {
  id: number;
  title_id: number;
  season_id: number;
  season_number: number;
  number: number;
  name_he: string;
  name_en: string | null;
  original_name?: string | null;
  votes_count?: number;
  overview: string | null;
  runtime_sec: number;
  air_date: string | null;
  thumb_url: string | null;
  video_url: string | null;
  plan_access: "inherit" | PlanAccess;
  status: string;
  views_count: number;
  intro_start_sec: number | null;
  intro_end_sec: number | null;
  credits_start_sec: number | null;
  is_premiere: number;
  is_finale: number;
};

export type SeasonRow = {
  id: number;
  title_id: number;
  number: number;
  name_he: string | null;
  overview: string | null;
  poster_url: string | null;
  year: number | null;
  episodes_count: number;
  plan_access: "inherit" | PlanAccess;
};

const CARD_COLUMNS = `t.id, t.kind, t.slug, t.name_he, t.name_en, t.original_name, t.overview, t.year, t.poster_url, t.backdrop_url,
  t.color, t.plan_access, t.rating_site, t.rating_imdb, t.runtime_min, t.seasons_count, t.episodes_count,
  t.maturity, t.quality_max, t.is_featured, t.is_original, t.trending_score, t.views_count, t.votes_count, t.status, t.updated_at,
  (SELECT GROUP_CONCAT(g.name_he, ', ') FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = t.id) AS genres`;

/* ────────────────────────────── הכרעת גישה ─────────────────────────────── */

/** חישוב רמת הגישה האפקטיבית לפרק לפי שרשרת הירושה */
export function episodeAccess(episode: Pick<EpisodeRow, "plan_access">, season?: Pick<SeasonRow, "plan_access"> | null, title?: { plan_access: PlanAccess } | null): PlanAccess {
  if (episode.plan_access === "free" || episode.plan_access === "plus") return episode.plan_access;
  if (season && (season.plan_access === "free" || season.plan_access === "plus")) return season.plan_access;
  return title?.plan_access ?? "free";
}

export const planAccessOfEpisode = episodeAccess;
export const planAccessOfTitle = (title: Pick<TitleDetail, "plan_access">): PlanAccess => title.plan_access;

/** האם המשתמש רשאי לצפות בתוכן ברמה נתונה */
export function canWatch(user: SessionUser | null, access: PlanAccess): boolean {
  if (access === "free") return true;
  if (!user) return false;
  if (isStaff(user.role)) return true;                 // צוות רואה הכל (לבדיקות תוכן)
  return user.effective_plan === "plus";
}

/** האם להציג למשתמש חומר "בהרצה מוקדמת" (early access) שמיועד לפלוס */
export const isEarlyAccessLocked = (user: SessionUser | null, earlyAccess: boolean): boolean => earlyAccess && user?.effective_plan !== "plus";

/* ──────────────────────────────── שליפות ───────────────────────────────── */

export type CatalogQuery = {
  kind?: "movie" | "series";
  plan?: PlanAccess;
  genreId?: number;
  genreSlug?: string;
  year?: number;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  includeUnpublished?: boolean;
  featuredOnly?: boolean;
  originalsOnly?: boolean;
  downloadableOnly?: boolean;
  maturityMax?: string;
  excludeIds?: number[];
};

const SORTS: Record<string, string> = {
  newest: "t.published_at DESC, t.id DESC",
  added: "t.created_at DESC",
  popular: "t.views_count DESC, t.popularity DESC",
  trending: "t.trending_score DESC, t.views_count DESC",
  rating: "COALESCE(t.rating_site, t.rating_imdb, 0) DESC",
  az: "t.name_he ASC",
  year: "t.year DESC",
  updated: "t.updated_at DESC",
};

/** שאילתת קטלוג עם סינון דינמי — כל הפרמטרים מוזרקים כ-placeholders */
export function listCatalog(query: CatalogQuery = {}): { items: TitleCard[]; total: number } {
  const where: string[] = ["t.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (!query.includeUnpublished) {
    where.push("t.status = 'published'");
  }
  if (query.kind) {
    where.push("t.kind = ?");
    params.push(query.kind);
  }
  if (query.plan) {
    where.push("t.plan_access = ?");
    params.push(query.plan);
  }
  if (query.year) {
    where.push("t.year = ?");
    params.push(query.year);
  }
  if (query.featuredOnly) where.push("t.is_featured = 1");
  if (query.originalsOnly) where.push("t.is_original = 1");
  if (query.downloadableOnly) where.push("t.is_downloadable = 1");
  if (query.maturityMax) {
    where.push("t.age_rating_age <= ?");
    params.push(maturityToAge(query.maturityMax));
  }
  if (query.genreId || query.genreSlug) {
    where.push(`t.id IN (SELECT tg.title_id FROM title_genres tg ${query.genreId ? "" : "JOIN genres g ON g.id = tg.genre_id"} WHERE ${query.genreId ? "tg.genre_id = ?" : "g.slug = ?"})`);
    params.push(query.genreId ?? query.genreSlug);
  }
  if (query.q) {
    where.push("(t.name_he LIKE ? OR t.name_en LIKE ? OR t.overview LIKE ? OR t.cast_text LIKE ?)");
    const like = `%${String(query.q).slice(0, 80)}%`;
    params.push(like, like, like, like);
  }
  if (query.excludeIds?.length) {
    const placeholders = query.excludeIds.slice(0, 200).map(() => "?").join(",");
    where.push(`t.id NOT IN (${placeholders})`);
    params.push(...query.excludeIds.slice(0, 200));
  }

  const orderBy = safeOrderBy(SORTS[query.sort ?? "trending"], Object.keys(SORTS).map((k) => SORTS[k]).concat(["t.id DESC"]), SORTS.trending);
  const limit = Math.min(100, Math.max(1, query.limit ?? 24));
  const offset = Math.max(0, query.offset ?? 0);
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const items = all<TitleCard>(
    `SELECT ${CARD_COLUMNS} FROM titles t ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const total = count(`SELECT COUNT(*) c FROM titles t ${whereSql}`, params);
  return { items, total };
}

/** מיפוי תווית גיל למספר להשוואה */
export function maturityToAge(label: string): number {
  const n = parseInt(String(label).replace("+", ""), 10);
  return Number.isFinite(n) ? n : 18;
}

export function getTitleBySlug(slug: string, opts: { includeUnpublished?: boolean } = {}): TitleDetail | null {
  const row = get<TitleDetail>(
    `SELECT ${CARD_COLUMNS}, t.tagline, t.release_date, t.end_date, t.country, t.language, t.director, t.writer,
            t.cast_text, t.studios, t.logo_url, t.trailer_url, t.audio_langs, t.subtitle_langs, t.awards, t.trivia,
            t.content_warnings, t.keywords, t.allow_comments, t.is_downloadable, t.seo_title, t.seo_description,
            t.published_at, t.created_at, t.ai_summary
     FROM titles t WHERE t.slug = ? AND t.deleted_at IS NULL ${opts.includeUnpublished ? "" : "AND t.status = 'published'"}`,
    [slug],
  );
  return row ?? null;
}

export function getTitleById(id: number): TitleDetail | null {
  const row = get<TitleDetail>(
    `SELECT ${CARD_COLUMNS}, t.tagline, t.release_date, t.end_date, t.country, t.language, t.director, t.writer,
            t.cast_text, t.studios, t.logo_url, t.trailer_url, t.audio_langs, t.subtitle_langs, t.awards, t.trivia,
            t.content_warnings, t.keywords, t.allow_comments, t.is_downloadable, t.seo_title, t.seo_description,
            t.published_at, t.created_at, t.ai_summary
     FROM titles t WHERE t.id = ? AND t.deleted_at IS NULL`,
    [id],
  );
  return row ?? null;
}

export const listSeasons = (titleId: number): SeasonRow[] =>
  all<SeasonRow>(
    `SELECT id, title_id, number, name_he, overview, poster_url, year, episodes_count, plan_access
     FROM seasons WHERE title_id = ? ORDER BY number ASC`,
    [titleId],
  );

export const listEpisodes = (titleId: number, opts: { seasonNumber?: number; includeDrafts?: boolean } = {}): EpisodeRow[] => {
  const params: unknown[] = [titleId];
  let where = "e.title_id = ? AND e.deleted_at IS NULL";
  if (opts.seasonNumber) {
    where += " AND e.season_number = ?";
    params.push(opts.seasonNumber);
  }
  if (!opts.includeDrafts) where += " AND e.status = 'published'";
  return all<EpisodeRow>(
    `SELECT e.id, e.title_id, e.season_id, e.season_number, e.number, e.name_he, e.name_en, e.overview, e.runtime_sec,
            e.air_date, e.thumb_url, e.video_url, e.plan_access, e.status, e.views_count,
            e.intro_start_sec, e.intro_end_sec, e.credits_start_sec, e.is_premiere, e.is_finale
     FROM episodes e WHERE ${where} ORDER BY e.season_number ASC, e.number ASC`,
    params,
  );
};

export const getEpisode = (id: number): EpisodeRow | null =>
  get<EpisodeRow>(
    `SELECT e.id, e.title_id, e.season_id, e.season_number, e.number, e.name_he, e.name_en, e.overview, e.runtime_sec,
            e.air_date, e.thumb_url, e.video_url, e.plan_access, e.status, e.views_count,
            e.intro_start_sec, e.intro_end_sec, e.credits_start_sec, e.is_premiere, e.is_finale
     FROM episodes e WHERE e.id = ? AND e.deleted_at IS NULL`,
    [id],
  ) ?? null;

export const listGenres = () =>
  all<{ id: number; slug: string; name_he: string; icon: string | null; color: string }>(
    "SELECT id, slug, name_he, icon, color FROM genres ORDER BY sort ASC, name_he ASC",
  );

export const genresOfTitle = (titleId: number) =>
  all<{ id: number; slug: string; name_he: string; icon: string | null }>(
    `SELECT g.id, g.slug, g.name_he, g.icon FROM title_genres tg JOIN genres g ON g.id = tg.genre_id
     WHERE tg.title_id = ? ORDER BY g.sort`,
    [titleId],
  );

/** סרטים/סדרות דומים: לפי ז'אנרים משותפים ואז פופולריות */
export function similarTitles(titleId: number, limit = 12): TitleCard[] {
  return all<TitleCard>(
    `SELECT ${CARD_COLUMNS}, COUNT(*) AS shared
     FROM titles t
     JOIN title_genres tg2 ON tg2.title_id = t.id
     WHERE t.status='published' AND t.deleted_at IS NULL AND t.id <> ?
       AND tg2.genre_id IN (SELECT genre_id FROM title_genres WHERE title_id = ?)
     GROUP BY t.id
     ORDER BY shared DESC, t.trending_score DESC
     LIMIT ?`,
    [titleId, titleId, limit],
  );
}

/** שמירת צפייה בודדת — נקרא מדף הכותרת (עם הגנת ספאם) */
export function registerTitleView(titleId: number, userId?: number | null): void {
  run("UPDATE titles SET views_count = views_count + 1, popularity = popularity + 0.1 WHERE id = ?", [titleId]);
  run(
    `INSERT INTO title_views_daily(day, title_id, views, minutes) VALUES(date('now'), ?, 1, 0)
     ON CONFLICT(day, title_id) DO UPDATE SET views = views + 1`,
    [titleId],
  );
  run("INSERT INTO analytics_events(kind, title_id, user_id) VALUES('title_view', ?, ?)", [titleId, userId ?? null]);
}

export function registerEpisodeView(episodeId: number): void {
  run("UPDATE episodes SET views_count = views_count + 1 WHERE id = ?", [episodeId]);
}

/* ───────────────────────── תצוגות מוכנות לדפים ─────────────────────────── */

export type HomeRow = {
  id: string;
  title: string;
  layout: string;
  items: TitleCard[];
  plan_access?: string;
  continueWatching?: boolean;
};

/** שורות עמוד הבית — מבוססות טבלת collections (האדמין שולט בהן) */
export function homeRows(user: SessionUser | null, opts: { planFilter?: PlanAccess } = {}): HomeRow[] {
  const collections = all<{
    id: number; slug: string; name_he: string; layout: string; plan_access: string; is_auto: number;
    rule_json: string | null; sort_order: number; active_from: string | null; active_to: string | null;
  }>(
    `SELECT id, slug, name_he, layout, plan_access, is_auto, rule_json, sort_order, active_from, active_to
     FROM collections
     WHERE is_public = 1
       AND (active_from IS NULL OR active_from <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       AND (active_to IS NULL OR active_to >= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ORDER BY sort_order ASC, id ASC`,
  );

  const isPlus = user?.effective_plan === "plus" || isStaff(user?.role);

  const rows: HomeRow[] = [];
  for (const c of collections) {
    if (c.plan_access === "plus" && !isPlus && !isStaff(user?.role)) continue; // שורות פלוס מוסתרות ממשתמש חינם
    const rule = parseJson<{ sort?: string; kind?: "movie" | "series"; plan?: PlanAccess; genreSlug?: string; year?: number; limit?: number; featuredOnly?: boolean }>(c.rule_json, {});
    const items = c.is_auto
      ? listCatalog({
          sort: rule.sort ?? "trending",
          kind: rule.kind,
          plan: rule.plan,
          genreSlug: rule.genreSlug,
          year: rule.year,
          featuredOnly: rule.featuredOnly,
          limit: rule.limit ?? 18,
        }).items
      : all<TitleCard>(
          `SELECT ${CARD_COLUMNS} FROM collection_titles ct JOIN titles t ON t.id = ct.title_id
           WHERE ct.collection_id = ? AND t.status='published' AND t.deleted_at IS NULL
           ORDER BY ct.sort_order ASC LIMIT 30`,
          [c.id],
        );
    if (items.length) rows.push({ id: c.slug, title: c.name_he, layout: c.layout, items, plan_access: c.plan_access });
  }

  // שורת "המשך לצפות" אישית — תמיד ראשונה אצל משתמש מחובר
  if (user) {
    const cont = continueWatching(user.id, 18);
    if (cont.length) rows.unshift({ id: "continue", title: "המשך לצפות", layout: "continue", items: cont, continueWatching: true });
  }

  return rows;
}

/** "המשך לצפות" — מבוסס התקדמות צפייה של המשתמש */
export function continueWatching(userId: number, limit = 18): TitleCard[] {
  return all<TitleCard>(
    `SELECT ${CARD_COLUMNS}, wp.position_sec, wp.duration_sec, wp.percent, wp.episode_id, wp.updated_at AS seen_at
     FROM watch_progress wp
     JOIN titles t ON t.id = wp.title_id
     WHERE wp.user_id = ? AND wp.completed = 0 AND wp.percent > 0.02 AND t.deleted_at IS NULL
     GROUP BY t.id
     ORDER BY wp.updated_at DESC LIMIT ?`,
    [userId, limit],
  );
}

/** ז'אנרים שהמשתמש אוהב — לחישוב המלצות */
export function favoriteGenreIds(userId: number, limit = 3): number[] {
  return all<{ genre_id: number; score: number }>(
    `SELECT tg.genre_id, COUNT(*) * SUM(CASE WHEN wp.completed = 1 THEN 2 ELSE 1 END) AS score
     FROM watch_progress wp
     JOIN title_genres tg ON tg.title_id = wp.title_id
     WHERE wp.user_id = ?
     GROUP BY tg.genre_id ORDER BY score DESC LIMIT ?`,
    [userId, limit],
  ).map((r) => Number(r.genre_id));
}

/** "מומלץ עבורך" — שילוב ז'אנרים מועדפים + טרנדים, בלי מה שכבר נראה */
export function recommendationsFor(userId: number, limit = 18): TitleCard[] {
  const genres = favoriteGenreIds(userId);
  const seen = all<{ title_id: number }>(
    "SELECT DISTINCT title_id FROM watch_progress WHERE user_id = ? AND percent > 0.5 LIMIT 200",
    [userId],
  ).map((r) => Number(r.title_id));

  if (!genres.length) {
    const exclude = seen.length ? seen : [0];
    return listCatalog({ sort: "trending", limit, excludeIds: exclude }).items;
  }

  const genrePlaceholders = genres.map(() => "?").join(",");
  const excludePlaceholders = seen.length ? seen.map(() => "?").join(",") : "0";
  return all<TitleCard>(
    `SELECT ${CARD_COLUMNS}, COUNT(*) AS match_score
     FROM titles t JOIN title_genres tg ON tg.title_id = t.id
     WHERE t.status='published' AND t.deleted_at IS NULL AND tg.genre_id IN (${genrePlaceholders})
       AND t.id NOT IN (${excludePlaceholders})
     GROUP BY t.id
     ORDER BY match_score DESC, t.trending_score DESC, t.rating_site DESC NULLS LAST
     LIMIT ?`,
    [...genres, ...seen, limit],
  );
}

/** חיפוש מאוחד: FTS + סינון הרשאות */
export function searchCatalog(q: string, opts: { planFilter?: (a: PlanAccess) => boolean; limit?: number } = {}) {
  const like = `%${String(q ?? "").slice(0, 80)}%`;
  const rows = all<TitleCard>(
    `SELECT ${CARD_COLUMNS} FROM titles t
     WHERE t.status='published' AND t.deleted_at IS NULL
       AND (t.name_he LIKE ? OR t.name_en LIKE ? OR t.overview LIKE ? OR t.cast_text LIKE ? OR t.director LIKE ?)
     ORDER BY t.trending_score DESC, t.views_count DESC LIMIT ?`,
    [like, like, like, like, like, Math.min(60, opts.limit ?? 40)],
  );
  return opts.planFilter ? rows.filter((r) => opts.planFilter!(r.plan_access)) : rows;
}

/** נתוני עמוד צפייה: הכותר, העונות/הפרקים וסימוני גישה */
export function watchPayload(titleSlug: string, opts: { includeDrafts?: boolean } = {}) {
  const title = getTitleBySlug(titleSlug, { includeUnpublished: opts.includeDrafts });
  if (!title) return null;
  const seasons = listSeasons(title.id);
  const episodes = listEpisodes(title.id, { includeDrafts: opts.includeDrafts });
  const seasonById = new Map(seasons.map((s) => [s.id, s]));
  const enriched = episodes.map((e) => ({
    ...e,
    effective_access: episodeAccess(e, seasonById.get(e.season_id) ?? null, title),
  }));
  return { title, seasons, episodes: enriched };
}

/**
 * האם באתר אין שום כותר (גם לא טיוטה) — משמש להצגת מסך "מתחילים מכאן"
 * במקום דפדפן ריק. טיוטות נחשבות תוכן, כי הבעלים כבר עובד עליהן.
 */
export const isCatalogEmpty = (): boolean =>
  count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL") === 0;

export const catalogStats = () => ({
  movies: count("SELECT COUNT(*) c FROM titles WHERE kind='movie' AND status='published' AND deleted_at IS NULL"),
  series: count("SELECT COUNT(*) c FROM titles WHERE kind='series' AND status='published' AND deleted_at IS NULL"),
  episodes: count("SELECT COUNT(*) c FROM episodes WHERE status='published' AND deleted_at IS NULL"),
  freeTitles: count("SELECT COUNT(*) c FROM titles WHERE plan_access='free' AND status='published' AND deleted_at IS NULL"),
  plusTitles: count("SELECT COUNT(*) c FROM titles WHERE plan_access='plus' AND status='published' AND deleted_at IS NULL"),
  users: count("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL"),
  plusUsers: count("SELECT COUNT(*) c FROM users WHERE plan_code='plus' AND deleted_at IS NULL"),
  views: Number((get<{ c: number }>("SELECT COALESCE(SUM(views_count),0) c FROM titles") as { c?: number })?.c ?? 0),
});

export { isStaff };
