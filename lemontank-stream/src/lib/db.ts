/**
 * שכבת גישה למסד הנתונים.
 *
 * מנוע ברירת מחדל: SQLite מובנה של Node (`node:sqlite`) — ללא התקנה, חינם לחלוטין,
 * ללא הגבלת מספר שורות (מוגבל רק בגודל הדיסק), עם WAL לביצועים וטריגרים.
 *
 * ─ מה עוצר SQL Injection ────────────────────────────────────────────────────
 *  1. כל שאילתה פרמטרית: אנו קוראים ל-prepare() עם placeholders בלבד.
 *  2. פונקציית אכיפה `assertSafeSql()` שדוחה בקוד SQL דינמי דפוסים חשודים
 *     (quotes, ';', comments, UNION ... ) — כדי שמפתח לא יזריק בטעות קונקטינציה.
 *  3. ערכים מנורמלים לפני binding (bool→0/1, undefined→NULL) — node:sqlite דוחה
 *     טיפוסים לא חוקיים, וזה מונע גם ניצול טיפוסים.
 */

import { DatabaseSync, type StatementSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

export type SqlValue = string | number | bigint | null | Uint8Array;
export type Row = Record<string, unknown>;

/* ─────────────────────────── מניעת SQL Injection ─────────────────────────── */

/**
 * דפוסים שמעידים על ניסיון להזריק מקטע SQL דינמי (ליטרלים, הערות, UNION...).
 * משמש לבדיקה *קפדנית* של מקטעים שנבנים בזמן ריצה — לא של שאילתות סטטיות.
 */
const SUSPICIOUS_FRAGMENT = /(--|\/\*|\*\/|;|'(?:[^']|'')*'|"(?:[^"]|"")*"|\bunion\b|\battach\b|\bpragma\b|\bxp_cmdshell\b)/i;

/**
 * בדיקה קלה לכל שאילתה: חוסמת ריבוי פקודות והערות, אבל מתירה ליטרלים
 * לגיטימיים (למשל 'published' או '%Y-%m-%d') שנפוצים בכל שאילתה רגילה.
 * הערכים עצמם תמיד עוברים כ-placeholders, ולכן ליטרל בתבנית אינו וקטור תקיפה.
 */
const MULTI_STATEMENT = /(;\s*\S|\/\*|--\s|\battach\s+database\b|\bxp_cmdshell\b)/i;

/**
 * מאמת מחרוזת SQL. ברירת המחדל (light) מתאימה לשאילתות סטטיות מהקוד;
 * mode="strict" מיועד למקטעים דינמיים (ORDER BY/WHERE) — שם אסורים ציטוטים, נקודה-פסיק, UNION וכו'.
 */
export function assertSafeSql(sql: string, context = "sql", mode: "light" | "strict" = "light"): string {
  if (typeof sql !== "string" || sql.length === 0 || sql.length > 20_000) {
    throw new Error(`[db] ${context}: invalid sql`);
  }
  const pattern = mode === "strict" ? SUSPICIOUS_FRAGMENT : MULTI_STATEMENT;
  if (pattern.test(sql)) {
    throw new Error(`[db] ${context}: rejected suspicious SQL fragment`);
  }
  return sql;
}

/** בדיקה קפדנית למקטע SQL שנבנה בזמן ריצה — נדרש גם הוא להיבנות מקבועים בלבד */
export const assertSafeFragment = (fragment: string, context = "sql fragment"): string =>
  assertSafeSql(fragment, context, "strict");

/** רשימת עמודות מותרות ל-sorting — whitelist בלבד */
export function safeOrderBy(input: string | null | undefined, whitelist: readonly string[], fallback: string): string {
  if (!input) return fallback;
  return whitelist.includes(input) ? input : fallback;
}

/** נרמול ערך לפני binding ל-SQLite (node:sqlite דוחה boolean/undefined/Date) */
export function bind(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" || typeof v === "bigint") return v;
  if (v instanceof Uint8Array) return v;
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v); // אובייקטים → JSON (נשמר ב-TEXT)
}

export const bindAll = (arr: unknown[]): SqlValue[] => arr.map(bind);

/* ─────────────────────────────── החיבור ─────────────────────────────────── */

declare global {
  // eslint-disable-next-line no-var
  var __lemontankDb: DatabaseSync | undefined;
}

function dbFile(): string {
  const configured = process.env.DATABASE_FILE || "./data/lemontank.db";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function openDatabase(): DatabaseSync {
  const file = dbFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const dbs = new DatabaseSync(file);

  // ── PRAGMA לביצועים, שלמות ואבטחה ────────────────────────────────────────
  dbs.exec("PRAGMA foreign_keys = ON");        // אוכף מפתחות זרים (מונע נתונים יתומים)
  dbs.exec("PRAGMA busy_timeout = 5000");      // המתנה במקום שגיאת נעילה
  dbs.exec("PRAGMA secure_delete = ON");       // מאפס תוכן שנמחק (הגנת פרטיות)
  dbs.exec("PRAGMA trusted_schema = OFF");     // מונע הרצת קוד מתוך סכימה לא מהימנת
  dbs.exec("PRAGMA recursive_triggers = OFF");
  try {
    dbs.exec("PRAGMA journal_mode = WAL");     // קוראים במקביל לכותבים
    dbs.exec("PRAGMA synchronous = NORMAL");
  } catch {
    /* WAL לא זמין (לדוגמה על FS ברשת) — ממשיכים ב-journal רגיל */
  }

  dbs.exec(SCHEMA_SQL);                        // יצירת טבלאות (IF NOT EXISTS)

  // מטמון שאילתות מוכנות — מפחית פרסינג ומאיץ
  return dbs;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__lemontankDb) {
    globalThis.__lemontankDb = openDatabase();
  }
  return globalThis.__lemontankDb;
}

