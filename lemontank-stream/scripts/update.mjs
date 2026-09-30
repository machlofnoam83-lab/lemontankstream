#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  עדכון האתר במחשב שלך — פקודה אחת
 *
 *  מה זה עושה, בסדר הזה, ובצורה בטוחה להרצה חוזרת:
 *    1. בודק שזו תיקיית git (אם לא — מדריך למה לעשות).
 *    2. עובר לענף הנכון (arena/01a0d612-lemontankstream) אם צריך.
 *    3. מוריד את הקוד החדש מ-GitHub — **בלי למחוק לך כלום**:
 *       שינויים מקומיים בקבצים שמורים בצד, ולא ממשיכים עד שאתה מחליט.
 *    4. מריץ את ההכנה המלאה: התקנת תלויות, השלמת מסד, בנייה.
 *
 *  מה זה **לא** נוגע בו: המסד (data/lemontank.db), הסודות (.env.local),
 *  הגיבויים (backups/) — כולם ב-.gitignore, ולכן git לא נוגע בהם בכלל.
 *  המשתמשים, הכותרים, הקודים והגיבויים שלך נשארים בדיוק כמו שהם.
 *
 *  הרצה:
 *    npm run update              # עדכון מלא (כולל בנייה)
 *    npm run update -- --status  # רק לבדוק: יש גרסה חדשה? בלי לשנות כלום
 *    npm run update -- --no-build
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const args = new Set(process.argv.slice(2));
const STATUS_ONLY = args.has("--status");
const NO_BUILD = args.has("--no-build");

const BRANCH = "arena/01a0d612-lemontankstream";
const REMOTE = "origin";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = (code) => (useColor ? `\u001b[${code}m` : "");
const B = C("1"), G = C("32"), Y = C("33"), R = C("31"), OFF = C("0");

const ok = (s) => console.log(`  ${G}✓${OFF} ${s}`);
const warn = (s) => console.log(`  ${Y}!${OFF} ${s}`);
const bad = (s) => console.log(`  ${R}✗${OFF} ${s}`);
const step = (s) => console.log(`\n${B}${s}${OFF}`);
const say = (s) => console.log(`   ${s}`);

/** מריץ פקודת git ומחזיר {ok, out} — בלי להפיל את הסקריפט */
function git(...cmd) {
  const res = spawnSync("git", cmd, { cwd: ROOT, encoding: "utf8", windowsHide: true });
  return { ok: res.status === 0, out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim(), status: res.status };
}

console.log(`\n${B}🍋 עדכון LemonTank Stream${OFF}`);

/* ── 1. זו תיקיית git? ────────────────────────────────────────────────────── */
step("1️⃣  בודק את התיקייה");

// התיקייה של האתר יכולה להיות שורש המאגר, או תת-תיקייה בתוכו.
// לכן שואלים את git עצמו איפה השורש — ולא מסתמכים על קיום תיקיית .git כאן.
const repoRoot = git("rev-parse", "--show-toplevel");
const insideRepo = repoRoot.ok && repoRoot.out.length > 0;

if (!insideRepo) {
  bad("התיקייה הזאת אינה מאגר git — אי אפשר להוריד עדכונים ממנה.");
  say("");
  say("מה עושים (בוחרים אחת):");
  say("  א. מורידים מחדש את הפרויקט מ-GitHub לתיקייה חדשה, ומריצים שם:");
  say("         npm run setup");
  say("     המסד והסודות ייווצרו מחדש (התוכן שתוסיף לא עובר בין תיקיות).");
  say("  ב. אם יש לך קובץ ZIP של הקוד — מחליפים רק את תיקיית src/ והסקריפטים.");
  process.exit(1);
}
ok("זו תיקיית git");
if (repoRoot.out !== ROOT) say(`שורש המאגר: ${repoRoot.out}`);

const currentBranch = git("rev-parse", "--abbrev-ref", "HEAD").out;
const headShort = git("rev-parse", "--short", "HEAD").out;
say(`ענף נוכחי: ${currentBranch} · גרסה: ${headShort}`);

/* ── 2. הורדת המידע מ-GitHub ──────────────────────────────────────────────── */
step("2️⃣  מתחבר ל-GitHub");

const fetched = git("fetch", REMOTE, BRANCH);
if (!fetched.ok) {
  bad("לא הצלחתי להתחבר ל-GitHub.");
  say("");
  say("סיבות אפשריות: אין אינטרנט / פרוקסי חוסם / התיקייה נוצרה בלי חיבור.");
  say(`השגיאה: ${fetched.out.split("\n").slice(-2).join(" ")}`);
  say("");
  say("אפשר להמשיך בלי עדכון — האתר יעלה בגרסה שיש לך עכשיו:");
  say("   npm run setup");
  process.exit(1);
}
const remoteSha = git("rev-parse", "--short", "FETCH_HEAD").out;
ok(`הגרסה האחרונה ב-GitHub: ${remoteSha}`);

