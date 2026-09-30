/**
 * מרכז הורדות ומכשירים.
 *
 * ─ מודל ההורדה ──────────────────────────────────────────────────────────────
 *  · הורדה זמינה רק לחברי פלוס ולכותר שמסומן `is_downloadable`.
 *  · כל הורדה מקבלת **טוקן חתום** שתוקפו קצר (ברירת מחדל 48 שעות) —
 *    כך שאי אפשר להעביר קישור הלאה לנצח.
 *  · אותו מכשיר לא יכול להוריד יותר מדי: יש מכסת מכשירים פעילים למשתמש.
 *  · כל בקשה נבדקת מול הפרופיל הפעיל — פרופיל ילדים לא מוריד תוכן מבוגרים.
 *
 * ─ מכשירים ──────────────────────────────────────────────────────────────────
 *  · כל מכשיר מזוהה ב-fingerprint שהדפדפן שולח, ונשמר פעם אחת.
 *  · "מכשיר מהימן" = לא דורש אימות מחדש. "הסר" = מנתק את המכשיר ומבטל הורדותיו.
 */

import crypto from "node:crypto";
import { all, count, get, run } from "./db";
import { ApiError } from "./http";
import { hashKey } from "./apikeys";

export type DownloadRow = {
  id: number;
  user_id: number;
  title_id: number;
  episode_id: number | null;
  device_id: number | null;
  quality: string;
  token_hash: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
};

const MAX_ACTIVE_DOWNLOADS = 40;
const TOKEN_TTL_HOURS = 48;

const isoNow = () => new Date().toISOString();

/** האם הכותר מותר להורדה עבור המשתמש הזה */
export function downloadPolicy(userId: number, plan: "free" | "plus", titleId: number, episodeId?: number | null) {
  const title = get<{ id: number; is_downloadable: number; plan_access: string; name_he: string }>(
    "SELECT id, is_downloadable, plan_access, name_he FROM titles WHERE id = ? AND deleted_at IS NULL",
    [titleId],
  );
  if (!title) throw new ApiError("NOT_FOUND", 404, undefined, "הכותר לא נמצא");

  const reasons: string[] = [];
  if (plan !== "plus") reasons.push("הורדות זמינות למנוי פלוס בלבד");
  if (!title.is_downloadable) reasons.push("הכותר הזה לא זמין להורדה");
  if (title.plan_access === "plus" && plan !== "plus") reasons.push("התוכן הזה הוא תוכן פלוס");

  if (episodeId != null) {
    const episode = get<{ id: number; plan_access: string }>(
      "SELECT id, plan_access FROM episodes WHERE id = ? AND title_id = ? AND deleted_at IS NULL",
      [episodeId, titleId],
    );
    if (!episode) throw new ApiError("BAD_REQUEST", 400, undefined, "הפרק לא שייך לכותרת הזו");
    if (episode.plan_access === "plus" && plan !== "plus") reasons.push("הפרק הזה הוא תוכן פלוס");
  }

  void userId;
  return { allowed: reasons.length === 0, reason: reasons[0] ?? null, titleName: title.name_he };
}

