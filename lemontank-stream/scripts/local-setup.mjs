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
  ok(`Node v${process.versions.node}, npm ${spawnSync(npmCmd(), ["-v"], { encoding: "utf8" }).stdout?.trim() ?? "?"}`);
}

if (!fs.existsSync(path.join(ROOT, "package.json")) || !fs.existsSync(path.join(ROOT, "server.mjs"))) {
  bad(`לא נראה שזו תיקיית הפרויקט (${ROOT})`);
  console.log("  הסקריפט חייב לרוץ מתוך תיקיית lemontank-stream — הרץ: node scripts/local-setup.mjs");
  process.exit(1);
}

const run = (cmd, cmdArgs, label) => {
  const res = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: ROOT });
  if (res.status !== 0) {
    bad(`${label} נכשל (קוד ${res.status ?? "?"})`);
    process.exit(res.status ?? 1);
  }
};

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

/* ── 1. תלויות ────────────────────────────────────────────────────────────── */
step("1️⃣  חבילות (node_modules)");
if (fs.existsSync(path.join(ROOT, "node_modules", "next"))) {
  ok("מותקנות — מדלג");
} else if (CHECK_ONLY) {
  todo("node_modules — הרץ בלי --check כדי להתקין");
} else {
  console.log("  מתקין… (בפעם הראשונה זה לוקח 1–3 דקות, צריך אינטרנט)");
  run(npmCmd(), ["ci", "--no-fund", "--no-audit"], "התקנת חבילות");
  ok("החבילות הותקנו");
}

/* ── 2. סודות ─────────────────────────────────────────────────────────────── */
step("2️⃣  סודות (.env.local)");
const envPath = path.join(ROOT, ".env.local");
if (!fs.existsSync(envPath)) {
  if (CHECK_ONLY) {
    todo(".env.local — ייווצר אוטומטית");
  } else {
    run(process.execPath, ["scripts/gen-secrets.mjs", "--write"], "יצירת סודות");
    ok(".env.local נוצר עם סודות אקראיים");
  }
} else {
  ok(".env.local קיים — הסודות לא נגעו");
}

/** ערכי פיתוח נוחים: סיסמת מנהל קבועה כדי שיהיה קל להיכנס, ומפתח גיבוי תקין. */
if (!CHECK_ONLY && fs.existsSync(envPath)) {
  const PIN = {
    SEED_ADMIN_PASSWORD: '"ChangeMe-Admin-2026!"',
    BACKUP_KEY: "backup-key-for-local-dev-0123456789abcdef",
  };
  let txt = fs.readFileSync(envPath, "utf8");
  let changed = 0;
  for (const [k, v] of Object.entries(PIN)) {
    const re = new RegExp("^" + k + "=.*$", "m");
    if (re.test(txt)) {
      if (!txt.includes(`${k}=${v}`)) {
        txt = txt.replace(re, `${k}=${v}`);
        changed++;
      }
    } else {
      txt = txt.replace(/\n?$/, "\n") + `${k}=${v}\n`;
      changed++;
    }
  }
  if (changed) {
    fs.writeFileSync(envPath, txt, { mode: 0o600 });
    ok("עודכנו ערכי פיתוח (סיסמת מנהל ידועה + מפתח גיבוי)");
  } else {
    ok("ערכי הפיתוח כבר במקום");
  }
}

/* ── 3. מסד נתונים ────────────────────────────────────────────────────────── */
step("3️⃣  מסד נתונים (SQLite מקומי)");
const dbPath = path.join(ROOT, "data", "lemontank.db");
if (fs.existsSync(dbPath)) {
  ok("data/lemontank.db קיים — התוכן שלך לא נגע");
} else if (CHECK_ONLY) {
  todo("data/lemontank.db — המסד ייווצר ריק (רק אתה מוסיף תוכן)");
} else {
  const seedArgs = ["scripts/seed.mjs"];
  if (DEMO) seedArgs.push("--reset", "--demo");
  run(process.execPath, seedArgs, "יצירת המסד");
  ok(DEMO ? "המסד נוצר עם תוכן לדוגמה" : "המסד נוצר — קטלוג ריק, התוכן הוא שלך");
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
  run(npmCmd(), ["run", "build"], "בנייה");
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
