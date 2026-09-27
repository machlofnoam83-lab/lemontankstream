#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  הרצה מקומית — הכנה אוטומטית של האתר במחשב שלך (Windows / macOS / Linux)
 *
 *  מה זה עושה (בפקודה אחת, ובצורה בטוחה להרצה חוזרת):
 *    1. בודק גרסת Node (צריך 22.13+, או 23.4+) — עם הודעה ברורה אם חסר
 *    2. מתקין תלויות אם אין node_modules            → npm ci
 *    3. מייצר סודות אם אין .env.local               → scripts/gen-secrets.mjs
 *       ומעדכן לערכי פיתוח נוחים (סיסמת מנהל + מפתח גיבוי ידועים)
 *    4. יוצר את המסד אם הוא חסר (קטלוג ריק!)        → scripts/seed.mjs
 *    5. בונה את האתר אם אין .next                   → next build
 *    6. מדפיס מה לעשות עכשיו (הרצה, כניסת מנהל, הוספת תוכן)
 *
 *  הרצה:
 *    node scripts/local-setup.mjs              # הכנה מלאה (כולל בנייה)
 *    node scripts/local-setup.mjs --no-build   # בלי בנייה — מהיר (dev)
 *    node scripts/local-setup.mjs --check      # רק בדיקה, בלי לשנות כלום
 *    node scripts/local-setup.mjs --demo       # עם תוכן לדוגמה (אפשר למחוק אחר כך)
 *
 *  זה לא נוגע במסד/בסודות קיימים — רק משלים את מה שחסר.
 *  להרצה:  npm run start     (או npm run dev)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { explainEmptyDatabase, inspectDatabase } from "./lib/db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const NO_BUILD = args.has("--no-build");
const DEMO = args.has("--demo");

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = (code) => (useColor ? `\u001b[${code}m` : "");
const B = C("1"), G = C("32"), Y = C("33"), R = C("31"), OFF = C("0");
const ok = (s) => console.log(`  ${G}✓${OFF} ${s}`);
const warn = (s) => console.log(`  ${Y}!${OFF} ${s}`);
const bad = (s) => console.log(`  ${R}✗${OFF} ${s}`);
const step = (s) => console.log(`\n${B}${s}${OFF}`);
const todo = (s) => (CHECK_ONLY ? warn(`חסר: ${s}  (--check — לא שיניתי כלום)`) : null);

/* ── 0. גרסת Node ─────────────────────────────────────────────────────────── */
step("0️⃣  בדיקת גרסת Node.js");
{
  const [maj, min] = process.versions.node.split(".").map(Number);
  const okVer = maj >= 24 || (maj === 23 && min >= 4) || (maj === 22 && min >= 13);
  if (!okVer) {
    bad(`מותקן Node v${process.versions.node} — צריך 22.13 ומעלה (או 23.4+)`);
    console.log(`
  למה: מסד הנתונים של האתר הוא node:sqlite המובנה של Node —
  כלומר בלי חבילות חוץ, אבל הוא קיים רק מגרסה 22.13 (או 23.4) ומעלה.

  מה עושים:
    1. היכנס ל-https://nodejs.org
    2. הורד את גרסת ה-LTS (הכפתור הגדול משמאל) והתקן
    3. סגור את חלון הטרמינל ופתח חדש (חשוב!)
    4. הרץ שוב את הפקודה הזו
`);
    process.exit(1);
  }
}

if (!fs.existsSync(path.join(ROOT, "package.json")) || !fs.existsSync(path.join(ROOT, "server.mjs"))) {
  bad(`לא נראה שזו תיקיית הפרויקט (${ROOT})`);
  console.log("  הסקריפט חייב לרוץ מתוך תיקיית lemontank-stream — הרץ: node scripts/local-setup.mjs");
  process.exit(1);
}

/* ── הרצת npm בכל מערכת בלי להיתקל ב-spawn של קבצי ‎.cmd בווינדוס ──────────
 * הבאג שתוקן כאן: `spawnSync("npm.cmd", …)` בווינדוס נכשל בשקט (EINVAL) מאז
 * תיקון האבטחה של Node (CVE-2024-27980) — כלומר `npm run build` "נכשל" בלי
 * שורה אחת של פלט, עם קוד יציאה לא ידוע. במקום זה מריצים את npm-cli.js ישירות
 * עם ה-node עצמו (מה ש-npm עושה בעצמו כשמפעילים אותו מ-npm run), ורק אם לא
 * מוצאים אותו — נופלים חזרה למעטפת.
 */
