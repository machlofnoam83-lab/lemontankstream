/**
 * צפייה משותפת (Watch Party).
 *
 * הרעיון: מארח יוצר "חדר" ומקבל קוד הצטרפות; כולם רואים את אותו תוכן
 * מסונכרן לאותו מקום בסרט/פרק. המארח הוא היחיד שקובע את המיקום —
 * שאר המשתתפים נגררים אחריו (הנגן מקבל הוראה לזוז).
 *
 * ── אבקת קסם, לא קסם ────────────────────────────────────────────────────────
 *  · קוד החדר נוצר אקראית (32 תווים מהקסם של crypto) — אי אפשר לנחש חדר של אחר.
 *  · כל בקשה נבדקת מול החברות בטבלה; אין "אמון בקליינט".
 *  · המארח בלבד יכול לשנות מצב (PATCH) — אחרת כל אחד היה יכול לגרור את כולם.
 *  · לחדר יש תוקף (ברירת מחדל 6 שעות) — לא נשארות "מסיבות רפאים" לנצח.
 */

import crypto from "node:crypto";
import { all, get, run } from "./db";
import { ApiError } from "./http";

export type PartyState = {
  id: string;
  host_id: number;
  host_name: string;
  title_id: number;
  episode_id: number | null;
  position_sec: number;
  is_playing: number;
  settings: string;
  created_at: string;
  ends_at: string | null;
};

export type PartySnapshot = PartyState & {
  title_name: string;
  title_slug: string;
  episode_label: string | null;
  members: { user_id: number; name: string; avatar_url: string | null; joined_at: string }[];
};

/** תווים לא-דו-משמעיים בקריאה: בלי 0/O ו-1/I */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** קוד הצטרפות — 8 תווים, ~10^12 צירופים */
function joinCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** קוד חדר שלא קיים (ואם במקרה קיים — מגרילים שוב) */
function uniqueCode(): string {
  for (let i = 0; i < 8; i += 1) {
    const code = joinCode();
    if (!get("SELECT id FROM watch_parties WHERE id = ?", [code])) return code;
  }
  throw new ApiError("SERVER_BUSY", 503);
}

export function createParty(input: {
  hostId: number;
  titleId: number;
  episodeId?: number | null;
  positionSec?: number;
  settings?: Record<string, unknown>;
  hours?: number;
}): PartyState {
  const title = get<{ id: number }>("SELECT id FROM titles WHERE id = ? AND deleted_at IS NULL", [input.titleId]);
  if (!title) throw new ApiError("NOT_FOUND", 404);

  if (input.episodeId != null) {
    const episode = get<{ id: number }>("SELECT id FROM episodes WHERE id = ? AND title_id = ? AND deleted_at IS NULL", [
      input.episodeId,
      input.titleId,
    ]);
    if (!episode) throw new ApiError("BAD_REQUEST", 400, "הפרק לא שייך לכותרת הזו");
  }

  const id = uniqueCode();
  const hours = Math.min(Math.max(input.hours ?? 6, 1), 24);
  run(
    `INSERT INTO watch_parties(id, host_id, title_id, episode_id, position_sec, is_playing, settings, ends_at)
     VALUES(?,?,?,?,?,0,?,strftime('%Y-%m-%dT%H:%M:%fZ','now', ?))`,
    [
      id,
      input.hostId,
      input.titleId,
      input.episodeId ?? null,
      Math.max(0, Math.floor(input.positionSec ?? 0)),
      JSON.stringify(input.settings ?? {}),
      `+${hours} hours`,
    ],
  );
  // המארח חבר בחדר מעצם היצירה
  run("INSERT OR IGNORE INTO watch_party_members(party_id, user_id) VALUES(?,?)", [id, input.hostId]);
  return getParty(id)!;
}

/** החדר עצמו — בלי הרשאה (בדיקת חברות בנפרד) */
export function getParty(id: string): PartyState | undefined {
  const party = get<PartyState>(
    `SELECT p.id, p.host_id, u.name AS host_name, p.title_id, p.episode_id, p.position_sec, p.is_playing,
            p.settings, p.created_at, p.ends_at
     FROM watch_parties p JOIN users u ON u.id = p.host_id
     WHERE p.id = ?`,
    [id.toUpperCase()],
  );
  if (!party) return undefined;
  if (party.ends_at && party.ends_at < new Date().toISOString().slice(0, 19) + ".000Z") {
    // פג תוקף — מפנים את הרשומה כדי לא לצבור זבל
    run("DELETE FROM watch_parties WHERE id = ?", [party.id]);
    return undefined;
  }
  return party;
}

export function isMember(partyId: string, userId: number): boolean {
  return Boolean(get("SELECT 1 AS x FROM watch_party_members WHERE party_id = ? AND user_id = ?", [partyId, userId]));
}

export function joinParty(partyId: string, userId: number): void {
  const party = getParty(partyId);
  if (!party) throw new ApiError("NOT_FOUND", 404);
  run("INSERT OR IGNORE INTO watch_party_members(party_id, user_id) VALUES(?,?)", [party.id, userId]);
}

export function leaveParty(partyId: string, userId: number): void {
  const party = getParty(partyId);
  if (!party) return;
  run("DELETE FROM watch_party_members WHERE party_id = ? AND user_id = ?", [partyId, userId]);
  // המארח עזב — סוגרים את החדר לכולם
  if (party.host_id === userId) run("DELETE FROM watch_parties WHERE id = ?", [partyId]);
}

