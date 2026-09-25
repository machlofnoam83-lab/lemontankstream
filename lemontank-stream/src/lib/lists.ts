/**
 * רשימות מותאמות אישית — "האוסף שלי".
 *
 * שונה מ"הרשימה שלי" (watchlist): זו רשימה **עם שם ותיאור**, שאפשר לסדר,
 * לכתוב בה הערה לכל כותר, ולשתף בקישור בלי לחשוף את החשבון.
 *
 * ─ כללים ────────────────────────────────────────────────────────────────────
 *  · slug ייחודי למשתמש (לא גלובלי) — שני משתמשים יכולים שיהיה להם "לסופש".
 *  · שיתוף: share_code אקראי. קישור ציבורי חושף **רק** את הרשימה —
 *    לא את המייל, לא את המזהה, ולא את שאר הרשימות.
 *  · רשימה פרטית לא נגישה בקישור גם אם מנוחשים את הקוד (קוד לא קיים).
 */

import crypto from "node:crypto";
import { all, count, get, run } from "./db";
import { ApiError } from "./http";
import { slugify } from "./validate";

export type UserList = {
  id: number;
  user_id: number;
  name: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
  is_public: number;
  share_code: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const LIST_COLUMNS = `id, user_id, name, slug, description, cover_url, is_public, share_code, sort_order, created_at, updated_at`;
const MAX_LISTS = 30;
const MAX_ITEMS = 300;

const newCode = () => crypto.randomBytes(6).toString("hex");

function uniqueSlug(userId: number, name: string): string {
  const base = slugify(name).slice(0, 40) || "list";
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const exists = get("SELECT id FROM user_lists WHERE user_id = ? AND slug = ?", [userId, candidate]);
    if (!exists) return candidate;
  }
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

export function createList(input: { userId: number; name: string; description?: string | null; isPublic?: boolean }): UserList {
  const total = count("SELECT COUNT(*) c FROM user_lists WHERE user_id = ?", [input.userId]);
  if (total >= MAX_LISTS) throw new ApiError("LIMIT_REACHED", 400, undefined, `אפשר להחזיק עד ${MAX_LISTS} רשימות`);

  const name = input.name.trim().slice(0, 60);
  if (name.length < 2) throw new ApiError("BAD_REQUEST", 400, undefined, "שם הרשימה קצר מדי");

  const res = run(
    `INSERT INTO user_lists(user_id, name, slug, description, is_public, share_code, sort_order)
     VALUES(?,?,?,?,?,?,?)`,
    [
      input.userId,
      name,
      uniqueSlug(input.userId, name),
      input.description?.trim().slice(0, 300) ?? null,
      input.isPublic ? 1 : 0,
      newCode(),
      total,
    ],
  );
  return getList(Number(res.lastInsertRowid))!;
}

export const getList = (id: number): UserList | undefined =>
  get<UserList>(`SELECT ${LIST_COLUMNS} FROM user_lists WHERE id = ?`, [id]);

/** רשימה בבעלות המשתמש — או שגיאה. כל פעולה עוברת כאן. */
export function ownedList(userId: number, id: number): UserList {
  const list = getList(id);
  if (!list || list.user_id !== userId) throw new ApiError("NOT_FOUND", 404, undefined, "הרשימה לא נמצאה");
  return list;
}

export function updateList(
  userId: number,
  id: number,
  input: { name?: string; description?: string | null; isPublic?: boolean; coverUrl?: string | null },
): UserList {
  const list = ownedList(userId, id);
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 60);
    if (name.length < 2) throw new ApiError("BAD_REQUEST", 400, undefined, "שם הרשימה קצר מדי");
    fields.push("name = ?");
    values.push(name);
  }
  if (input.description !== undefined) {
    fields.push("description = ?");
    values.push(input.description?.trim().slice(0, 300) ?? null);
  }
  if (input.isPublic !== undefined) {
    fields.push("is_public = ?");
    values.push(input.isPublic ? 1 : 0);
  }
  if (input.coverUrl !== undefined) {
    fields.push("cover_url = ?");
    values.push(input.coverUrl);
  }

  if (fields.length) {
    run(
      `UPDATE user_lists SET ${fields.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      [...values, list.id],
    );
  }
  return getList(list.id)!;
}

export function deleteList(userId: number, id: number): void {
  const list = ownedList(userId, id);
  run("DELETE FROM user_lists WHERE id = ?", [list.id]);
}

/** הרשימות שלי + מספר פריטים בכל אחת */
export function myLists(userId: number) {
  return all<UserList & { item_count: number; preview: string | null }>(
    `SELECT ${LIST_COLUMNS},
            (SELECT COUNT(*) FROM user_list_items i WHERE i.list_id = l.id) AS item_count,
            (SELECT GROUP_CONCAT(t.name_he, ' · ') FROM (
                SELECT i.title_id FROM user_list_items i WHERE i.list_id = l.id ORDER BY i.position LIMIT 3
             ) sel JOIN titles t ON t.id = sel.title_id) AS preview
     FROM user_lists l WHERE l.user_id = ? ORDER BY l.sort_order, l.id DESC`,
    [userId],
  );
}

export function listItems(listId: number, opts: { maturityMax?: string } = {}) {
  const where = ["i.list_id = ?"];
  const params: unknown[] = [listId];
  if (opts.maturityMax) {
    // מצב ילדים: גם רשימה משותפת מסוננת לפי הגיל של הצופה
    where.push("t.age_rating_age <= ?");
    params.push(parseInt(opts.maturityMax.replace("+", ""), 10) || 7);
  }
  return all(
    `SELECT i.id AS item_id, i.note, i.position, i.added_at,
            t.id, t.kind, t.slug, t.name_he, t.name_en, t.year, t.poster_url, t.backdrop_url, t.color,
            t.plan_access, t.rating_imdb, t.runtime_min, t.seasons_count, t.episodes_count, t.maturity, t.quality_max,
            t.is_featured, t.is_original, t.trending_score, t.views_count, t.status, t.updated_at
     FROM user_list_items i JOIN titles t ON t.id = i.title_id
     WHERE ${where.join(" AND ")} AND t.deleted_at IS NULL
     ORDER BY i.position, i.id`,
    params,
  );
}

export function addItem(userId: number, listId: number, titleId: number, note?: string | null): { added: boolean; itemCount: number } {
  const list = ownedList(userId, listId);
  const title = get<{ id: number }>("SELECT id FROM titles WHERE id = ? AND deleted_at IS NULL", [titleId]);
  if (!title) throw new ApiError("NOT_FOUND", 404, undefined, "הכותר לא נמצא");

  const existing = get<{ id: number }>("SELECT id FROM user_list_items WHERE list_id = ? AND title_id = ?", [list.id, titleId]);
  if (existing) {
    if (note !== undefined) run("UPDATE user_list_items SET note = ? WHERE id = ?", [note?.slice(0, 200) ?? null, existing.id]);
    return { added: false, itemCount: count("SELECT COUNT(*) c FROM user_list_items WHERE list_id = ?", [list.id]) };
  }

  const total = count("SELECT COUNT(*) c FROM user_list_items WHERE list_id = ?", [list.id]);
  if (total >= MAX_ITEMS) throw new ApiError("LIMIT_REACHED", 400, undefined, `רשימה יכולה להכיל עד ${MAX_ITEMS} כותרים`);

  const maxPos = Number(get<{ p: number }>("SELECT COALESCE(MAX(position), -1) p FROM user_list_items WHERE list_id = ?", [list.id])?.p ?? -1);
  run("INSERT INTO user_list_items(list_id, title_id, note, position) VALUES(?,?,?,?)", [
    list.id,
    titleId,
    note?.slice(0, 200) ?? null,
    maxPos + 1,
  ]);
  run("UPDATE user_lists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [list.id]);
  return { added: true, itemCount: total + 1 };
}

export function removeItem(userId: number, listId: number, titleId: number): boolean {
  ownedList(userId, listId);
  const changes = run("DELETE FROM user_list_items WHERE list_id = ? AND title_id = ?", [listId, titleId]).changes;
  return changes > 0;
}

export function reorderItems(userId: number, listId: number, order: number[]): void {
  ownedList(userId, listId);
  const ids = order.slice(0, MAX_ITEMS).map((n) => Number(n)).filter((n) => Number.isInteger(n));
  ids.forEach((titleId, index) => {
    run("UPDATE user_list_items SET position = ? WHERE list_id = ? AND title_id = ?", [index, listId, titleId]);
  });
}

/** האם הכותר נמצא באחת מהרשימות שלי (לתצוגה בכרטיס) */
export function listsContaining(userId: number, titleId: number): number[] {
  return all<{ list_id: number }>(
    `SELECT i.list_id FROM user_list_items i JOIN user_lists l ON l.id = i.list_id
     WHERE l.user_id = ? AND i.title_id = ?`,
    [userId, titleId],
  ).map((row) => row.list_id);
}

/** רשימה משותפת לפי קוד — ציבורית בלבד */
export function publicListByCode(code: string) {
  const list = get<UserList & { owner_name: string }>(
    `SELECT l.id, l.user_id, l.name, l.slug, l.description, l.cover_url, l.is_public, l.share_code, l.sort_order,
            l.created_at, l.updated_at, u.name AS owner_name
     FROM user_lists l JOIN users u ON u.id = l.user_id
     WHERE l.share_code = ? AND l.is_public = 1`,
    [code],
  );
  return list ?? null;
}