function npmInvocation(npmArgs) {
  const fromNpm = process.env.npm_execpath; // מוגדר כשרצים דרך `npm run …`
  if (fromNpm && fs.existsSync(fromNpm)) return { cmd: process.execPath, args: [fromNpm, ...npmArgs] };

  const binDir = path.dirname(process.execPath);
  for (const candidate of [
    path.join(binDir, "node_modules", "npm", "bin", "npm-cli.js"), // Windows / macOS
    path.join(binDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"), // Linux
  ]) {
    if (fs.existsSync(candidate)) return { cmd: process.execPath, args: [path.resolve(candidate), ...npmArgs] };
  }

  // אין npm-cli.js? מריצים את המעטפת. בווינדוס חובה shell עבור ‎.cmd.
  const isWin = process.platform === "win32";
  return { cmd: isWin ? "npm.cmd" : "npm", args: npmArgs, shell: isWin };
}

function npmRun(npmArgs, label, { quiet = false } = {}) {
  const inv = npmInvocation(npmArgs);
  const res = spawnSync(inv.cmd, inv.args, {
    cwd: ROOT,
    stdio: quiet ? ["ignore", "pipe", "inherit"] : "inherit",
    shell: inv.shell ?? false,
    encoding: "utf8",
  });
  if (res.error || res.status !== 0) {
    bad(`${label} נכשל${res.status === null || res.status === undefined ? "" : ` (קוד ${res.status})`}`);
    if (res.error) console.log(`     ${res.error.message}`);
    console.log(`
  מה עושים:  הרץ ידנית כדי לראות את השגיאה המלאה:
               npm run build
             ואם צריך עזרה — כל התקלות הנפוצות כאן: RUN-LOCALLY.md
`);
    process.exit(typeof res.status === "number" ? res.status || 1 : 1);
  }
  return res.stdout ?? "";
}

/** הרצת סקריפט Node מהפרויקט (למשל scripts/seed.mjs) */
function runNode(scriptArgs, label) {
  const res = spawnSync(process.execPath, scriptArgs, { cwd: ROOT, stdio: "inherit" });
  if (res.error || res.status !== 0) {
    bad(`${label} נכשל${typeof res.status === "number" ? ` (קוד ${res.status})` : ""}`);
    if (res.error) console.log(`     ${res.error.message}`);
    process.exit(typeof res.status === "number" ? res.status || 1 : 1);
  }
}

{
  const inv = npmInvocation(["-v"]);
  const res = spawnSync(inv.cmd, inv.args, { encoding: "utf8", shell: inv.shell ?? false });
  ok(`Node v${process.versions.node}, npm ${(res.stdout ?? "").trim() || "?"}`);
}


/* ── 1. תלויות ────────────────────────────────────────────────────────────── */
step("1️⃣  חבילות (node_modules)");
if (fs.existsSync(path.join(ROOT, "node_modules", "next"))) {
  ok("מותקנות — מדלג");
} else if (CHECK_ONLY) {
  todo("node_modules — הרץ בלי --check כדי להתקין");
} else {
  console.log("  מתקין… (בפעם הראשונה זה לוקח 1–3 דקות, צריך אינטרנט)");
  npmRun(["ci", "--no-fund", "--no-audit"], "התקנת חבילות");
  ok("החבילות הותקנו");
}

/* ── 2. סודות ─────────────────────────────────────────────────────────────── */
step("2️⃣  סודות (.env.local)");
const envPath = path.join(ROOT, ".env.local");
const dbPath = path.join(ROOT, "data", "lemontank.db");
const freshInstall = !fs.existsSync(dbPath); // אין מסד = התקנה ראשונה

let createdEnv = false;
if (!fs.existsSync(envPath)) {
  if (CHECK_ONLY) {
    todo(".env.local — ייווצר אוטומטית");
  } else {
    runNode(["scripts/gen-secrets.mjs", "--write"], "יצירת סודות");
    createdEnv = true;
    ok(".env.local נוצר עם סודות אקראיים");
  }
} else {
  ok(".env.local קיים — הסודות שלך לא נגעו");
}

/**
 * ערכי נומחות לפיתוח — אבל **בלי לדרוס שום דבר קיים**.
 *
 * למה זה תוקן: הגרסה הקודמת דרסה תמיד את SEED_ADMIN_PASSWORD ואת BACKUP_KEY
 * לערכי פיתוח קבועים. במחשב אישי שכבר יש בו תוכן זה מסוכן: החלפת BACKUP_KEY
 * הופכת גיבויים קודמים לבלתי-ניתנים-לפתיחה (הם הוצפנו במפתח הישן).
 * לכן הכלל עכשיו:
 *   • BACKUP_KEY — נוסף רק אם הוא חסר. לעולם לא מוחלף.
 *   • SEED_ADMIN_PASSWORD — נקבע לברירת המחדל הידועה רק בהתקנה **חדשה**
 *     (כשאין מסד). אם המסב כבר קיים, הסיסמה שלך נשארת כפי שהיא.
 */
if (!CHECK_ONLY && fs.existsSync(envPath)) {
  const DEV_PASSWORD = '"ChangeMe-Admin-2026!"';
  const DEV_BACKUP_KEY = "backup-key-for-local-dev-0123456789abcdef";
  let txt = fs.readFileSync(envPath, "utf8");
  const notes = [];

  const readValue = (key) => {
    const m = txt.match(new RegExp("^" + key + "=(.*)$", "m"));
    return m ? m[1].trim() : null;
  };
  const writeValue = (key, value) => {
    const re = new RegExp("^" + key + "=.*$", "m");
    txt = re.test(txt) ? txt.replace(re, `${key}=${value}`) : txt.replace(/\n?$/, "\n") + `${key}=${value}\n`;
  };

  const backupKey = readValue("BACKUP_KEY");
  if (!backupKey) {
    writeValue("BACKUP_KEY", DEV_BACKUP_KEY);
    notes.push("נוסף BACKUP_KEY לפיתוח (גיבויים ייפתחו איתו — שמור עליו)");
  }

  const adminPass = readValue("SEED_ADMIN_PASSWORD");
  if (freshInstall && (createdEnv || !adminPass || adminPass === '""')) {
    // התקנה חדשה (אין מסד) — הפעם היחידה שבה אנחנו קובעים סיסמה, כדי שהיא
    // תהיה זו שכתובה במדריכים ובקובץ ההפעלה. אחרי שהמסד נוצר — לא נוגעים.
    writeValue("SEED_ADMIN_PASSWORD", DEV_PASSWORD);
    notes.push("סיסמת מנהל ראשונית: ChangeMe-Admin-2026! (החלף ב-/account/security)");
  } else if (freshInstall && adminPass !== DEV_PASSWORD) {
    notes.push("סיסמת המנהל תהיה זו שב-.env.local (SEED_ADMIN_PASSWORD)");
  } else if (!freshInstall && adminPass === DEV_PASSWORD) {
    notes.push("שים לב: סיסמת המנהל היא סיסמת פיתוח קבועה — החלף ב-/account/security");
  }

  if (notes.length) {
    fs.writeFileSync(envPath, txt, { mode: 0o600 });
    for (const n of notes) ok(n);
  } else {
    ok("הגדרות הפיתוח כבר במקום — לא שונה כלום");
  }
}

/* ── 3. מסד נתונים ────────────────────────────────────────────────────────── */
step("3️⃣  מסד נתונים (SQLite מקומי)");
const dbInfo = inspectDatabase(dbPath);
if (dbInfo.state === "empty" && !CHECK_ONLY) {
  warn(explainEmptyDatabase(dbInfo));
  bad("המסד לא שמיש — עצרתי כאן בלי לשנות כלום.");
  process.exit(1);
} else if (dbInfo.state === "ready") {
  ok(`data/lemontank.db תקין — ${dbInfo.tables} טבלאות, התוכן שלך לא נגע`);
} else if (CHECK_ONLY) {
  todo("data/lemontank.db — המסד ייווצר ריק (רק אתה מוסיף תוכן)");
} else {
  const seedArgs = ["scripts/seed.mjs"];
  if (DEMO) seedArgs.push("--reset", "--demo");
  runNode(seedArgs, "יצירת המסד");
  ok(DEMO ? "המסד נוצר עם תוכן לדוגמה" : "המסד נוצר — קטלוג ריק, התוכן הוא שלך");
}

// השלמת הגירות סכימה (טבלאות שנוספו בגרסאות מאוחרות). בלעדיהן המסד טרי חסר
// טבלאות עד העלייה הראשונה של השרת — ובדיקות/סקריפטים נכשלים בלי הסבר.
if (!CHECK_ONLY) {
  const migrate = spawnSync(process.execPath, ["scripts/apply-migrations.mjs", "--quiet"], { cwd: ROOT, encoding: "utf8" });
  if (migrate.status === 0) {
    const note = (migrate.stdout ?? "").trim();
    ok(note.replace(/^✅\s*/, "") || "הסכימה מעודכנת");
  } else {
    warn("השלמת ההגירות לא הצליחה — הרץ: npm run db:migrate");
  }
}

/* ── 4. בנייה ─────────────────────────────────────────────────────────────── */
step("4️⃣  בנייה (.next)");
const built = fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"));
if (NO_BUILD) {
  ok("דולג (--no-build) — מתאים ל: npm run dev");
} else if (built) {
  ok("קיים build — מדלג (לבנייה מחדש: מחק את תיקיית .next)");
} else if (CHECK_ONLY) {
  todo(".next — האתר ייבנה");
} else {
  console.log("  בונה… (1–2 דקות)");
  npmRun(["run", "build"], "בנייה");
  ok("הבנייה הושלמה");
}

/* ── 5. סיכום ─────────────────────────────────────────────────────────────── */
step("✅ מה עכשיו?");
console.log(`
  הרצה:            ${B}npm run start${OFF}      →  ${B}http://localhost:3000${OFF}
  פיתוח (רענון חי):  ${B}npm run dev${OFF}
  עצירה:            ${B}Ctrl + C${OFF} בחלון שבו האתר רץ

  כניסת מנהל:       admin@lemontank.local  /  ChangeMe-Admin-2026!
  הוספת תוכן:       http://localhost:3000/admin/titles/new   (סרט / סדרה / פרקים)

  שידור למשפחה/חברים באותה רשת Wi-Fi:  http://<הכתובת-של-המחשב-שלך>:3000
  (בווינדוס: ipconfig → IPv4; במק: ipconfig getifaddr en0)

  רוצה שהאתר יהיה באוויר לאינטרנט?  ראה FREE-HOSTING.md + DEPLOY.md
`);
if (CHECK_ONLY) {
  console.log(`  ${Y}זו הייתה בדיקה בלבד — לא שיניתי כלום.${OFF}\n`);
}