/* ──────────────────────────── מטמון statements ──────────────────────────── */

const stmtCache = new Map<string, StatementSync>();

function stmt(sql: string, allowUnsafe = false): StatementSync {
  if (!allowUnsafe) assertSafeSql(sql);
  let s = stmtCache.get(sql);
  if (!s) {
    s = getDb().prepare(sql);
    if (stmtCache.size < 500) stmtCache.set(sql, s);
  }
  return s;
}

/* ──────────────────────────────── API ───────────────────────────────────── */

export function run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } {
  const r = stmt(sql).run(...bindAll(params));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/**
 * node:sqlite מחזיר אובייקטים עם prototype=null, ו-React לא מוכן להעביר אותם
 * ל-Client Components ("Only plain objects..."). לכן כל שורה משוכפלת לאובייקט רגיל.
 */
const plain = <T>(row: T): T => (row && typeof row === "object" ? ({ ...(row as object) } as T) : row);

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  const row = stmt(sql).get(...bindAll(params)) as T | undefined;
  return row === undefined ? undefined : plain(row);
}

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return (stmt(sql).all(...bindAll(params)) as T[]).map(plain);
}

export function count(sql: string, params: unknown[] = []): number {
  const row = get<{ c: number }>(sql, params);
  return row ? Number(row.c) : 0;
}

/** טרנזקציה עם rollback אוטומטי — כל פעולה מרובת-טבלאות עוברת כאן */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/** החלה מחדש של הסכימה (משמש בבדיקות/seed) */
export function migrate(): void {
  getDb().exec(SCHEMA_SQL);
}

/** סטטיסטיקות בריאות למסד (לעמוד /admin/health ולמסך ה-API) */
export function dbStats() {
  const dbs = getDb();
  const tables = all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).map((r) => r.name);
  const pageCount = Number((get<{ c: number }>("PRAGMA page_count") as { c?: number })?.c ?? 0);
  const pageSize = Number((get<{ c: number }>("PRAGMA page_size") as { c?: number })?.c ?? 0);
  const file = dbFile();
  return {
    driver: (process.env.DATABASE_DRIVER || "sqlite") as string,
    file,
    exists: fs.existsSync(file),
    sizeBytes: fs.existsSync(file) ? fs.statSync(file).size : pageCount * pageSize,
    tables,
    tableCount: tables.length,
    settings: {
      foreignKeys: get<{ foreign_keys: number }>("PRAGMA foreign_keys")?.foreign_keys ?? 0,
      journalMode: (get<{ journal_mode: string }>("PRAGMA journal_mode") as { journal_mode?: string })?.journal_mode,
    },
    uptimeSec: Math.round(process.uptime()),
    dbs,
  };
}

/** סגירת החיבור בצורה מבוקרת (shutdown / בדיקות) */
export function closeDb(): void {
  try {
    globalThis.__lemontankDb?.close();
  } catch {
    /* ignore */
  }
  globalThis.__lemontankDb = undefined;
  stmtCache.clear();
}

/* ───────────────────────────── שאילתות שימושיות ─────────────────────────── */

/** חיפוש מלא ב-FTS5 עם fallback ל-LIKE אם המשתמש הזין תחביר לא חוקי */
export function searchTitles(query: string, limit = 30, offset = 0): { id: number; name_he: string; kind: string }[] {
  const cleaned = String(query || "").slice(0, 120).trim();
  if (!cleaned) return [];
  // בריחת תווי FTS כדי שלא לאפשר תחביר זדוני בשאילתת החיפוש
  const ftsQuery = cleaned
    .replace(/["'^*():]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}*`)
    .join(" ") || '""';
  try {
    return all(
      `SELECT t.id, t.name_he, t.kind FROM titles_fts f
       JOIN titles t ON t.id = f.rowid
       WHERE titles_fts MATCH ? AND t.status = 'published' AND t.deleted_at IS NULL
       ORDER BY rank LIMIT ? OFFSET ?`,
      [ftsQuery, limit, offset],
    );
  } catch {
    return all(
      `SELECT id, name_he, kind FROM titles
       WHERE deleted_at IS NULL AND (name_he LIKE ? OR name_en LIKE ? OR overview LIKE ?)
       ORDER BY popularity DESC LIMIT ? OFFSET ?`,
      [`%${cleaned}%`, `%${cleaned}%`, `%${cleaned}%`, limit, offset],
    );
  }
}

/** JSON בטוח — לעולם לא זורק שגיאה על טקסט פגום */
export function parseJson<T = unknown>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
