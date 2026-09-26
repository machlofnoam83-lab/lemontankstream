/**
 * הגבלת קצב (Rate limiting) ו-Brute-force protection.
 *
 * מימוש: חלון זמן קבוע בטבלת `rate_limits` ב-SQLite (אטומי דרך UPSERT),
 * ללא תלות בשירות חיצוני. מאפשר גם חסימה פר-IP וגם פר-משתמש/פר-פעולה.
 */

import { all, get, run, tx } from "./db";
import { clientIp } from "./http";
import { logSecurityEvent } from "./audit";

export type RateRule = { limit: number; windowSec: number; name: string };

/** חוקי ברירת מחדל לכל שכבת API — ניתנים לכוונון */
export const RATE_RULES = {
  // כל בקשות ההתחברות (כולל השלמת 2FA, שהיא בקשה נוספת לכל התחברות).
  // הדלי הזה נדיב בכוונה: משפחה שלמה מאחורי NAT אחד לא אמורה להיחסם.
  login: { name: "login", limit: 30, windowSec: 300 },
  // **כשלי התחברות בלבד** — זה מה שעוצר brute-force באמת. התחברות מוצלחת
  // לא שורפת מכסה, כך שאין חסימה עצמית של משתמשים לגיטימיים.
  loginFailure: { name: "login_failure", limit: 8, windowSec: 300 },
  // מעבר פרופיל רגיל (בלי קוד) — דלי נדיב, כדי שהחלפות במשפחה לא ייחסמו
  profileSwitch: { name: "profile_switch", limit: 40, windowSec: 300 },
  // ניסויי קוד (PIN) — דלי קשיח במיוחד: 8 ניסיונות ל-5 דק' לאותו משתמש.
  // זה מה שמגן מפני ניחוש PIN בן 4 ספרות, בלי לפגוע במעברים רגילים.
  pinAttempt: { name: "pin_attempt", limit: 8, windowSec: 300 },
  register: { name: "register", limit: 5, windowSec: 3600 },
  passwordReset: { name: "password_reset", limit: 5, windowSec: 3600 },
  api: { name: "api", limit: 240, windowSec: 60 },
  search: { name: "search", limit: 60, windowSec: 60 },
  upload: { name: "upload", limit: 40, windowSec: 3600 },
  write: { name: "write", limit: 120, windowSec: 60 },
  comment: { name: "comment", limit: 12, windowSec: 600 },
  progress: { name: "progress", limit: 600, windowSec: 60 },
  streamStart: { name: "stream_start", limit: 120, windowSec: 60 },
  // מדד חוזק סיסמה: נדיב מספיק להקלדה, צר מספיק כדי שלא ישמש לבדיקת
  // סיסמאות בכמות — כל בקשה עולה לשרת בדיקת Hash וקריאת רשת.
  passwordCheck: { name: "password_check", limit: 30, windowSec: 60 },
} as const satisfies Record<string, RateRule>;

export type RateRuleName = keyof typeof RATE_RULES;

export type RateResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetInSec: number;
};

function windowStart(windowSec: number): string {
  const ms = windowSec * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString();
}

/**
 * צריכת מכסה. מזהה הבאקט = פעולה + מפתח (IP / user id).
 * @returns מידע האם הבקשה מותרת וכמה נשאר.
 */
export function consumeRateLimit(rule: RateRule, key: string): RateResult {
  const bucket = `${rule.name}:${key}`.slice(0, 200);
  const start = windowStart(rule.windowSec);
  const resetInSec = Math.ceil((new Date(start).getTime() + rule.windowSec * 1000 - Date.now()) / 1000);

  const hits = tx(() => {
    run(
      `INSERT INTO rate_limits(bucket, window_start, hits) VALUES(?,?,1)
       ON CONFLICT(bucket, window_start) DO UPDATE SET hits = hits + 1`,
      [bucket, start],
    );
    const row = get<{ hits: number }>("SELECT hits FROM rate_limits WHERE bucket=? AND window_start=?", [bucket, start]);
    return Number(row?.hits ?? 1);
  });

  const allowed = hits <= rule.limit;
  return { allowed, remaining: Math.max(0, rule.limit - hits), limit: rule.limit, resetInSec };
}

/**
 * קריאה בלבד של מצב המכסה (בלי לצרוך).
 * שימושי כשצריך לחסום לפני ניסיון אבל לספור רק כישלונות — למשל ניסויי PIN.
 */
export function peekRateLimit(rule: RateRule, key: string): RateResult {
  const bucket = `${rule.name}:${key}`.slice(0, 200);
  const start = windowStart(rule.windowSec);
  const resetInSec = Math.ceil((new Date(start).getTime() + rule.windowSec * 1000 - Date.now()) / 1000);
  const row = get<{ hits: number }>("SELECT hits FROM rate_limits WHERE bucket=? AND window_start=?", [bucket, start]);
  const hits = Number(row?.hits ?? 0);
  return { allowed: hits < rule.limit, remaining: Math.max(0, rule.limit - hits), limit: rule.limit, resetInSec };
}

/** רישום כישלון (בלי לחסום) — משלים ל-peekRateLimit */
export function recordFailure(rule: RateRule, key: string): RateResult {
  const result = consumeRateLimit(rule, key);
  return { ...result, allowed: result.remaining > 0 };
}

/** בודק מגבלה ל-IP של הבקשה; רושם אירוע אבטחה אוטומטית בחריגה */
export async function checkRateLimit(
  req: Request,
  ruleName: RateRuleName,
  extraKey?: string,
): Promise<RateResult & { key: string }> {
  const rule = RATE_RULES[ruleName];
  const ip = clientIp(req);
  const key = extraKey ? `${ip}|${extraKey}` : ip;
  const result = consumeRateLimit(rule, key);
  if (!result.allowed) {
    await logSecurityEvent({
      kind: "rate_limit_exceeded",
      severity: "warning",
      ip,
      detail: `rule=${rule.name} key=${extraKey ? "ip+id" : "ip"}`,
    });
  }
  return { ...result, key };
}

/** ניקוי חלונות ישנים — נקרא מדי פעם (cron / אחרי בקשות כבדות) */
export function pruneRateLimits(maxAgeHours = 48): number {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
  return run("DELETE FROM rate_limits WHERE window_start < ?", [cutoff]).changes;
}

/**
 * נעילה הדרגתית של חשבון אחרי ניסיונות כושלים (עמידה מול brute-force).
 * מחזיר את זמן הנעילה בשניות (0 = לא נעול).
 */
export function lockoutSeconds(failedLogins: number): number {
  if (failedLogins < 5) return 0;
  if (failedLogins < 8) return 60;          // דקה
  if (failedLogins < 12) return 300;        // 5 דק'
  if (failedLogins < 20) return 1800;       // חצי שעה
  return 7200;                              // שעתיים
}

/** דוח מצב נוכחי של מזהים חשודים (לפאנל האבטחה של האדמין) */
export function topOffenders(limit = 20) {
  return all<{ ip: string; hits: number; bucket: string }>(
    `SELECT ip, COUNT(*) AS hits, GROUP_CONCAT(DISTINCT kind) AS bucket
     FROM security_events
     WHERE created_at > datetime('now','-1 day')
     GROUP BY ip ORDER BY hits DESC LIMIT ?`,
    [limit],
  );
}
