/**
 * הגירות עמודות — רצות פעם אחת לכל התקנה.
 *
 * למה זה בכלל קיים: `CREATE TABLE IF NOT EXISTS` לא נוגע בטבלה קיימת,
 * ולכן הוספת עמודה לשכבת "המבצר" לא הייתה מגיעה למסד ותיק. כאן כל הגירה
 * נרשמת בטבלת `schema_migrations` ורצה פעם אחת בלבד, בסדר קבוע.
 *
 * כלל ברזל: הגירה לא משנה ולא מוחקת נתונים קיימים — רק מוסיפה עמודות/indexes.
 */

import migrationsJson from "../../sql/migrations.json";
import { all, get, run } from "./db";

type Migration = { name: string; sql: string[] };

/**
 * ההגירות עצמן חיות ב-`sql/migrations.json` — מקור אמת אחד לשני עולמות:
 *   1. האפליקציה (הקובץ הזה) — רצה אוטומטית כשהמסד נטען.
 *   2. הסקריפטים שרצים בלי TypeScript (`scripts/apply-migrations.mjs`) —
 *      כדי שאפשר יהיה להשלים סכימה גם בלי להעלות את השרת (למשל לפני בדיקות).
 * עד עכשיו ההגירות היו קבורות כאן כ-TS, ולכן מסד שזה עתה נוצר נשאר בלי
 * הטבלאות החדשות עד העלייה הראשונה של השרת — וכל סקריפט נכשל ב"אין טבלה".
 */
const MIGRATIONS: Migration[] = (migrationsJson as { migrations: Migration[] }).migrations;

let applied = false;

function columnsOf(table: string): Set<string> {
  return new Set(
    all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => String(row.name)),
  );
}

/**
 * מריץ הגירות שלא הוחלו. בטוח לקריאה חוזרת (idempotent) ובטוחה במקביליות
 * ברמה שהמערכת צריכה: אם עמודה כבר קיימת — מדלגים על ההצהרה הזו בלבד.
 */
export function runMigrations(): { applied: string[]; skipped: string[] } {
  const appliedAlready = new Set(all<{ name: string }>("SELECT name FROM schema_migrations").map((r) => String(r.name)));
  const done: string[] = [];
  const skipped: string[] = [];

  for (const migration of MIGRATIONS) {
    if (appliedAlready.has(migration.name)) {
      skipped.push(migration.name);
      continue;
    }
    for (const statement of migration.sql) {
      try {
        run(statement);
      } catch (error) {
        const message = String((error as Error)?.message ?? "");
        // "duplicate column name" = כבר הוחל בעבר (למשל אחרי שחזור מגיבוי)
        if (!/duplicate column name|already exists/i.test(message)) {
          throw new Error(`הגירה ${migration.name} נכשלה: ${message}`);
        }
      }
    }
    run("INSERT OR IGNORE INTO schema_migrations(name) VALUES(?)", [migration.name]);
    done.push(migration.name);
  }

  applied = true;
  return { applied: done, skipped };
}

/** האם העמודה קיימת בפועל (לבדיקות ולמסך הבריאות) */
export const hasColumn = (table: string, column: string): boolean => columnsOf(table).has(column);

/** מספר ההגירות הרשומות */
export const migrationsApplied = (): number => Number(get<{ c: number }>("SELECT COUNT(*) c FROM schema_migrations")?.c ?? 0);

/** האם ההגירות כבר רצו בתהליך הזה */
export const migrationsReady = (): boolean => applied;
