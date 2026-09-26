/**
 * בקשות תוכן — "בקשו כותר".
 *
 * המשתמשים מבקשים סרט או סדרה שלא קיימים בקטלוג, אחרים מחזקים בקשות
 * (קול אחד למשתמש), והאדמין רואה את הבקשות המבוקשות ביותר ומסמן מה נוסף.
 *
 * ─ כללים ────────────────────────────────────────────────────────────────────
 *  · שם הבקשה מנורמל לצורך זיהוי כפילות (lowercase, בלי רווחים כפולים).
 *  · בקשה כפולה מאותו משתמש מוחזרת כמו שהיא — בלי לפתוח שורה חדשה.
 *  · הצבעה היא טוגל: לחיצה שנייה מסירה את הקול.
 *  · כשאדמין מסמן "נוסף", כל המצביעים מקבלים התראה בתוך האתר.
 */

import { all, count, get, run } from "./db";
import { ApiError } from "./http";

export type TitleRequest = {
  id: number;
  user_id: number | null;
  name: string;
  kind: string;
  year: number | null;
  note: string | null;
  status: string;
  admin_note: string | null;
  title_id: number | null;
  created_at: string;
};

const MAX_OPEN_PER_USER = 20;
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export function createRequest(input: {
  userId: number;
  name: string;
  kind?: "movie" | "series" | "any";
  year?: number | null;
  note?: string | null;
}): TitleRequest {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 2) throw new ApiError("BAD_REQUEST", 400, undefined, "שם הבקשה קצר מדי");

  const year = input.year ? Number(input.year) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1888 || year > 2100)) {
    throw new ApiError("BAD_REQUEST", 400, undefined, "שנה לא תקינה");
  }

  // כבר קיים בקטלוג? אין טעם לבקש
  const existingTitle = get<{ id: number; name_he: string }>(
    "SELECT id, name_he FROM titles WHERE lower(trim(name_he)) = ? AND deleted_at IS NULL LIMIT 1",
    [normalize(name)],
  );
  if (existingTitle) {
    throw new ApiError("ALREADY_EXISTS", 409, undefined, `"${existingTitle.name_he}" כבר נמצא בקטלוג`);
  }

  const dupe = get<TitleRequest>("SELECT * FROM title_requests WHERE user_id = ? AND lower(trim(name)) = ? AND status = 'open'", [
    input.userId,
    normalize(name),
  ]);
  if (dupe) return dupe;

  const open = count("SELECT COUNT(*) c FROM title_requests WHERE user_id = ? AND status = 'open'", [input.userId]);
  if (open >= MAX_OPEN_PER_USER) {
    throw new ApiError("LIMIT_REACHED", 400, undefined, `יש לך ${MAX_OPEN_PER_USER} בקשות פתוחות — נחכה לאלה שקיימות`);
  }

  run("INSERT INTO title_requests(user_id, name, kind, year, note) VALUES(?,?,?,?,?)", [
    input.userId,
    name,
    input.kind ?? "any",
    year,
    input.note?.trim().slice(0, 300) ?? null,
  ]);
  const id = Number(get<{ id: number }>("SELECT last_insert_rowid() id")?.id ?? 0);
  return get<TitleRequest>("SELECT * FROM title_requests WHERE id = ?", [id])!;
}

/** הבקשות המבוקשות — עם מספר קולות והאם הצבעתי */
export function listRequests(opts: { userId?: number | null; status?: string; limit?: number } = {}) {
  const status = opts.status ?? "open";
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = all<TitleRequest & { votes: number; requester: string | null; voted: number }>(
    `SELECT r.*,
            (SELECT COUNT(*) FROM title_request_votes v WHERE v.request_id = r.id) AS votes,
            u.name AS requester,
            CASE WHEN EXISTS (SELECT 1 FROM title_request_votes v WHERE v.request_id = r.id AND v.user_id = ?) THEN 1 ELSE 0 END AS voted
     FROM title_requests r LEFT JOIN users u ON u.id = r.user_id
     WHERE (? = 'all' OR r.status = ?)
     ORDER BY votes DESC, r.created_at ASC LIMIT ?`,
    [opts.userId ?? 0, status, status, limit],
  );
  return rows;
}

export function requestById(id: number): TitleRequest | undefined {
  return get<TitleRequest>("SELECT * FROM title_requests WHERE id = ?", [id]);
}

/** טוגל הצבעה — מחזיר את מצב ההצבעה החדש */
export function toggleVote(userId: number, requestId: number): { voted: boolean; votes: number } {
  const request = requestById(requestId);
  if (!request) throw new ApiError("NOT_FOUND", 404, undefined, "הבקשה לא נמצאה");
  if (request.status !== "open") throw new ApiError("BAD_REQUEST", 400, undefined, "הבקשה כבר טופלה");

  const existing = get<{ user_id: number }>(
    "SELECT user_id FROM title_request_votes WHERE request_id = ? AND user_id = ?",
    [requestId, userId],
  );
  if (existing) run("DELETE FROM title_request_votes WHERE request_id = ? AND user_id = ?", [requestId, userId]);
  else run("INSERT INTO title_request_votes(request_id, user_id) VALUES(?,?)", [requestId, userId]);

  return {
    voted: !existing,
    votes: count("SELECT COUNT(*) c FROM title_request_votes WHERE request_id = ?", [requestId]),
  };
}

/** סימון בקשה כטופלה (אדמין) — "נוסף" מתריע לכל המצביעים */
export function resolveRequest(input: {
  id: number;
  status: "planned" | "added" | "declined" | "open";
  adminNote?: string | null;
  titleId?: number | null;
  adminId: number;
}): TitleRequest {
  const request = requestById(input.id);
  if (!request) throw new ApiError("NOT_FOUND", 404, undefined, "הבקשה לא נמצאה");

  run(
    `UPDATE title_requests SET status = ?, admin_note = ?, title_id = ?, handled_by = ?, handled_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
    [input.status, input.adminNote?.slice(0, 300) ?? null, input.titleId ?? null, input.adminId, input.id],
  );

  if (input.status === "added") {
    const voters = all<{ user_id: number }>("SELECT user_id FROM title_request_votes WHERE request_id = ?", [input.id]);
    const link = input.titleId ? get<{ slug: string; name_he: string }>("SELECT slug, name_he FROM titles WHERE id = ?", [input.titleId]) : null;
    const message = link ? `🎉 ${link.name_he} שביקשתם נוסף לספרייה!` : `🎉 "${request.name}" שביקשתם נוסף לספרייה!`;
    for (const voter of [request.user_id, ...voters.map((v) => v.user_id)].filter((id): id is number => Boolean(id))) {
      run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
        voter,
        "system",
        "בקשתך אושרה",
        message,
        link ? `/title/${link.slug}` : "/requests",
      ]);
    }
  }
  return requestById(input.id)!;
}

/** סטטיסטיקות לאדמין */
export const requestStats = () => ({
  open: count("SELECT COUNT(*) c FROM title_requests WHERE status = 'open'"),
  planned: count("SELECT COUNT(*) c FROM title_requests WHERE status = 'planned'"),
  added: count("SELECT COUNT(*) c FROM title_requests WHERE status = 'added'"),
  declined: count("SELECT COUNT(*) c FROM title_requests WHERE status = 'declined'"),
  votes: count("SELECT COUNT(*) c FROM title_request_votes"),
});
