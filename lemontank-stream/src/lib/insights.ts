/**
 * תובנות עסקיות לאדמין — הכנסות, מעורבות ובריאות הקטלוג.
 *
 * הכל SQL על הנתונים האמיתיים. אין נתוני דמו מומצאים: אם אין תשלומים,
 * יוחזר 0 — לא מספר "לדוגמה". כך הדוח שימושי גם ביום הראשון שהאתר ריק.
 */

import { all, count, get } from "./db";

const DAY_MS = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const lastNDays = (n: number): string[] =>
  Array.from({ length: n }, (_, index) => isoDay(new Date(Date.now() - (n - 1 - index) * DAY_MS)));

// ═══════════════════════════════════════════════════════════════════════════
//  הכנסות
// ═══════════════════════════════════════════════════════════════════════════

export type RevenueOverview = {
  currency: string;
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  trialing: number;
  pastDue: number;
  canceledLast30: number;
  arpu: number;
  payingUsers: number;
  totalUsers: number;
  conversionRate: number;
  revenueTotal: number;
  revenueThisMonth: number;
  revenuePrevMonth: number;
  growthPct: number | null;
  byPlan: { plan_code: string; name_he: string; price: number; subscribers: number; mrr: number }[];
  monthly: { month: string; revenue: number; payments: number; refunded: number }[];
  lastPayments: { id: number; user: string | null; email: string | null; amount: number; currency: string; status: string; created_at: string }[];
  failuresLast30: number;
  refundsLast30: number;
  expiringSoon: number;
};

