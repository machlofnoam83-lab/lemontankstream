/**
 * הגירות עמודות — רצות פעם אחת לכל התקנה.
 *
 * למה זה בכלל קיים: `CREATE TABLE IF NOT EXISTS` לא נוגע בטבלה קיימת,
 * ולכן הוספת עמודה לשכבת "המבצר" לא הייתה מגיעה למסד ותיק. כאן כל הגירה
 * נרשמת בטבלת `schema_migrations` ורצה פעם אחת בלבד, בסדר קבוע.
 *
 * כלל ברזל: הגירה לא משנה ולא מוחקת נתונים קיימים — רק מוסיפה עמודות/indexes.
 */

import { all, get, run } from "./db";

type Migration = { name: string; sql: string[] };

const MIGRATIONS: Migration[] = [
  {
    name: "2026-09-fortress-session-posture",
    sql: [
      // קישור הסשן לטביעת הדפדפן ולרשת שממנה נוצר — זיהוי גניבת עוגייה
      "ALTER TABLE sessions ADD COLUMN ua_hash TEXT",
      "ALTER TABLE sessions ADD COLUMN ip_prefix TEXT",
      "ALTER TABLE sessions ADD COLUMN last_ip TEXT",
      // פקיעה מוחלטת (ליד ה-sliding) וחלון re-auth מדורג לפעולות רגישות
      "ALTER TABLE sessions ADD COLUMN absolute_expires_at TEXT",
      "ALTER TABLE sessions ADD COLUMN stepup_until TEXT",
      "ALTER TABLE sessions ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 0",
    ],
  },
  {
    name: "2026-09-fortress-audit-chain",
    sql: [
      // חתימת Hash משורשרת: כל רשומה נושאת את חתימת קודמתה →
      // כל מחיקה או שינוי בדיעבד ניתנים לגילוי בהשוואה אחת.
      "ALTER TABLE audit_log ADD COLUMN seq INTEGER",
      "ALTER TABLE audit_log ADD COLUMN prev_hash TEXT",
      "ALTER TABLE audit_log ADD COLUMN entry_hash TEXT",
      "CREATE INDEX IF NOT EXISTS idx_audit_seq ON audit_log(seq)",
    ],
  },
  {
    name: "2026-09-fortress-login-geo",
    sql: [
      // פרטי התחברות היסטוריים לזיהוי חריגות (מכשיר חדש, רשת חדשה)
      "ALTER TABLE sessions ADD COLUMN origin_country TEXT",
      "ALTER TABLE sessions ADD COLUMN mfa_used INTEGER NOT NULL DEFAULT 0",
    ],
  },
];

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
