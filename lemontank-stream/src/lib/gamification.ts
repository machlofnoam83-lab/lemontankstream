/**
 * מערכת הישגים וגיימיפיקציה.
 *
 * הרעיון: כל פעילות אמיתית באתר (צפייה, דירוג, ביקורת, רשימות, מנוי) מזכה בתגים.
 * התגים אינם "קוסמטיקה" — הם מנוע החזרה: המשתמש רואה התקדמות, ויודע מה הצעד הבא.
 *
 * ─ כללי אמינות ───────────────────────────────────────────────────────────────
 *  1. התגים מחושבים **מהנתונים האמיתיים** של המשתמש בכל קריאה (`syncBadges`) —
 *     אין counters שמצטברים בטעות, ואי אפשר "לאבד" תג אחרי איפוס מטמון.
 *  2. הענקה חד-פעמית: `INSERT OR IGNORE` — תג שנרכש לא נמחק ולא מוענק פעמיים.
 *  3. תג שניתן על ידי מנהל (`manual: true`) לא נשלל גם אם התנאי כבר לא מתקיים.
 */

import { all, count, get, run } from "./db";

export type BadgeCriterion = {
  /** תיאור התנאי בעברית — מוצג למשתמש כשהוא עוד לא זכה */
  label: string;
  /** כמה יש למשתמש כרגע */
  progress: number;
  /** כמה צריך */
  target: number;
};

export type BadgeDef = {
  code: string;
  name_he: string;
  icon: string;
  points: number;
  tier: "bronze" | "silver" | "gold" | "legend";
  /** תיאור קצר */
  description: string;
  /** פונקציית מדידה — מחזירה את ההתקדמות הנוכחית מול היעד */
  measure: (userId: number) => BadgeCriterion;
};

/* ─────────────────────────── מדדי התקדמות ─────────────────────────── */

const completedWatches = (userId: number) =>
  count("SELECT COUNT(*) c FROM watch_progress WHERE user_id = ? AND completed = 1", [userId]);

const allWatches = (userId: number) =>
  count("SELECT COUNT(*) c FROM watch_progress WHERE user_id = ?", [userId]);

const distinctTitles = (userId: number) =>
  count("SELECT COUNT(DISTINCT title_id) c FROM watch_progress WHERE user_id = ?", [userId]);

const reviewCount = (userId: number) =>
  count("SELECT COUNT(*) c FROM reviews WHERE user_id = ? AND status <> 'removed'", [userId]);

const ratingCount = (userId: number) =>
  count("SELECT COUNT(*) c FROM ratings WHERE user_id = ?", [userId]);

const listCount = (userId: number) =>
  count("SELECT COUNT(*) c FROM watchlist WHERE user_id = ? AND kind = 'list'", [userId]);

const commentCount = (userId: number) =>
  count("SELECT COUNT(*) c FROM comments WHERE user_id = ? AND status <> 'removed'", [userId]);

const partyCount = (userId: number) =>
  count("SELECT COUNT(*) c FROM watch_parties WHERE host_id = ?", [userId]);

const watchMinutes = (userId: number) =>
  Math.round(Number(get<{ m: number }>("SELECT COALESCE(SUM(duration_sec)/60,0) m FROM watch_progress WHERE user_id = ?", [userId])?.m ?? 0));

/** מספר ימי צפייה ברצף (עד היום או עד אתמול) */
export function currentStreak(userId: number): number {
  const rows = all<{ d: string }>(
    "SELECT DISTINCT substr(updated_at, 1, 10) d FROM watch_progress WHERE user_id = ? ORDER BY d DESC LIMIT 400",
    [userId],
  ).map((r) => r.d);
  if (!rows.length) return 0;

  const dayMs = 86_400_000;
  const toDay = (iso: string) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / dayMs);
  const today = Math.floor(Date.now() / dayMs);

  let streak = 0;
  let cursor = toDay(rows[0]);
  // רצף נחשב רק אם התחיל היום או אתמול — אחרת הוא כבר נשבר
  if (today - cursor > 1) return 0;
  for (const day of rows) {
    const value = toDay(day);
    if (value === cursor) {
      streak += 1;
      cursor -= 1;
    } else if (value < cursor) {
      break;
    }
  }
  return streak;
}

/** האם המשתמש צפה אי פעם בשעות הלילה (00:00–05:00) */
const nightOwl = (userId: number) =>
  count(
    `SELECT COUNT(*) c FROM watch_progress
     WHERE user_id = ? AND CAST(substr(updated_at, 12, 2) AS INTEGER) < 5`,
    [userId],
  ) > 0
    ? 1
    : 0;