export function revenueOverview(): RevenueOverview {
  const now = new Date();
  const monthStart = `${isoDay(new Date(now.getUTCFullYear(), now.getUTCMonth(), 1))}T00:00:00.000Z`;
  const prevMonthStart = `${isoDay(new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))}T00:00:00.000Z`;
  const since30 = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const byPlan = all<{ plan_code: string; name_he: string; price: number; subscribers: number; mrr: number }>(
    `SELECT p.code AS plan_code, p.name_he, p.price_ils AS price,
            COALESCE(s.subs, 0) AS subscribers,
            ROUND(COALESCE(s.subs, 0) * p.price_ils, 2) AS mrr
     FROM plans p
     LEFT JOIN (
       SELECT plan_code, COUNT(*) AS subs FROM subscriptions WHERE status IN ('active','trialing') GROUP BY plan_code
     ) s ON s.plan_code = p.code
     ORDER BY p.sort_order, p.price_ils DESC`,
  );

  const mrr = byPlan.reduce((sum, row) => sum + Number(row.price || 0) * Number(row.subscribers || 0), 0);

  const monthTotals = get<{ current: number; previous: number; paid: number }>(
    `SELECT COALESCE(SUM(CASE WHEN created_at >= ?      THEN amount ELSE 0 END), 0) AS current,
            COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN amount ELSE 0 END), 0) AS previous,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid
     FROM payments`,
    [monthStart, prevMonthStart, monthStart],
  );

  const monthly = all<{ month: string; revenue: number; payments: number; refunded: number }>(
    `SELECT substr(created_at, 1, 7) AS month,
            ROUND(COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0), 2) AS revenue,
            COUNT(*) AS payments,
            ROUND(COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0), 2) AS refunded
     FROM payments WHERE created_at >= date('now', '-12 months')
     GROUP BY month ORDER BY month DESC`,
  );

  const revenueThisMonth = Number(monthTotals?.current ?? 0);
  const revenuePrevMonth = Number(monthTotals?.previous ?? 0);
  const growthPct = revenuePrevMonth > 0 ? Math.round(((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 1000) / 10 : null;

  const totalUsers = count("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL");
  const payingUsers = count("SELECT COUNT(DISTINCT user_id) c FROM subscriptions WHERE status IN ('active','trialing')");

  return {
    currency: "ILS",
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(mrr * 12 * 100) / 100,
    activeSubscriptions: count("SELECT COUNT(*) c FROM subscriptions WHERE status = 'active'"),
    trialing: count("SELECT COUNT(*) c FROM subscriptions WHERE status = 'trialing'"),
    pastDue: count("SELECT COUNT(*) c FROM subscriptions WHERE status = 'past_due'"),
    canceledLast30: count("SELECT COUNT(*) c FROM subscriptions WHERE status IN ('canceled','expired') AND COALESCE(canceled_at, updated_at) >= ?", [since30]),
    arpu: payingUsers ? Math.round((mrr / payingUsers) * 100) / 100 : 0,
    payingUsers,
    totalUsers,
    conversionRate: totalUsers ? Math.round((payingUsers / totalUsers) * 1000) / 10 : 0,
    revenueTotal: Math.round(Number(monthTotals?.paid ?? 0) * 100) / 100,
    revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
    revenuePrevMonth: Math.round(revenuePrevMonth * 100) / 100,
    growthPct,
    byPlan,
    monthly,
    lastPayments: all(
      `SELECT pay.id, u.name AS user, u.email, pay.amount, pay.currency, pay.status, pay.created_at
       FROM payments pay LEFT JOIN users u ON u.id = pay.user_id
       ORDER BY pay.created_at DESC LIMIT 10`,
    ),
    failuresLast30: count("SELECT COUNT(*) c FROM payments WHERE status = 'failed' AND created_at >= ?", [since30]),
    refundsLast30: count("SELECT COUNT(*) c FROM payments WHERE status = 'refunded' AND created_at >= ?", [since30]),
    expiringSoon: count(
      `SELECT COUNT(*) c FROM subscriptions
       WHERE status IN ('active','trialing') AND current_period_end IS NOT NULL
         AND current_period_end <= date('now', '+7 days')`,
    ),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  מעורבות
// ═══════════════════════════════════════════════════════════════════════════

export type EngagementOverview = {
  dau: number;
  wau: number;
  mau: number;
  stickiness: number;
  activeNow: number;
  watchHours30: number;
  completions30: number;
  avgSessionMinutes: number;
  topTitles: { title_id: number; name: string; slug: string; views: number; minutes: number }[];
  topSearches: { term: string; hits: number }[];
  trend: { day: string; viewers: number; plays: number }[];
  funnel: { registered: number; watchedOnce: number; watched5: number; plusMembers: number };
  peakHours: { hour: number; events: number }[];
};

export function engagementOverview(): EngagementOverview {
  const since = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
  const viewers = (days: number) =>
    count("SELECT COUNT(DISTINCT user_id) c FROM analytics_events WHERE user_id IS NOT NULL AND created_at >= ?", [since(days)]);

  const dau = viewers(1);
  const wau = viewers(7);
  const mau = viewers(30);

  const watch = get<{ minutes: number; events: number }>(
    `SELECT COALESCE(SUM(CAST(json_extract(meta, '$.minutes') AS REAL)), 0) AS minutes, COUNT(*) AS events
     FROM analytics_events WHERE kind IN ('finish','pause','play') AND created_at >= ?`,
    [since(30)],
  );

  // מגמה יומית ל-14 יום — ממלא ימים בלי נתונים באפס (לא מדלג)
  const rawTrend = all<{ day: string; viewers: number; plays: number }>(
    `SELECT substr(created_at, 1, 10) AS day,
            COUNT(DISTINCT user_id) AS viewers,
            SUM(CASE WHEN kind = 'play' THEN 1 ELSE 0 END) AS plays
     FROM analytics_events WHERE created_at >= ? GROUP BY day ORDER BY day`,
    [since(14)],
  );
  const byDay = new Map(rawTrend.map((row) => [row.day, row]));
  const trend = lastNDays(14).map((day) => ({
    day,
    viewers: Number(byDay.get(day)?.viewers ?? 0),
    plays: Number(byDay.get(day)?.plays ?? 0),
  }));

  const topSearches = all<{ term: string; hits: number }>(
    `SELECT LOWER(TRIM(json_extract(meta, '$.q'))) AS term, COUNT(*) AS hits
     FROM analytics_events
     WHERE kind = 'search' AND created_at >= ? AND json_extract(meta, '$.q') IS NOT NULL AND TRIM(json_extract(meta, '$.q')) <> ''
     GROUP BY term ORDER BY hits DESC LIMIT 12`,
    [since(30)],
  );

  const watchedOnce = count("SELECT COUNT(DISTINCT user_id) c FROM watch_progress");
  const watched5 = count(
    "SELECT COUNT(*) c FROM (SELECT user_id FROM watch_progress GROUP BY user_id HAVING COUNT(DISTINCT title_id) >= 5) x",
  );

  return {
    dau,
    wau,
    mau,
    stickiness: mau ? Math.round((dau / mau) * 1000) / 10 : 0,
    activeNow: count("SELECT COUNT(DISTINCT user_id) c FROM analytics_events WHERE created_at >= ?", [since(0.25)]),
    watchHours30: Math.round((Number(watch?.minutes ?? 0) / 60) * 10) / 10,
    completions30: count("SELECT COUNT(*) c FROM analytics_events WHERE kind = 'finish' AND created_at >= ?", [since(30)]),
    avgSessionMinutes: Number(watch?.events ?? 0) > 0 ? Math.round(Number(watch?.minutes ?? 0) / Number(watch?.events ?? 1)) : 0,
    topTitles: all(
      `SELECT v.title_id, t.name_he AS name, t.slug, SUM(v.views) AS views, SUM(v.minutes) AS minutes
       FROM title_views_daily v JOIN titles t ON t.id = v.title_id
       WHERE v.day >= date('now', '-30 days') AND t.deleted_at IS NULL
       GROUP BY v.title_id ORDER BY views DESC LIMIT 10`,
    ),
    topSearches,
    trend,
    funnel: {
      registered: count("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL"),
      watchedOnce,
      watched5,
      plusMembers: count("SELECT COUNT(*) c FROM users WHERE plan_code = 'plus' AND deleted_at IS NULL"),
    },
    peakHours: all<{ hour: number; events: number }>(
      `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS events
       FROM analytics_events WHERE created_at >= ? GROUP BY hour ORDER BY hour`,
      [since(30)],
    ).map((row) => ({ hour: Number(row.hour), events: Number(row.events) })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  בריאות הקטלוג — מה כדאי להשלים
// ═══════════════════════════════════════════════════════════════════════════

export type ContentHealth = {
  titles: number;
  published: number;
  movies: number;
  series: number;
  episodes: number;
  noPoster: number;
  noBackdrop: number;
  noTrailer: number;
  noSynopsis: number;
  noGenres: number;
  noCast: number;
  noMedia: number;
  emptySeries: number;
  notDownloadable: number;
  stale90: number;
  completeness: number;
  issues: { key: string; label: string; count: number; hint: string }[];
};

export function contentHealth(): ContentHealth {
  const titles = count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL");
  const noPoster = count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL AND (poster_url IS NULL OR poster_url = '')");
  const issues = [
    { key: "poster", label: "בלי פוסטר", count: noPoster, hint: "כרטיס בלי פוסטר נראה שבור — העלו תמונה" },
    { key: "backdrop", label: "בלי תמונת רקע", count: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL AND (backdrop_url IS NULL OR backdrop_url = '')"), hint: "רקע משפר את דף הכותר וה-Hero" },
    { key: "trailer", label: "בלי טריילר", count: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL AND (trailer_url IS NULL OR trailer_url = '')"), hint: "טריילר מעלה המרה משמעותית" },
    { key: "synopsis", label: "בלי תקציר", count: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL AND (overview IS NULL OR length(trim(overview)) < 20)"), hint: "תקציר קצר אך ברור — לפחות שורה" },
    { key: "genres", label: "בלי ז'אנר", count: count("SELECT COUNT(*) c FROM titles t WHERE t.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM title_genres g WHERE g.title_id = t.id)"), hint: "ז'אנר נדרש להמלצות ולסינון" },
    { key: "cast", label: "בלי שחקנים", count: count("SELECT COUNT(*) c FROM titles t WHERE t.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM credits c WHERE c.title_id = t.id)"), hint: "קרדיטים מזינים את 'האנשים של השנה'" },
    { key: "media", label: "בלי קובץ וידאו", count: count("SELECT COUNT(*) c FROM titles t WHERE t.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.title_id = t.id)"), hint: "בלי קובץ אין מה לנגן" },
    { key: "episodes", label: "סדרות בלי פרקים", count: count("SELECT COUNT(*) c FROM titles t WHERE t.deleted_at IS NULL AND t.kind='series' AND NOT EXISTS (SELECT 1 FROM episodes e WHERE e.title_id = t.id AND e.deleted_at IS NULL)"), hint: "סדרה בלי פרקים לא ניתנת לצפייה" },
  ];

  const noMedia = issues.find((issue) => issue.key === "media")?.count ?? 0;
  const noMediaImportable = titles - noMedia;
  const completeness = titles > 0 ? Math.round((noMediaImportable / titles) * 1000) / 10 : 100;

  return {
    titles,
    published: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL AND status = 'published'"),
    movies: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL AND kind = 'movie'"),
    series: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL AND kind = 'series'"),
    episodes: count("SELECT COUNT(*) c FROM episodes WHERE deleted_at IS NULL"),
    noPoster,
    noBackdrop: issues[1].count,
    noTrailer: issues[2].count,
    noSynopsis: issues[3].count,
    noGenres: issues[4].count,
    noCast: issues[5].count,
    noMedia,
    emptySeries: issues[7].count,
    notDownloadable: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL AND is_downloadable = 0"),
    stale90: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL AND updated_at < date('now', '-90 days')"),
    completeness,
    issues: issues.filter((issue) => issue.count > 0),
  };
}

/** ייצוא CSV — לדוחות חיצוניים (אקסל/Google Sheets) */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return "\uFEFF";
  const keys = columns ?? Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return ["\uFEFF" + keys.join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
}
