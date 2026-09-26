/**
 * "השנה שלי" — סיכום צפייה אישי (Wrap-up).
 *
 * הכל מחושב מהנתונים האמיתיים: watch_progress, ratings, analytics_events ו-badges.
 * אין כאן שום נתון מומצא — אם אין היסטוריה, מוחזר מצב ריק מנומס ולא מספרים מומצאים.
 *
 * ─ מה מחושב ─────────────────────────────────────────────────────────────────
 *  · סה"כ דקות וכותרים, הפילוח לפי סוג (סרט/סדרה)
 *  · הז'אנר המוביל (לפי דקות צפייה בפועל, לא לפי כמות)
 *  · השחקן/במאי — מהקרדיטים של הכותרים שנצפו הכי הרבה
 *  · הכותר של השנה, סדרת השנה, הפתעה (הכותר עם הדירוג הגבוה שלך)
 *  · יום ושעה מועדפים, רצף הצפייה הארוך ביותר
 *  · דירוג ממוצע שהענקת, ומספר התגובות/ביקורות
 */

import { all, count, get } from "./db";

export type WrapRow = { label: string; value: number | string; meta?: string | null; slug?: string | null; poster_url?: string | null };

export type WrapUp = {
  year: number;
  hasData: boolean;
  totalMinutes: number;
  totalHours: number;
  titlesWatched: number;
  moviesWatched: number;
  seriesWatched: number;
  episodesWatched: number;
  completedTitles: number;
  daysWatched: number;
  longestStreak: number;
  favoriteGenre: WrapRow | null;
  topTitles: WrapRow[];
  topPeople: WrapRow[];
  topDay: WrapRow | null;
  topHour: WrapRow | null;
  averageRating: number | null;
  reviewsWritten: number;
  badgesEarned: number;
  busiestMonth: WrapRow | null;
  personality: string;
  personalityNote: string;
};

const MONTHS_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const monthName = (m: number) => MONTHS_HE[Math.max(0, Math.min(11, m - 1))];

const hourBucket = (hour: number): string => {
  if (hour >= 5 && hour < 12) return "בבוקר (5:00–12:00)";
  if (hour >= 12 && hour < 17) return "בצהריים (12:00–17:00)";
  if (hour >= 17 && hour < 22) return "בערב (17:00–22:00)";
  return "בלילה (22:00–5:00)";
};

/**
 * אופי הצפייה — נגזר מהתנהגות אמיתית, לא מהמצאה.
 * (סינפיל / בינג'ר / חוקר / מבלים / מאוזן)
 */
function personalityFor(input: { totalMinutes: number; episodes: number; movies: number; genres: number; nightShare: number; averageRating: number | null }): { label: string; note: string } {
  const { totalMinutes, episodes, movies, genres, nightShare, averageRating } = input;
  if (totalMinutes < 30) return { label: "מתחילים 🌱", note: "עוד מעט נתונים — אבל כל מסע גדול מתחיל בפרק אחד." };
  if (episodes > movies * 3 && episodes > 10) {
    return { label: "בינג'ר/ית 🍿", note: "סדרות זה הבית שלך — אתה לא עוצר באמצע עונה." };
  }
  if (nightShare > 0.5) return { label: "ינשוף לילה 🦉", note: "רוב הצפייה שלך קורית כשכולם כבר ישנים." };
  if (genres >= 8) return { label: "חוקר/ת ז'אנרים 🧭", note: "אתה לא מתקע — אתה עובר בין עולמות בלי הפסקה." };
  if (averageRating !== null && averageRating >= 8) return { label: "מבקר/ית קפדן/ית 🎯", note: "אתה לא מעניק 10 סתם. כשאתה נותן — זה אומר משהו." };
  if (movies > episodes) return { label: "אוהב/ת קולנוע 🎬", note: "סרט טוב בערב אחד — זה כל מה שאתה צריך." };
  return { label: "צופה מאוזן/ת ⚖️", note: "קצת סרטים, קצת סדרות — בדיוק כמו שצריך." };
}

const startOfYear = (year: number) => `${year}-01-01T00:00:00.000Z`;
const endOfYear = (year: number) => `${year + 1}-01-01T00:00:00.000Z`;