const hasPlus = (userId: number) =>
  count("SELECT COUNT(*) c FROM subscriptions WHERE user_id = ? AND status = 'active' AND plan_code <> 'free'", [userId]) > 0 ? 1 : 0;

const daysSinceJoin = (userId: number) =>
  Math.floor(
    Number(
      get<{ d: number }>(
        "SELECT (julianday('now') - julianday(created_at)) d FROM users WHERE id = ?",
        [userId],
      )?.d ?? 0,
      ),
  );

/* ─────────────────────────── קטלוג התגים ─────────────────────────── */

export const BADGES: BadgeDef[] = [
  {
    code: "first_watch",
    name_he: "הצפייה הראשונה",
    icon: "🎬",
    points: 10,
    tier: "bronze",
    description: "סיימת לצפות בפעם הראשונה",
    measure: (id) => ({ label: "סיום צפייה ראשון", progress: Math.min(completedWatches(id), 1), target: 1 }),
  },
  {
    code: "binge_5",
    name_he: "מתחמם",
    icon: "🍿",
    points: 25,
    tier: "bronze",
    description: "סיימת 5 צפיות",
    measure: (id) => ({ label: "סיום 5 צפיות", progress: Math.min(completedWatches(id), 5), target: 5 }),
  },
  {
    code: "marathon_25",
    name_he: "מרתון",
    icon: "🏃",
    points: 80,
    tier: "silver",
    description: "סיימת 25 צפיות",
    measure: (id) => ({ label: "סיום 25 צפיות", progress: Math.min(completedWatches(id), 25), target: 25 }),
  },
  {
    code: "cinephile_100",
    name_he: "חובב קולנוע",
    icon: "🎞️",
    points: 250,
    tier: "gold",
    description: "סיימת 100 צפיות",
    measure: (id) => ({ label: "סיום 100 צפיות", progress: Math.min(completedWatches(id), 100), target: 100 }),
  },
  {
    code: "explorer_10",
    name_he: "מגלה",
    icon: "🧭",
    points: 40,
    tier: "bronze",
    description: "צפית ב-10 כותרים שונים",
    measure: (id) => ({ label: "10 כותרים שונים", progress: Math.min(distinctTitles(id), 10), target: 10 }),
  },
  {
    code: "explorer_50",
    name_he: "נווד מסך",
    icon: "🗺️",
    points: 150,
    tier: "silver",
    description: "צפית ב-50 כותרים שונים",
    measure: (id) => ({ label: "50 כותרים שונים", progress: Math.min(distinctTitles(id), 50), target: 50 }),
  },
  {
    code: "hours_10",
    name_he: "עשר שעות",
    icon: "⏱️",
    points: 60,
    tier: "silver",
    description: "צברת 600 דקות צפייה",
    measure: (id) => ({ label: "600 דקות צפייה", progress: Math.min(watchMinutes(id), 600), target: 600 }),
  },
  {
    code: "hours_60",
    name_he: "בית קולנוע פרטי",
    icon: "🛋️",
    points: 300,
    tier: "gold",
    description: "צברת 3,600 דקות צפייה",
    measure: (id) => ({ label: "3,600 דקות צפייה", progress: Math.min(watchMinutes(id), 3600), target: 3600 }),
  },
  {
    code: "critic_1",
    name_he: "מבקר צעיר",
    icon: "✍️",
    points: 30,
    tier: "bronze",
    description: "כתבת את הביקורת הראשונה",
    measure: (id) => ({ label: "ביקורת ראשונה", progress: Math.min(reviewCount(id), 1), target: 1 }),
  },
  {
    code: "critic_10",
    name_he: "מבקר הבית",
    icon: "🖋️",
    points: 180,
    tier: "gold",
    description: "כתבת 10 ביקורות",
    measure: (id) => ({ label: "10 ביקורות", progress: Math.min(reviewCount(id), 10), target: 10 }),
  },
  {
    code: "rater_25",
    name_he: "נותן ציון",
    icon: "⭐",
    points: 45,
    tier: "bronze",
    description: "דירגת 25 כותרים",
    measure: (id) => ({ label: "25 דירוגים", progress: Math.min(ratingCount(id), 25), target: 25 }),
  },
  {
    code: "collector_20",
    name_he: "אספן",
    icon: "📚",
    points: 55,
    tier: "bronze",
    description: "20 כותרים ברשימה שלך",
    measure: (id) => ({ label: "20 כותרים ברשימה", progress: Math.min(listCount(id), 20), target: 20 }),
  },
  {
    code: "commenter_10",
    name_he: "קול בקהילה",
    icon: "💬",
    points: 50,
    tier: "bronze",
    description: "10 תגובות",
    measure: (id) => ({ label: "10 תגובות", progress: Math.min(commentCount(id), 10), target: 10 }),
  },
  {
    code: "streak_7",
    name_he: "שבוע ברצף",
    icon: "🔥",
    points: 120,
    tier: "silver",
    description: "צפית 7 ימים ברצף",
    measure: (id) => ({ label: "7 ימים ברצף", progress: Math.min(currentStreak(id), 7), target: 7 }),
  },
  {
    code: "streak_30",
    name_he: "חודש ברצף",
    icon: "🌋",
    points: 400,
    tier: "gold",
    description: "צפית 30 ימים ברצף",
    measure: (id) => ({ label: "30 ימים ברצף", progress: Math.min(currentStreak(id), 30), target: 30 }),
  },
  {
    code: "night_owl",
    name_he: "ינשוף לילה",
    icon: "🦉",
    points: 35,
    tier: "bronze",
    description: "צפית אחרי חצות",
    measure: (id) => ({ label: "צפייה אחרי חצות", progress: nightOwl(id), target: 1 }),
  },
  {
    code: "plus_member",
    name_he: "חבר פלוס",
    icon: "💜",
    points: 100,
    tier: "silver",
    description: "מנוי פלוס פעיל",
    measure: (id) => ({ label: "מנוי פלוס", progress: hasPlus(id), target: 1 }),
  },
  {
    code: "party_host",
    name_he: "מארח מסיבות",
    icon: "🎉",
    points: 70,
    tier: "silver",
    description: "אירחת צפייה משותפת",
    measure: (id) => ({ label: "אירוח צפייה משותפת", progress: Math.min(partyCount(id), 1), target: 1 }),
  },
  {
    code: "loyal_180",
    name_he: "חבר ותיק",
    icon: "🏅",
    points: 200,
    tier: "gold",
    description: "180 יום איתנו",
    measure: (id) => ({ label: "180 יום חברות", progress: Math.min(daysSinceJoin(id), 180), target: 180 }),
  },
  {
    code: "completionist",
    name_he: "משלים הכול",
    icon: "👑",
    points: 1000,
    tier: "legend",
    description: "אספת את כל התגים האחרים",
    measure: (id) => {
      const others = BADGES.filter((b) => b.code !== "completionist");
      const earned = count(
        `SELECT COUNT(*) c FROM user_badges WHERE user_id = ? AND badge_code IN (${others.map(() => "?").join(",")})`,
        [id, ...others.map((b) => b.code)],
      );
      return { label: "כל שאר התגים", progress: earned, target: others.length };
    },
  },
];

