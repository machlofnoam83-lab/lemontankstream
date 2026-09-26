#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  שחזור קוד + עדכון גרסה — חוצה-מערכות (Windows / macOS / Linux)
 *
 *  המקבילה של `scripts/recover-dev.sh` למי שאין Git Bash: מריצים
 *    npm run recover
 *
 *  מה זה עושה:
 *    1. בודק שיש git וזו תיקיית git
 *    2. אם יש שינויים לא-מקומטים → עוצר ומראה אותם (לא מוחק עבודה!)
 *       עם --force הוא מגבה אותם ל-backup-uncommitted/ לפני שממשיך
 *    3. מסנכרן את הקוד מהענף ב-origin (fetch + reset --hard לענף)
 *    4. משלים את מה שחסר (חבילות, סודות, מסד, בנייה) דרך local-setup
 *
 *  הרצה:
 *    npm run recover                 # עדכון בטוח
 *    npm run recover -- --force      # גם אם יש שינויים מקומיים (עם גיבוי)
 *    npm run recover -- --no-build   # בלי בנייה בסוף
 *    npm run recover -- --check      # בדיקה בלבד, בלי לשנות כלום
 *
 *  הקוד נשמר ב-Git; התוכן שלך (data/) והסודות (.env.local) לא נגעים.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const FORCE = has("--force");
const CHECK_ONLY = has("--check");
const passThrough = argv.filter((a) => a === "--no-build" || a === "--demo");

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = (c) => (useColor ? `\u001b[${c}m` : "");
const B = C("1"), G = C("32"), Y = C("33"), R = C("31"), OFF = C("0");
const ok = (s) => console.log(`  ${G}✓${OFF} ${s}`);
const warn = (s) => console.log(`  ${Y}!${OFF} ${s}`);
const bad = (s) => console.log(`  ${R}✗${OFF} ${s}`);
const step = (s) => console.log(`\n${B}${s}${OFF}`);

const git = (args, { quiet = true } = {}) =>
  spawnSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit" });

/* ── 0. יש git בכלל? ──────────────────────────────────────────────────────── */
step("0️⃣  בדיקת Git");
const version = git(["--version"]);
if (version.error || version.status !== 0) {
  bad("git לא מותקן במחשב הזה.");
  console.log(`
  אפשר בלעדיו — פשוט מורידים את הגרסה החדשה כקובץ ZIP ומחלצים מעל התיקייה
  (או לתיקייה חדשה, ואז מעבירים אליה את data\\ ו-‎.env.local). ואז:  npm run setup
  הורדה: https://git-scm.com/downloads
`);
  process.exit(1);
}
ok(version.stdout.trim());

const inRepo = git(["rev-parse", "--is-inside-work-tree"]);
if (inRepo.status !== 0 || inRepo.stdout.trim() !== "true") {
  bad("התיקייה הזו היא לא מאגר Git (כנראה הורדת ZIP).");
  console.log(`
  אין מה לסנכרן — פשוט מורידים ZIP חדש ומריצים:  npm run setup
`);
  process.exit(1);
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
ok(`ענף: ${branch}`);

/* ── 1. שינויים מקומיים — לא מוחקים עבודה בשקט ────────────────────────────── */
step("1️⃣  שינויים מקומיים");
const dirty = git(["status", "--porcelain"]).stdout.trim();
if (dirty) {
  warn("יש שינויים שלא נשמרו ב-Git:");
  for (const line of dirty.split("\n").slice(0, 15)) console.log(`     ${line}`);
  if (!FORCE) {
    console.log(`
  לא נגעתי בכלום. שתי אפשרויות:
    • לשמור את השינויים:   git add -A && git commit -m "השינויים שלי"
    • לזרוק אותם:          npm run recover -- --force   (נשמר עותק ב-backup-uncommitted/)
`);
    process.exit(1);
  }
  const backupDir = path.join(ROOT, "backup-uncommitted", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(backupDir, { recursive: true });
  const patch = git(["diff", "HEAD"]).stdout;
  fs.writeFileSync(path.join(backupDir, "changes.patch"), patch ?? "");
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).stdout.trim();
  if (untracked) fs.writeFileSync(path.join(backupDir, "untracked-files.txt"), untracked + "\n");
  ok(`גיבוי השינויים שלך: ${path.relative(ROOT, backupDir)}`);
} else {
  ok("אין שינויים מקומיים — נקי");
}

if (CHECK_ONLY) {
  warn("--check — לא שיניתי כלום. הרץ בלי --check כדי לסנכרן.");
}

/* ── 2. סנכרון מ-origin ───────────────────────────────────────────────────── */
step("2️⃣  סנכרון הקוד");
if (CHECK_ONLY) {
  if (git(["fetch", "origin", "--dry-run"]).status === 0) ok("אפשר להתחבר ל-origin");
} else {
  const fetch = git(["fetch", "origin"], { quiet: false });
  if (fetch.status !== 0) {
    bad("לא הצלחתי להתחבר ל-origin (אינטרנט/הרשאות). המשך עם הקוד הקיים.");
    process.exit(1);
  }
  const target = `origin/${branch}`;
  const exists = git(["rev-parse", "--verify", target]);
  if (exists.status !== 0) {
    warn(`אין ${target} ב-origin — ממשיך מהענף המקומי`);
  } else {
    const before = git(["rev-parse", "--short", "HEAD"]).stdout.trim();
    const reset = git(["reset", "--hard", target], { quiet: false });
    if (reset.status !== 0) {
      bad("הסנכרון נכשל.");
      process.exit(1);
    }
    const after = git(["rev-parse", "--short", "HEAD"]).stdout.trim();
    ok(before === after ? `הקוד כבר מעודכן (${after})` : `עודכן ${before} → ${after}`);
  }
}

/* ── 3. השלמת מה שחסר ─────────────────────────────────────────────────────── */
step("3️⃣  השלמת הסביבה");
const setupArgs = ["scripts/local-setup.mjs", ...passThrough];
if (CHECK_ONLY) setupArgs.push("--check");
const setup = spawnSync(process.execPath, setupArgs, { cwd: ROOT, stdio: "inherit" });
process.exit(setup.status ?? 0);
