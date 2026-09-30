#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  הפעלה אוטומטית עם הדלקת המחשב (ווינדוס / מאק)
 *
 *  הבעיה שהוא פותר: "ERR_CONNECTION_REFUSED" קורה כמעט תמיד כי פשוט אין
 *  תהליך שרץ. אחרי הפעלה מחדש של המחשב, או אחרי שסגרת את החלון — האתר נופל
 *  ואין מי שירים אותו. הסקריפט הזה מתקין הפעלה אוטומטית **פעם אחת**,
 *  ומכאן והלאה האתר עולה לבד עם עליית המערכת, עם שומר סף שמחזיר אותו לחיים.
 *
 *  הרצה:
 *    node scripts/install-autostart.mjs            # התקנה
 *    node scripts/install-autostart.mjs --status   # האם מותקן
 *    node scripts/install-autostart.mjs --remove   # הסרה
 *
 *  מה זה עושה בפועל (שקוף לחלוטין, בלי שירות מערכת ובלי הרשאות מנהל):
 *    ווינדוס → קובץ קטן בתיקיית ההפעלה האישית:
 *              %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
 *    מאק     → קובץ LaunchAgent ב-~/Library/LaunchAgents/
 *  אפשר למחוק את הקובץ הזה ידנית בכל רגע — זה כל מה שמותקן.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const STATUS = args.includes("--status");
const REMOVE = args.includes("--remove");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

const LABEL = "LemonTank Stream (אתר אוטומטי)";
const winFile = () => {
  const startup = path.join(
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
  );
  return path.join(startup, "LemonTank-Stream.cmd");
};
const macFile = () => path.join(os.homedir(), "Library", "LaunchAgents", "com.lemontank.stream.plist");

const target = IS_WIN ? winFile() : IS_MAC ? macFile() : null;

if (!target) {
  console.error("\n✗ הפעלה אוטומטית נתמכת בווינדוס ובמאק בלבד.\n");
  process.exit(1);
}

/* ─────────────────────────────── מצב ─────────────────────────────── */

if (STATUS) {
  if (fs.existsSync(target)) {
    console.log(`\n✔ הפעלה אוטומטית מותקנת.\n   הקובץ: ${target}\n   הסרה: npm run autostart -- --remove\n`);
    process.exit(0);
  }
  console.log(`\n• הפעלה אוטומטית לא מותקנת.\n   התקנה: npm run autostart\n`);
  process.exit(1);
}

/* ─────────────────────────────── הסרה ─────────────────────────────── */

if (REMOVE) {
  if (!fs.existsSync(target)) {
    console.log("\n• אין מה להסיר — לא מותקן.\n");
    process.exit(0);
  }
  fs.rmSync(target);
  if (IS_MAC) {
    console.log(`\n✔ הוסר: ${target}`);
    console.log("   אם האתר עוד רץ — הוא ייעצר בהפעלה הבאה של המחשב.\n");
    process.exit(0);
  }
  console.log(`\n✔ הוסר. מכאן והלאה האתר לא יעלה לבד עם המחשב.\n`);
  process.exit(0);
}

/* ─────────────────────────────── התקנה ─────────────────────────────── */

// מוודאים שהאתר בנוי, אחרת ההפעלה האוטומטית תיתקל בשגיאה בשקט.
if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  console.error("\n✗ אין בנייה (.next חסר) — הרץ קודם:  npm run build\n");
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });

if (IS_WIN) {
  // CRLF — קובץ .cmd חייב סופי שורה של ווינדוס.
  const lines = [
    "@echo off",
    "chcp 65001 >nul",
    `cd /d "${ROOT}"`,
    "title LemonTank Stream",
    ":: עולה עם המחשב, בשקט, עם שומר סף שמחזיר את האתר לחיים לבד.",
    "node scripts\\watchdog.mjs >nul 2>&1",
  ];
  fs.writeFileSync(target, lines.join("\r\n") + "\r\n", { encoding: "utf8" });
} else {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.lemontank.stream</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${path.join(ROOT, "scripts", "watchdog.mjs")}</string>
  </array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(ROOT, "data", "watchdog.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(ROOT, "data", "watchdog.log")}</string>
</dict>
</plist>
`;
  fs.writeFileSync(target, plist, { encoding: "utf8" });
}

console.log(`
✔ הותקן: הפעלה אוטומטית עם הדלקת המחשב

   הקובץ:  ${target}

   מה יקרה מעכשיו: בכל הדלקה של המחשב, האתר יעלה לבד מאחורי הקלעים,
   ועם שומר סף שמחזיר אותו לחיים אם הוא נופל. הדפדפן לא ייפתח לבד —
   פשוט גלוש ל-http://localhost:3000 כשתרצה.

   לביטול:  npm run autostart -- --remove
`);