/* ── 3. יש מה לעדכן? ─────────────────────────────────────────────────────── */
const behind = git("rev-list", "--count", `HEAD..FETCH_HEAD`).out;
const ahead = git("rev-list", "--count", `FETCH_HEAD..HEAD`).out;
const behindN = Number(behind) || 0;
const aheadN = Number(ahead) || 0;

if (behindN === 0) {
  ok("אתה כבר בגרסה האחרונה — אין מה להוריד.");
  if (STATUS_ONLY) {
    console.log("");
    process.exit(0);
  }
  const setup = spawnSync(process.execPath, [path.join(ROOT, "scripts", "local-setup.mjs"), ...(NO_BUILD ? ["--no-build"] : [])], {
    stdio: "inherit",
    cwd: ROOT,
  });
  process.exit(setup.status ?? 0);
}

console.log(`   יש ${behindN} עדכון${behindN > 1 ? "ים" : ""} חדש${behindN > 1 ? "ים" : ""} להוריד.`);
if (aheadN > 0) {
  warn(`יש ${aheadN} קומיטים מקומיים שאף אחד ב-GitHub לא מכיר.`);
  say("הם שלך — ואני לא מוחק אותם בשקט. אם אתה רוצה בכל זאת להתקדם בלעדיהם:");
  say("     npm run update -- --force");
  if (!args.has("--force")) process.exit(1);
  warn("ממשיך בכוח — הקומיטים המקומיים יישארו בהיסטוריה אבל הענף יתיישר לזה שבענן.");
}

if (STATUS_ONLY) {
  console.log("");
  console.log(`   להורדה:  npm run update`);
  console.log("");
  process.exit(0);
}

/* ── 4. שינויים מקומיים? לא דורסים כלום ──────────────────────────────────── */
step("3️⃣  בודק שאין שינויים מקומיים שעלולים להימחק");

const dirty = git("status", "--porcelain", "--untracked-files=no").out;
if (dirty) {
  warn("מצאתי שינויים בקבצים שעוקבים אחריהם ב-git:");
  for (const line of dirty.split("\n").slice(0, 8)) say(`   ${line}`);
  console.log("");
  say("הם לא נמחקים — אבל כדי לא לדרוס אותם, לא המשכתי עם ההורדה.");
  say("אם אלה שינויים שאתה לא צריך:");
  say("     git stash          (שם אותם בצד — אפשר לשחזר עם git stash pop)");
  say("     npm run update     (ואז להריץ שוב)");
  say("אם אלה קבצים שאתה רוצה לשמור — תגיד לי, נמצא דרך בטוחה.");
  process.exit(1);
}
ok("אין שינויים מקומיים — בטוח להוריד");

/* ── 5. ההורדה עצמה ──────────────────────────────────────────────────────── */
step("4️⃣  מוריד את העדכון");

// על הענף הנכון: רק מושכים קדימה (ff-only) — בלי למחוק היסטוריה.
// בענף אחר: עוברים לענף הנכון ומיישרים אותו לזה שבענן.
let updated = currentBranch === BRANCH ? git("merge", "--ff-only", "FETCH_HEAD") : git("checkout", "-B", BRANCH, "FETCH_HEAD");
if (!updated.ok) {
  bad("ההורדה נכשלה. הפלט המלא:");
  say(updated.out.split("\n").slice(-6).join("\n   "));
  say("");
  say("אפשר להריץ את האתר בגרסה הנוכחית בלי העדכון:  npm run setup");
  process.exit(1);
}
const newShort = git("rev-parse", "--short", "HEAD").out;
ok(`עודכן לגרסה ${newShort}`);

/* ── 6. הכנה מלאה ────────────────────────────────────────────────────────── */
step("5️⃣  מכין את האתר (תלויות · מסד · בנייה)");
say("זה יכול לקחת דקה-שתיים בפעם הראשונה.");

const setup = spawnSync(process.execPath, [path.join(ROOT, "scripts", "local-setup.mjs"), ...(NO_BUILD ? ["--no-build"] : [])], {
  stdio: "inherit",
  cwd: ROOT,
});
if ((setup.status ?? 1) !== 0) {
  bad("ההכנה נכשלה. הרץ את זה כדי לקבל דוח מלא:");
  say("     npm run doctor -- --report");
  process.exit(1);
}

console.log("");
console.log(`${G}${B}✔ האתר מעודכן ומוכן.${OFF}`);
console.log(`   הרצה:      npm run watchdog     (מרים ומשגיח — מחזיר לבד אם נופל)`);
console.log(`   האתר:      http://localhost:3000`);
console.log("");
