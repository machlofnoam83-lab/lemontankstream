/**
 * בדיקת מצב מסד הנתונים — משותף לכל הסקריפטים.
 *
 * למה זה קיים: קובץ מסד יכול להתקיים בלי להכיל את סכימת האפליקציה (למשל אם
 * השרת עלה פעם אחת לפני ההזרעה, או שקובץ חלקי הועתק). במצב כזה כלי ההגירות
 * נכשלו בעשרות שגיאות SQL סתומות ("no such table: sessions") במקום לומר
 * בעברית מה קרה ומה הפקודה שמתקנת את זה.
 *
 * שלושה מצבים אפשריים:
 *   missing  — אין קובץ מסד בכלל (התקנה ראשונה)
 *   empty    — יש קובץ, אבל חסרה סכימת האפליקציה (users/titles/sessions)
 *   ready    — הסכימה קיימת (אולי חסרות הגירות — את זה משלים apply-migrations)
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** טבלאות הליבה שאם הן חסרות — המסד לא שמיש לאפליקציה */
export const CORE_TABLES = ["users", "sessions", "titles", "plans"];

export function databaseFile(root, env = process.env) {
  if (env.DATABASE_FILE) return path.resolve(root, env.DATABASE_FILE);
  return path.join(env.DATA_DIR ?? path.join(root, "data"), "lemontank.db");
}

/**
 * @returns {{state:"missing"|"empty"|"ready", exists:boolean, readable:boolean,
 *            tables:number, missingCore:string[], migrations:number, error:string|null, file:string}}
 */
export function inspectDatabase(file) {
  const base = { file, exists: false, readable: false, tables: 0, missingCore: [...CORE_TABLES], migrations: 0, error: null };
  if (!fs.existsSync(file)) return { ...base, state: "missing" };

  let db = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const names = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => String(row.name)),
    );
    const missingCore = CORE_TABLES.filter((table) => !names.has(table));
    let migrations = 0;
    if (names.has("schema_migrations")) {
      migrations = Number(db.prepare("SELECT COUNT(*) c FROM schema_migrations").get()?.c ?? 0);
    }
    return {
      ...base,
      exists: true,
      readable: true,
      tables: names.size,
      missingCore,
      migrations,
      state: missingCore.length ? "empty" : "ready",
    };
  } catch (error) {
    return { ...base, exists: true, readable: false, error: String(error?.message ?? error), state: "empty" };
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

/** טקסט אחיד לכל כלי שמגלה מסד בלי סכימה */
export function explainEmptyDatabase(info) {
  const lines = [
    "⚠️  קובץ המסד קיים אבל חסרה בו סכימת האפליקציה:",
    `     ${path.basename(info.file)} — ${info.tables} טבלאות, חסרות: ${info.missingCore.join(", ")}`,
  ];
  if (info.error) lines.push(`     שגיאה בקריאה: ${info.error}`);
  lines.push(
    "",
    "  הסיבה השכיחה: השרת עלה פעם אחת לפני שנוצר המסד (למשל npm run start לפני npm run setup),",
    "  או שקובץ חלקי הועתק לכאן. אין כאן תוכן שיכול ללכת לאיבוד.",
    "",
    "  התיקון (יוצר מסד נקי — הקטלוג ריק, התוכן הוא שלך):",
    "     node scripts/seed.mjs --reset",
    "  ואז:  npm run db:migrate   (או פשוט npm run setup)",
  );
  return lines.join("\n");
}