const BY_CODE = new Map(BADGES.map((b) => [b.code, b]));
export const badgeByCode = (code: string): BadgeDef | undefined => BY_CODE.get(code);

/**
 * מוודא שקטלוג התגים קיים בטבלה (זול: בדיקת ספירה אחת).
 * נקרא לפני כל שימוש — כך אין תלות בסדר הרצה של seed.
 */
export function ensureBadgeCatalog(): void {
  const existing = count("SELECT COUNT(*) c FROM badges");
  if (existing >= BADGES.length) return;
  for (const badge of BADGES) {
    run(
      `INSERT INTO badges(code, name_he, icon, points, rule_json) VALUES(?,?,?,?,?)
       ON CONFLICT(code) DO UPDATE SET name_he = excluded.name_he, icon = excluded.icon, points = excluded.points`,
      [badge.code, badge.name_he, badge.icon, badge.points, JSON.stringify({ tier: badge.tier, description: badge.description })],
    );
  }
}

/** רשימת התגים עם ההתקדמות של המשתמש */
export function badgeProgress(userId: number) {
  ensureBadgeCatalog();
  const earned = new Map(
    all<{ badge_code: string; earned_at: string }>(
      "SELECT badge_code, earned_at FROM user_badges WHERE user_id = ?",
      [userId],
    ).map((r) => [r.badge_code, r.earned_at]),
  );

  return BADGES.map((badge) => {
    const criterion = badge.measure(userId);
    return {
      code: badge.code,
      name: badge.name_he,
      icon: badge.icon,
      points: badge.points,
      tier: badge.tier,
      description: badge.description,
      criterion: { label: criterion.label, progress: criterion.progress, target: criterion.target },
      percent: criterion.target > 0 ? Math.min(100, Math.round((criterion.progress / criterion.target) * 100)) : 0,
      earned: earned.has(badge.code),
      earned_at: earned.get(badge.code) ?? null,
      /** תג שהוענק ידנית על ידי מנהל — לא נשלל */
      manual: badge.code === "completionist" ? false : (earned.get(badge.code) ?? "").startsWith("manual:") || false,
    };
  });
}