export function buildWrapUp(userId: number, year?: number): WrapUp {
  const targetYear = Number.isInteger(year) ? Number(year) : new Date().getUTCFullYear();
  const from = startOfYear(targetYear);
  const to = endOfYear(targetYear);

  // ── דקות צפייה ────────────────────────────────────────────────────────────
  const totals = get<{ minutes: number; titles: number }>(
    `SELECT COALESCE(SUM(CASE WHEN position_sec > duration_sec THEN duration_sec ELSE position_sec END), 0)/60 AS minutes,
            COUNT(DISTINCT title_id) AS titles
     FROM watch_progress
     WHERE user_id = ? AND updated_at >= ? AND updated_at < ?`,
    [userId, from, to],
  );

  const totalMinutes = Math.round(Number(totals?.minutes ?? 0));
  const titlesWatched = Number(totals?.titles ?? 0);

  const kinds = get<{ movies: number; series: number }>(
    `SELECT SUM(CASE WHEN t.kind = 'movie'  THEN 1 ELSE 0 END) AS movies,
            SUM(CASE WHEN t.kind = 'series' THEN 1 ELSE 0 END) AS series
     FROM (SELECT DISTINCT title_id FROM watch_progress WHERE user_id = ? AND updated_at >= ? AND updated_at < ?) p
     JOIN titles t ON t.id = p.title_id`,
    [userId, from, to],
  );

  const episodesWatched = count(
    "SELECT COUNT(*) c FROM watch_progress WHERE user_id = ? AND episode_id IS NOT NULL AND updated_at >= ? AND updated_at < ?",
    [userId, from, to],
  );
  const completedTitles = count(
    `SELECT COUNT(*) c FROM (SELECT title_id FROM watch_progress WHERE user_id = ? AND updated_at >= ? AND updated_at < ?
     GROUP BY title_id HAVING MAX(CASE WHEN position_sec >= duration_sec - 30 THEN 1 ELSE 0 END) = 1) x`,
    [userId, from, to],
  );

  const days = all<{ day: string }>(
    `SELECT DISTINCT substr(updated_at, 1, 10) AS day FROM watch_progress
     WHERE user_id = ? AND updated_at >= ? AND updated_at < ? ORDER BY day`,
    [userId, from, to],
  );
  const daysWatched = days.length;

  // ── רצף הצפייה הארוך ביותר ────────────────────────────────────────────────
  let longestStreak = 0;
  let currentRun = 0;
  let previous: number | null = null;
  for (const row of days) {
    const ts = Date.parse(`${row.day}T00:00:00.000Z`);
    if (previous !== null && ts - previous === 86_400_000) currentRun += 1;
    else currentRun = 1;
    previous = ts;
    longestStreak = Math.max(longestStreak, currentRun);
  }

  // ── ז'אנר מוביל לפי דקות בפועל ────────────────────────────────────────────
  const genre = get<{ label: string; minutes: number; titles: number }>(
    `SELECT g.name_he AS label,
            COALESCE(SUM(w.minutes), 0) AS minutes,
            COUNT(DISTINCT w.title_id) AS titles
     FROM (
       SELECT p.title_id,
              CASE WHEN p.position_sec > p.duration_sec THEN p.duration_sec ELSE p.position_sec END / 60.0 AS minutes
       FROM watch_progress p WHERE p.user_id = ? AND p.updated_at >= ? AND p.updated_at < ?
     ) w
     JOIN title_genres tg ON tg.title_id = w.title_id
     JOIN genres g ON g.id = tg.genre_id
     GROUP BY g.id ORDER BY minutes DESC LIMIT 1`,
    [userId, from, to],
  );

  // ── הכותרים המובילים ─────────────────────────────────────────────────────
  const topTitles = all<WrapRow>(
    `SELECT t.name_he AS label,
            ROUND(COALESCE(SUM(CASE WHEN p.position_sec > p.duration_sec THEN p.duration_sec ELSE p.position_sec END), 0)/60.0) AS value,
            t.slug AS slug, t.poster_url AS poster_url,
            (t.year || ' · ' || CASE t.kind WHEN 'movie' THEN 'סרט' ELSE 'סדרה' END) AS meta
     FROM watch_progress p JOIN titles t ON t.id = p.title_id
     WHERE p.user_id = ? AND p.updated_at >= ? AND p.updated_at < ? AND t.deleted_at IS NULL
     GROUP BY t.id ORDER BY value DESC LIMIT 5`,
    [userId, from, to],
  );

  // ── אנשי השנה (במאי/שחקן מתוך הקרדיטים) ─────────────────────────────────
  const topPeople = all<WrapRow>(
    `SELECT COALESCE(NULLIF(pe.name_he, ''), pe.name) AS label, COUNT(*) AS value, cr.role AS meta
     FROM (
       SELECT DISTINCT p.title_id FROM watch_progress p
       WHERE p.user_id = ? AND p.updated_at >= ? AND p.updated_at < ?
     ) w
     JOIN credits cr ON cr.title_id = w.title_id
     JOIN people pe ON pe.id = cr.person_id
     GROUP BY pe.id ORDER BY value DESC, label LIMIT 5`,
    [userId, from, to],
  );

  // ── יום ושעה מועדפים ─────────────────────────────────────────────────────
  // strftime('%w') → 0=ראשון ; %H → שעה
  const dayRow = get<{ dow: number; total: number }>(
    `SELECT CAST(strftime('%w', updated_at) AS INTEGER) AS dow, COUNT(*) AS total
     FROM watch_progress WHERE user_id = ? AND updated_at >= ? AND updated_at < ?
     GROUP BY dow ORDER BY total DESC LIMIT 1`,
    [userId, from, to],
  );
  const hourRows = all<{ hour: number; total: number }>(
    `SELECT CAST(strftime('%H', updated_at) AS INTEGER) AS hour, COUNT(*) AS total
     FROM watch_progress WHERE user_id = ? AND updated_at >= ? AND updated_at < ?
     GROUP BY hour`,
    [userId, from, to],
  );
  const totalSessions = hourRows.reduce((sum, row) => sum + row.total, 0);
  const nightSessions = hourRows.reduce((sum, row) => sum + (row.hour >= 22 || row.hour < 5 ? row.total : 0), 0);
  const nightShare = totalSessions ? nightSessions / totalSessions : 0;

  const buckets = new Map<string, number>();
  for (const row of hourRows) buckets.set(hourBucket(row.hour), (buckets.get(hourBucket(row.hour)) ?? 0) + row.total);
  const topBucket = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  // ── החודש העמוס ─────────────────────────────────────────────────────────
  const month = get<{ month: number; total: number }>(
    `SELECT CAST(strftime('%m', updated_at) AS INTEGER) AS month, COUNT(*) AS total
     FROM watch_progress WHERE user_id = ? AND updated_at >= ? AND updated_at < ?
     GROUP BY month ORDER BY total DESC LIMIT 1`,
    [userId, from, to],
  );

  // ── דירוגים, ביקורות ותגים ───────────────────────────────────────────────
  const rating = get<{ avg: number | null; total: number }>(
    "SELECT AVG(stars) AS avg, COUNT(*) AS total FROM ratings WHERE user_id = ? AND created_at >= ? AND created_at < ?",
    [userId, from, to],
  );
  const reviewsWritten = count(
    "SELECT COUNT(*) c FROM reviews WHERE user_id = ? AND created_at >= ? AND created_at < ?",
    [userId, from, to],
  );
  const badgesEarned = count(
    "SELECT COUNT(*) c FROM user_badges WHERE user_id = ? AND earned_at >= ? AND earned_at < ?",
    [userId, from, to],
  );
  const genreVariety = count(
    `SELECT COUNT(DISTINCT tg.genre_id) c FROM (
       SELECT DISTINCT title_id FROM watch_progress WHERE user_id = ? AND updated_at >= ? AND updated_at < ?
     ) w JOIN title_genres tg ON tg.title_id = w.title_id`,
    [userId, from, to],
  );

  const averageRating = rating?.avg != null ? Math.round(Number(rating.avg) * 10) / 10 : null;
  const personality = personalityFor({
    totalMinutes,
    episodes: episodesWatched,
    movies: Number(kinds?.movies ?? 0),
    genres: genreVariety,
    nightShare,
    averageRating,
  });

  return {
    year: targetYear,
    hasData: totalMinutes > 0 || titlesWatched > 0,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    titlesWatched,
    moviesWatched: Number(kinds?.movies ?? 0),
    seriesWatched: Number(kinds?.series ?? 0),
    episodesWatched,
    completedTitles,
    daysWatched,
    longestStreak,
    favoriteGenre: genre ? { label: genre.label, value: Math.round(Number(genre.minutes)), meta: `${genre.titles} כותרים` } : null,
    topTitles: topTitles.map((row) => ({ ...row, value: Number(row.value) })),
    topPeople: topPeople.map((row) => ({ ...row, value: Number(row.value) })),
    topDay: dayRow ? { label: DAYS_HE[dayRow.dow] ?? "", value: dayRow.total } : null,
    topHour: topBucket ? { label: topBucket[0], value: topBucket[1] } : null,
    averageRating,
    reviewsWritten,
    badgesEarned,
    busiestMonth: month ? { label: monthName(month.month), value: month.total } : null,
    personality: personality.label,
    personalityNote: personality.note,
  };
}

/** כמה שנות נתונים יש למשתמש — לתפריט בחירת שנה */
export function availableYears(userId: number): number[] {
  const rows = all<{ year: number }>(
    `SELECT DISTINCT CAST(strftime('%Y', updated_at) AS INTEGER) AS year FROM watch_progress
     WHERE user_id = ? ORDER BY year DESC LIMIT 10`,
    [userId],
  );
  const years = rows.map((row) => Number(row.year)).filter((year) => Number.isFinite(year));
  const current = new Date().getUTCFullYear();
  if (!years.includes(current)) years.unshift(current);
  return years;
}
