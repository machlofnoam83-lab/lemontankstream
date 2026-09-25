/**
 * פרופילים פעילים ומצב ילדים.
 *
 * ─ המודל (כמו בשירותי הסטרימינג הגדולים) ─────────────────────────────────────
 *  · כל בן בית הוא פרופיל: שם, אווטאר, שפה, והעדפות ניגון משלו.
 *  · "מי צופה?" — בחירת פרופיל ששומרת את הבחירה על הסשן (sessions.profile_id).
 *  · פרופיל ילדים מוגבל לגיל: **הסינון נעשה בשרת** בכל שאילתת קטלוג,
 *    ולכן אי אפשר לעקוף אותו מהדפדפן (לא מסתמכים על הסתרה ב-CSS).
 *  · מעבר לפרופיל שמוגן ב-PIN דורש את ה-PIN — כך ילד לא נכנס לפרופיל המבוגרים.
 *    יציאה מפרופיל ילדים (חזרה למבוגרים) דורשת PIN גם היא — כדי שאפשר יהיה
 *    להשאיר את המכשיר לילד בלי לחשוש.
 */

import crypto from "node:crypto";
import { all, get, run } from "./db";
import { ApiError } from "./http";
import { verifyPassword } from "./crypto";

export type Profile = {
  id: number;
  user_id: number;
  name: string;
  avatar_url: string | null;
  color: string;
  is_kid: number;
  maturity_limit: string;
  autoplay: number;
  autoplay_next: number;
  lang_audio: string;
  lang_subs: string;
  sort_order: number;
  has_pin: number;
};

const PROFILE_COLUMNS = `id, user_id, name, avatar_url, color, is_kid, maturity_limit, autoplay, autoplay_next,
                         lang_audio, lang_subs, sort_order, (pin_hash IS NOT NULL) AS has_pin`;

export const listProfiles = (userId: number): Profile[] =>
  all<Profile>(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE user_id = ? ORDER BY sort_order, id`, [userId]);

export const getProfile = (id: number): Profile | undefined =>
  get<Profile>(`SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id = ?`, [id]);

/** כמה פרופילים מותר לפי המסלול */
export const maxProfilesFor = (plan: "free" | "plus"): number => (plan === "plus" ? 5 : 2);

/**
 * הפרופיל הפעיל של המשתמש.
 * אין פרופיל מסומן? מחזירים את הראשון — כדי שתמיד יהיה "מי צופה" תקף.
 */
export function activeProfile(userId: number, sessionProfileId: number | null): Profile | null {
  const profiles = listProfiles(userId);
  if (!profiles.length) return null;
  const chosen = sessionProfileId != null ? profiles.find((p) => p.id === sessionProfileId) : undefined;
  return chosen ?? profiles[0];
}

/** מגבלת הגיל שמופעלת בקטלוג (undefined = בלי הגבלה) */
export function maturityCeiling(profile: Profile | null | undefined): string | undefined {
  if (!profile) return undefined;
  return profile.is_kid ? profile.maturity_limit || "7+" : undefined;
}

/** האם המשתמש צריך קוד כדי לצאת מהפרופיל הזה */
export function exitRequiresPin(profile: Profile | null | undefined): boolean {
  return Boolean(profile && (profile.is_kid || profile.has_pin));
}

/**
 * האם המעבר הזה דורש קוד — ולמה.
 * משמש גם לאכיפה (switchProfile) וגם להגבלת קצב מדויקת בבקשה (רק ניסויי PIN נספרים בדלי הקשיח).
 */
export function pinRequirement(
  userId: number,
  currentProfileId: number | null,
  targetId: number,
): { required: boolean; reason: "target_locked" | "kid_exit" | null; target: Profile | null } {
  const target = getProfile(targetId);
  if (!target || target.user_id !== userId) return { required: false, reason: null, target: null };
  const current = activeProfile(userId, currentProfileId);
  const needsPinForTarget = target.has_pin === 1;
  const needsPinToLeave = exitRequiresPin(current) && current?.id !== target.id;
  return {
    required: needsPinForTarget || needsPinToLeave,
    reason: needsPinForTarget ? "target_locked" : needsPinToLeave ? "kid_exit" : null,
    target,
  };
}

/**
 * מעבר פרופיל.
 *  · PIN נדרש כשהפרופיל המוגן ב-PIN, או כשיוצאים מפרופיל ילדים.
 *  · ניסיונות כושלים נספרים אצל הקורא (rate limit) — כאן רק הבדיקה.
 */
export async function switchProfile(input: {
  userId: number;
  currentProfileId: number | null;
  targetId: number;
  pin?: string;
  skipPin?: boolean;
}): Promise<Profile> {
  const target = getProfile(input.targetId);
  if (!target || target.user_id !== input.userId) throw new ApiError("NOT_FOUND", 404, undefined, "הפרופיל לא נמצא");

  const current = activeProfile(input.userId, input.currentProfileId);
  const needsPinForTarget = target.has_pin === 1;
  const needsPinToLeave = exitRequiresPin(current) && current?.id !== target.id;

  if (!input.skipPin && (needsPinForTarget || needsPinToLeave)) {
    const pin = String(input.pin ?? "");
    if (!/^\d{4}$/.test(pin)) {
      throw new ApiError("PIN_REQUIRED", 401, { reason: needsPinForTarget ? "target_locked" : "kid_exit" }, "נדרש קוד בן 4 ספרות");
    }
    const row = get<{ pin_hash: string | null }>("SELECT pin_hash FROM profiles WHERE id = ?", [target.id]);
    const owner = needsPinToLeave && !needsPinForTarget ? get<{ pin_hash: string | null }>(
      "SELECT pin_hash FROM profiles WHERE id = ?",
      [current!.id],
    ) : row;
    const hash = owner?.pin_hash ?? row?.pin_hash;
    // חתימת הפונקציה: verifyPassword(hash_שמור, סיסמה) — לא להחליף סדר!
    const ok = hash ? await verifyPassword(hash, pin) : false;
    if (!ok) throw new ApiError("PIN_INVALID", 401, undefined, "קוד שגוי");
  }

  return target;
}

/** שמירת הבחירה על הסשן */
export function setSessionProfile(sessionId: string, profileId: number | null): void {
  run("UPDATE sessions SET profile_id = ? WHERE id = ?", [profileId, sessionId]);
}

/** קוד שיתוף לרשימה — אקראי, בלי לזהות את הבעלים */
export const newShareCode = (): string => crypto.randomBytes(6).toString("hex");

/** העדפות ניגון של הפרופיל (שפה, אוטופליי) */
export function playbackPrefs(profile: Profile | null) {
  return {
    langAudio: profile?.lang_audio ?? "he",
    langSubs: profile?.lang_subs ?? "he",
    autoplay: profile ? profile.autoplay === 1 : true,
    autoplayNext: profile ? profile.autoplay_next === 1 : true,
  };
}