/** סך נקודות המשתמש */
export function userPoints(userId: number): number {
  ensureBadgeCatalog();
  return (
    get<{ p: number }>(
      `SELECT COALESCE(SUM(b.points),0) p
       FROM user_badges ub JOIN badges b ON b.code = ub.badge_code
       WHERE ub.user_id = ?`,
      [userId],
    )?.p ?? 0
  );
}

/**
 * מסנכרן את התגים של המשתמש מול הנתונים האמיתיים ומעניק את מה שמגיע לו.
 * בטוח לקרוא לו בכל בקשה — הוא אידמפוטנטי וזול (ספירות על אינדקסים).
 */
export function syncBadges(userId: number): { earned: string[]; points: number } {
  ensureBadgeCatalog();
  const already = new Set(
    all<{ badge_code: string }>("SELECT badge_code FROM user_badges WHERE user_id = ?", [userId]).map((r) => r.badge_code),
  );

  const newly: string[] = [];
  for (const badge of BADGES) {
    if (already.has(badge.code)) continue;
    let met = false;
    try {
      const criterion = badge.measure(userId);
      met = criterion.progress >= criterion.target && criterion.target > 0;
    } catch {
      met = false; // מדידה שנכשלה לא מפילה את הדף
    }
    if (met) {
      run("INSERT OR IGNORE INTO user_badges(user_id, badge_code) VALUES(?,?)", [userId, badge.code]);
      newly.push(badge.code);
    }
  }

  if (newly.length) {
    // התראה על כל תג חדש — כך המשתמש מגלה בלי לפתוח את העמוד
    for (const code of newly) {
      const badge = BY_CODE.get(code);
      if (!badge) continue;
      run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
        userId,
        "badge",
        `${badge.icon} הישג חדש: ${badge.name_he}`,
        `${badge.description} · ${badge.points} נקודות`,
        "/account/achievements",
      ]);
    }
  }

  // תג "completionist" נבדק אחרי כל השאר, כדי שיהיה מבוסס על התוצאה הסופית
  const completion = BY_CODE.get("completionist");
  if (completion && !newly.includes("completionist") && !already.has("completionist")) {
    const c = completion.measure(userId);
    if (c.progress >= c.target) {
      run("INSERT OR IGNORE INTO user_badges(user_id, badge_code) VALUES(?,?)", [userId, "completionist"]);
      newly.push("completionist");
      run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
        userId,
        "badge",
        "👑 הישג נדיר: משלים הכול",
        "אספת את כל התגים במערכת. אין עוד מה להוכיח.",
        "/account/achievements",
      ]);
    }
  }

  return { earned: newly, points: userPoints(userId) };
}

/** טבלת המצטיינים — לצורך חברתי ולגאווה */
export function leaderboard(limit = 20) {
  return all<{ user_id: number; name: string; avatar_url: string | null; points: number; badges: number }>(
    `SELECT u.id AS user_id, u.name, u.avatar_url,
            COALESCE(SUM(b.points),0) AS points, COUNT(ub.badge_code) AS badges
     FROM user_badges ub
     JOIN badges b ON b.code = ub.badge_code
     JOIN users u ON u.id = ub.user_id
     WHERE u.status = 'active' AND u.deleted_at IS NULL
     GROUP BY u.id
     ORDER BY points DESC, badges DESC
     LIMIT ?`,
    [limit],
  );
}

/** הדירוג של המשתמש עצמו בטבלה */
export function leaderboardRank(userId: number): number | null {
  const row = get<{ rank: number }>(
    `SELECT COUNT(*) + 1 AS rank FROM (
       SELECT SUM(b.points) AS pts FROM user_badges ub JOIN badges b ON b.code = ub.badge_code
       GROUP BY ub.user_id HAVING pts > (
         SELECT COALESCE(SUM(b2.points),0) FROM user_badges ub2 JOIN badges b2 ON b2.code = ub2.badge_code WHERE ub2.user_id = ?
       )
     )`,
    [userId],
  );
  const mine = userPoints(userId);
  return mine > 0 ? Number(row?.rank ?? 1) : null;
}