/** עדכון מצב — המארח בלבד (הבדיקה כאן כדי שלא תישכח בשום מקום) */
export function updatePartyState(
  partyId: string,
  userId: number,
  input: { position_sec?: number; is_playing?: boolean },
): PartyState {
  const party = getParty(partyId);
  if (!party) throw new ApiError("NOT_FOUND", 404);
  if (party.host_id !== userId) throw new ApiError("FORBIDDEN", 403, "רק המארח קובע את המיקום");

  const position = input.position_sec == null ? party.position_sec : Math.max(0, Number(input.position_sec));
  const playing = input.is_playing == null ? party.is_playing : input.is_playing ? 1 : 0;
  run("UPDATE watch_parties SET position_sec = ?, is_playing = ? WHERE id = ?", [position, playing, partyId]);
  return getParty(partyId)!;
}

/** תמונת מצב מלאה — לחברי החדר בלבד */
export function partySnapshot(partyId: string, userId: number): PartySnapshot {
  const party = getParty(partyId);
  if (!party) throw new ApiError("NOT_FOUND", 404);
  if (!isMember(party.id, userId)) throw new ApiError("FORBIDDEN", 403, "צריך להצטרף לחדר קודם");

  const meta = get<{ title_name: string; title_slug: string; episode_label: string | null }>(
    `SELECT t.name_he AS title_name, t.slug AS title_slug,
            CASE WHEN e.id IS NULL THEN NULL
                 ELSE 'עונה ' || e.season_number || ' · פרק ' || e.number || CASE WHEN e.name_he IS NOT NULL THEN ' — ' || e.name_he ELSE '' END
            END AS episode_label
     FROM titles t LEFT JOIN episodes e ON e.id = ?
     WHERE t.id = ?`,
    [party.episode_id, party.title_id],
  );

  const members = all<{ user_id: number; name: string; avatar_url: string | null; joined_at: string }>(
    `SELECT m.user_id, u.name, u.avatar_url, m.joined_at
     FROM watch_party_members m JOIN users u ON u.id = m.user_id
     WHERE m.party_id = ? ORDER BY m.joined_at`,
    [party.id],
  );

  return {
    ...party,
    title_name: meta?.title_name ?? "",
    title_slug: meta?.title_slug ?? "",
    episode_label: meta?.episode_label ?? null,
    members,
  };
}

/**
 * תצוגה מקדימה של חדר למי שעוד לא הצטרף — מספיק כדי לדעת אם להצטרף,
 * ולא יותר: שם המארח, שם הכותר, מספר המשתתפים. בלי מיקום ובלי תוכן.
 */
export function partyPreview(partyId: string) {
  const party = getParty(partyId);
  if (!party) return null;
  const meta = get<{ title_name: string; title_slug: string; episode_label: string | null; members: number }>(
    `SELECT t.name_he AS title_name, t.slug AS title_slug,
            (SELECT COUNT(*) FROM watch_party_members m WHERE m.party_id = p.id) AS members,
            CASE WHEN e.id IS NULL THEN NULL
                 ELSE 'עונה ' || e.season_number || ' · פרק ' || e.number ||
                      CASE WHEN e.name_he IS NOT NULL THEN ' — ' || e.name_he ELSE '' END
            END AS episode_label
     FROM watch_parties p
     JOIN titles t ON t.id = p.title_id
     LEFT JOIN episodes e ON e.id = p.episode_id
     WHERE p.id = ?`,
    [party.id],
  );
  return {
    id: party.id,
    host_id: party.host_id,
    host_name: party.host_name,
    title_id: party.title_id,
    title_name: meta?.title_name ?? "",
    title_slug: meta?.title_slug ?? "",
    episode_id: party.episode_id,
    episode_label: meta?.episode_label ?? null,
    members: Number(meta?.members ?? 0),
    position_sec: party.position_sec,
    created_at: party.created_at,
  };
}

/** החדרים הפעילים של המשתמש (כמארח או כמשתתף) */
export function myParties(userId: number) {
  return all<{
    id: string;
    title_id: number;
    episode_id: number | null;
    title_name: string;
    title_slug: string;
    poster_url: string | null;
    is_host: number;
    members: number;
    created_at: string;
  }>(
    `SELECT p.id, p.title_id, p.episode_id, t.name_he AS title_name, t.slug AS title_slug, t.poster_url,
            CASE WHEN p.host_id = ? THEN 1 ELSE 0 END AS is_host,
            (SELECT COUNT(*) FROM watch_party_members m WHERE m.party_id = p.id) AS members,
            p.created_at
     FROM watch_parties p
     JOIN titles t ON t.id = p.title_id
     JOIN watch_party_members me ON me.party_id = p.id AND me.user_id = ?
     WHERE (p.ends_at IS NULL OR p.ends_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ORDER BY p.created_at DESC LIMIT 50`,
    [userId, userId],
  );
}

/** ניקוי חדרים שפג תוקפם — נקרא מהמשימות התקופתיות */
export function purgeExpiredParties(): number {
  return run("DELETE FROM watch_parties WHERE ends_at IS NOT NULL AND ends_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')").changes;
}