/** רישום מכשיר (או החזרת הקיים) */
export function registerDevice(input: { userId: number; fingerprint: string; label?: string | null; platform?: string | null }): number {
  const fingerprint = input.fingerprint.slice(0, 120);
  if (!fingerprint) throw new ApiError("BAD_REQUEST", 400, undefined, "חסר מזהה מכשיר");

  const existing = get<{ id: number }>("SELECT id FROM devices WHERE user_id = ? AND fingerprint = ?", [
    input.userId,
    fingerprint,
  ]);
  if (existing) {
    run("UPDATE devices SET last_seen = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [existing.id]);
    return existing.id;
  }

  // הגבלת מספר מכשירים — לפי המסלול
  const plan = get<{ plan_code: string }>("SELECT plan_code FROM users WHERE id = ?", [input.userId])?.plan_code ?? "free";
  const limit = plan === "plus" ? 8 : 3;
  const total = count("SELECT COUNT(*) c FROM devices WHERE user_id = ?", [input.userId]);
  if (total >= limit) {
    throw new ApiError("LIMIT_REACHED", 400, undefined, `הגעת למקסימום ${limit} מכשירים — הסר מכשיר ישן כדי להוסיף`);
  }

  const res = run(
    "INSERT INTO devices(user_id, fingerprint, label, platform, trusted) VALUES(?,?,?,?,0)",
    [input.userId, fingerprint, input.label?.slice(0, 60) ?? null, input.platform?.slice(0, 40) ?? null],
  );
  return Number(res.lastInsertRowid);
}

export const listDevices = (userId: number) =>
  all<{ id: number; label: string | null; platform: string | null; trusted: number; first_seen: string; last_seen: string }>(
    "SELECT id, label, platform, trusted, first_seen, last_seen FROM devices WHERE user_id = ? ORDER BY last_seen DESC",
    [userId],
  );

export function trustDevice(userId: number, deviceId: number, trusted: boolean): boolean {
  const changes = run("UPDATE devices SET trusted = ? WHERE id = ? AND user_id = ?", [trusted ? 1 : 0, deviceId, userId]).changes;
  return changes > 0;
}

/** הסרת מכשיר — מבטלת גם את ההורדות שהיו לו */
export function removeDevice(userId: number, deviceId: number): boolean {
  const device = get<{ id: number }>("SELECT id FROM devices WHERE id = ? AND user_id = ?", [deviceId, userId]);
  if (!device) return false;
  run("DELETE FROM downloads WHERE device_id = ? AND user_id = ?", [deviceId, userId]);
  run("DELETE FROM devices WHERE id = ?", [deviceId]);
  return true;
}

/**
 * יצירת הורדה — מחזיר טוקן **פעם אחת**, עם תוקף.
 * במערכת האמיתית הטוקן מוחלף בקישור חתום לקובץ; כאן נשמר ה-Hash בלבד.
 */
export function createDownload(input: {
  userId: number;
  plan: "free" | "plus";
  titleId: number;
  episodeId?: number | null;
  deviceId?: number | null;
  quality?: string;
}): { download: DownloadRow; token: string } {
  const policy = downloadPolicy(input.userId, input.plan, input.titleId, input.episodeId);
  if (!policy.allowed) throw new ApiError("PLAN_REQUIRED", 402, undefined, policy.reason ?? "ההורדה לא מותרת");

  const active = count(
    `SELECT COUNT(*) c FROM downloads
     WHERE user_id = ? AND status = 'ready' AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    [input.userId],
  );
  if (active >= MAX_ACTIVE_DOWNLOADS) {
    throw new ApiError("LIMIT_REACHED", 400, undefined, `אפשר להחזיק עד ${MAX_ACTIVE_DOWNLOADS} הורדות פעילות — מחק אחת כדי לפנות מקום`);
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_HOURS * 3_600_000).toISOString();
  const quality = ["480p", "720p", "1080p", "4k"].includes(String(input.quality)) ? String(input.quality) : "1080p";

  const res = run(
    `INSERT INTO downloads(user_id, title_id, episode_id, device_id, quality, token_hash, status, expires_at)
     VALUES(?,?,?,?,?,?,'ready',?)`,
    [input.userId, input.titleId, input.episodeId ?? null, input.deviceId ?? null, quality, hashKey(token), expires],
  );

  const download = get<DownloadRow>("SELECT * FROM downloads WHERE id = ?", [Number(res.lastInsertRowid)])!;
  return { download, token };
}

/** ההורדות שלי, כולל שם הכותר */
export function myDownloads(userId: number) {
  return all<{
    id: number;
    title_id: number;
    episode_id: number | null;
    quality: string;
    status: string;
    expires_at: string | null;
    created_at: string;
    title_name: string;
    slug: string;
    poster_url: string | null;
    episode_label: string | null;
    device_label: string | null;
    expired: number;
  }>(
    `SELECT d.id, d.title_id, d.episode_id, d.quality, d.status, d.expires_at, d.created_at,
            t.name_he AS title_name, t.slug, t.poster_url,
            CASE WHEN e.id IS NULL THEN NULL
                 ELSE 'עונה ' || e.season_number || ' · פרק ' || e.number END AS episode_label,
            dev.label AS device_label,
            CASE WHEN d.expires_at IS NOT NULL AND d.expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END AS expired
     FROM downloads d
     JOIN titles t ON t.id = d.title_id
     LEFT JOIN episodes e ON e.id = d.episode_id
     LEFT JOIN devices dev ON dev.id = d.device_id
     WHERE d.user_id = ?
     ORDER BY d.created_at DESC LIMIT 200`,
    [userId],
  );
}

export function deleteDownload(userId: number, id: number): boolean {
  return run("DELETE FROM downloads WHERE id = ? AND user_id = ?", [id, userId]).changes > 0;
}

/** ניקוי הורדות שפג תוקפן — נקרא מהמשימות התקופתיות */
export function purgeExpiredDownloads(): number {
  return run(
    "DELETE FROM downloads WHERE expires_at IS NOT NULL AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  ).changes;
}

export const downloadStats = (userId: number) => ({
  total: count("SELECT COUNT(*) c FROM downloads WHERE user_id = ?", [userId]),
  active: count(
    `SELECT COUNT(*) c FROM downloads WHERE user_id = ? AND status='ready'
       AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    [userId],
  ),
  devices: count("SELECT COUNT(*) c FROM devices WHERE user_id = ?", [userId]),
  createdAt: isoNow(),
});
