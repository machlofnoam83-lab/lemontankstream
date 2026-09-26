#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  השלמת הגירות סכימה — בלי להעלות את השרת
 *
 *  למה זה קיים: ההגירות רצו רק כשהשרת עולה (דרך שכבת ה-DB של האפליקציה).
 *  התוצאה: מסד שזה עתה נוצר היה חסר את הטבלאות החדשות (למשל gift_cards)
 *  עד העלייה הראשונה — וכל סקריפט או בדיקה נכשלו ב"אין טבלה כזו" בלי הסבר.
 *
 *  עכשיו שני העולמות קוראים את אותו מקור: sql/migrations.json.
 *      · האפליקציה (src/lib/migrations.ts) — בזמן עלייה
 *      · הסקריפט הזה (Node בלבד)      — לפני בדיקות, התקנה, שחזור גיבוי
 *
 *  הרצה:
 *    node scripts/apply-migrations.mjs            # משלים מה שחסר ומדווח
 *    node scripts/apply-migrations.mjs --quiet    # שקט אם אין מה לעשות
 *    node scripts/apply-migrations.mjs --status   # מצב בלבד, לא נוגע בכלום
 *
 *  בטוח להרצה חוזרת: כל הגירה נרשמת ב-schema_migrations ורצה פעם אחת.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_FILE = process.env.DATABASE_FILE
  ? path.resolve(ROOT, process.env.DATABASE_FILE)
  : path.join(process.env.DATA_DIR ?? path.join(ROOT, "data"), "lemontank.db");

const args = process.argv.slice(2);
const QUIET = args.includes("--quiet");
const STATUS_ONLY = args.includes("--status");

const say = (text) => { if (!QUIET) console.log(text); };

if (!fs.existsSync(DB_FILE)) {
  // אין מסד — אין מה להשלים. הקריאה מחזירה 0 כדי לא לשבור תסריטים.
  say(`ℹ️  אין מסד ב-${path.relative(ROOT, DB_FILE)} — אין הגירות להשלים`);
  process.exit(0);
}

const manifestPath = path.join(ROOT, "sql", "migrations.json");
if (!fs.existsSync(manifestPath)) {
  console.error(`❌ חסר ${path.relative(ROOT, manifestPath)} — לא ניתן להריץ הגירות`);
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const migrations = manifest?.migrations ?? [];

const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// טבלת המעקב עצמה — נוצרת כאן כדי שסקריפט יכול לרוץ לפני השרת
db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");

const already = new Set(
  db.prepare("SELECT name FROM schema_migrations").all().map((row) => String(row.name)),
);

const pending = migrations.filter((migration) => !already.has(migration.name));

if (STATUS_ONLY) {
  const tables = Number(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table'").get().c);
  console.log(`📋 סכימה: ${tables} טבלאות · ${already.size}/${migrations.length} הגירות הוחלו`);
  for (const migration of migrations) {
    console.log(`   ${already.has(migration.name) ? "✓" : "·"} ${migration.name}`);
  }
  if (pending.length) console.log(`\nחסרות ${pending.length} הגירות — הרץ: node scripts/apply-migrations.mjs`);
  db.close();
  process.exit(0);
}

if (!pending.length) {
  say(`✓ הסכימה מעודכנת (${migrations.length} הגירות)`);
  db.close();
  process.exit(0);
}

const applied = [];
const problems = [];
for (const migration of pending) {
  for (const statement of migration.sql) {
    try {
      db.exec(statement);
    } catch (error) {
      const message = String(error?.message ?? error);
      // "duplicate column name" / "already exists" = הוחל בעבר (למשל אחרי שחזור גיבוי)
      if (!/duplicate column name|already exists/i.test(message)) {
        problems.push(`${migration.name}: ${message}`);
      }
    }
  }
  db.prepare("INSERT OR IGNORE INTO schema_migrations(name) VALUES(?)").run(migration.name);
  applied.push(migration.name);
}

if (problems.length) {
  console.error("❌ חלק מההגירות נכשלו:");
  for (const problem of problems) console.error(`   · ${problem}`);
  db.close();
  process.exit(1);
}

const tables = Number(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table'").get().c);
console.log(`✅ הוחלו ${applied.length} הגירות (${tables} טבלאות במסד)`);
for (const name of applied) console.log(`   · ${name}`);
db.close();
