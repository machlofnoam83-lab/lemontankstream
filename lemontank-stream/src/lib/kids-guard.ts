/**
 * אכיפת מצב ילדים על הקטלוג.
 *
 * העיקרון: הסינון נעשה **בשרת** — כל דף וכל API שקוראים קטלוג עוברים כאן.
 * ילד לא יכול לעקוף את זה מהדפדפן, כי הנתונים פשוט לא נשלחים מלכתחילה.
 */

import { get } from "./db";
import { activeProfile, maturityCeiling, type Profile } from "./profiles";

/** הפרופיל הפעיל לפי הסשן (עובד גם מ-Route Handlers וגם מ-Server Components) */
export function currentProfile(userId: number | null | undefined, sessionId: string | null): Profile | null {
  if (!userId) return null;
  const session = sessionId ? get<{ profile_id: number | null }>("SELECT profile_id FROM sessions WHERE id = ?", [sessionId]) : undefined;
  return activeProfile(userId, session?.profile_id ?? null);
}

/** מגבלת הגיל שתופעל בקטלוג עבור המשתמש הזה */
export function ceilingFor(userId: number | null | undefined, sessionId: string | null): string | undefined {
  return maturityCeiling(currentProfile(userId, sessionId));
}

/** האם המשתמש המחובר צופה כרגע בפרופיל ילדים */
export function isKidSession(userId: number | null | undefined, sessionId: string | null): boolean {
  return Boolean(currentProfile(userId, sessionId)?.is_kid);
}

/**
 * פילטר גיל שהקטלוג מקבל.
 * מחזיר undefined כשאין הגבלה — כדי שכל שאילתה תישאר כמו שהייתה.
 */
export const maturityFilter = ceilingFor;
