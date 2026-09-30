#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  שומר סף — מפעיל את האתר ומחזיר אותו לחיים לבד
 *
 *  הבעיה שהוא פותר: "לא ניתן לגשת לאתר הזה · ERR_CONNECTION_REFUSED".
 *  הסיבה כמעט תמיד זהה — **אין תהליך שרץ על הפורט**. או שהחלון נסגר,
 *  או שהמחשב הופעל מחדש, או שהשרת קרס בשקט. ברגע שאין תהליך, הדפדפן
 *  מקבל "סירוב חיבור" ואין למי לפנות.
 *
 *  מה עושה הסקריפט הזה, בלולאה אינסופית:
 *    1. מאתר פורט פנוי (או מזהה שהאתר כבר רץ) — כדי שלא יהיה EADDRINUSE.
 *    2. מפעיל את `server.mjs` ישירות עם node (לא דרך npm.cmd — שם הייתה
 *       התקלה הישנה בווינדוס).
 *    3. כל 10 שניות דופק על /api/health.
 *    4. אם אין תשובה 3 פעמים ברצף, או שהתהליך מת — מפעיל מחדש לבד,
 *       עם השהיה שהולכת וגדלה (3 → 5 → 10 → 20 → 30 שניות).
 *    5. כותב כל החלפה לקובץ data/watchdog.log כדי שאפשר יהיה לראות מה קרה.
 *
 *  הרצה:
 *    node scripts/watchdog.mjs            # שמירה רציפה (מה שהמפעיל מריץ)
 *    node scripts/watchdog.mjs --once     # בדיקה חד-פעמית: רץ/לא רץ, ויוצא
 *    node scripts/watchdog.mjs --port 3000
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "server.mjs");
const LOG_FILE = path.join(ROOT, "data", "watchdog.log");

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const portArgIndex = args.indexOf("--port");
const WANTED_PORT = portArgIndex >= 0 ? Number(args[portArgIndex + 1]) : Number(process.env.PORT ?? 3000);

/** פורטים מוכרים — חייבים להיות תואמים ל-server.mjs ול-pick-port.mjs */
const CANDIDATES = [WANTED_PORT, 3001, 3002, 3003, 3004, 3005, 3010, 3020, 8080].filter(
  (p, i, all) => Number.isFinite(p) && p > 0 && all.indexOf(p) === i,
);

const HEALTH_TIMEOUT_MS = 2500;
const CHECK_EVERY_MS = 10_000;
const RESTART_BACKOFF_MS = [3_000, 5_000, 10_000, 20_000, 30_000];

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = (c) => (useColor ? `\u001b[${c}m` : "");
const B = C("1"), G = C("32"), Y = C("33"), R = C("31"), OFF = C("0");

const stamp = () => new Date().toLocaleTimeString("he-IL", { hour12: false });

/** כתיבה ללוג — לא מפילה את התהליך אם הקובץ חסום */
function log(line) {
  const text = `[${new Date().toISOString()}] ${line}`;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, text + "\n");
  } catch {
    /* הלוג הוא בונוס, לא חובה */
  }
}

const say = (mark, color, message) => console.log(`${color}${mark}${OFF} ${message}`);

/** האם הפורט פנוי להאזנה */
const portIsFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "0.0.0.0");
  });

/** האם על הפורט הזה עונה אתר של LemonTank (ולא תוכנה אחרת) */
async function isOurSite(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      headers: { "user-agent": "LemonTank-Watchdog/1.0" },
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.ok === true;
  } catch {
    return false;
  }
}

/** מוצא את מצב האתר: פורט פעיל, או פורט פנוי להפעלה */
async function resolvePort() {
  for (const port of CANDIDATES) {
    if (await isOurSite(port)) return { port, running: true };
  }
  for (const port of CANDIDATES) {
    if (await portIsFree(port)) return { port, running: false };
  }
  return { port: null, running: false, allBusy: true };
}

/* ────────────────────────────── מצב --once ────────────────────────────── */

if (ONCE) {
  const state = await resolvePort();
  if (state.running) {
    say("✔", G, `האתר רץ עכשיו על http://localhost:${state.port}`);
    process.exit(0);
  }
  if (state.allBusy) {
    say("✗", R, "כל הפורטים המוכרים תפוסים — לא הצלחתי להפעיל.");
    process.exit(1);
  }
  say("•", Y, `האתר לא רץ. פורט פנוי להפעלה: ${state.port}`);
  process.exit(2);
}

/* ────────────────────────────── שמירה רציפה ────────────────────────────── */

if (!fs.existsSync(SERVER)) {
  say("✗", R, `לא נמצא ${SERVER} — ודא שהקובץ הזה נמצא בתיקיית הפרויקט.`);
  process.exit(1);
}

// בדיקה מוקדמת: בלי בנייה (.next) השרת ייפול מיד בכל הפעלה.
// עדיף לומר את זה פעם אחת, במפורש, מלהפעיל אותו שוב ושוב לשווא.
if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  say("✗", R, "אין בנייה (.next חסר) — קודם בונים, ואז מריצים.");
  console.log(`
${B}מה עושים — אחת מהשתיים:${OFF}

  1. הכנה מלאה (מתקין, מייצר סודות, יוצר מסד ובונה):
         ${B}npm run setup${OFF}

  2. רק בנייה (אם כבר התקנת בעבר):
         ${B}npm run build${OFF}

  בלי בנייה, אפשר להריץ במצב פיתוח (איטי יותר, מתאים רק לבדיקה):
         ${B}npm run dev${OFF}
`);
  process.exit(1);
}

console.log("");
console.log(`${B}🍋 שומר הסף של LemonTank${OFF} — מפעיל את האתר, ומחזיר אותו לחיים לבד`);
console.log("");

let child = null;
let port = null;
let consecutiveFailures = 0;
let restarts = 0;
let stopping = false;
let fastExits = 0;
let startedAt = 0;

/** יציאה בתוך 8 שניות = השרת לא הספיק לעלות — כנראה תקלה קבועה (קונפיגורציה) */
const FAST_EXIT_MS = 8_000;
const FAST_EXIT_LIMIT = 3;

function startServer(chosenPort) {
  child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(chosenPort) },
    stdio: "inherit",
    windowsHide: false,
  });

  log(`הפעלה מחדש #${restarts} על פורט ${chosenPort} (pid ${child.pid})`);
  startedAt = Date.now();
  child.on("exit", (code, signal) => {
    if (stopping) return;
    const why = signal ? `אות ${signal}` : `קוד ${code}`;
    const lived = Date.now() - startedAt;

    if (lived < FAST_EXIT_MS) {
      fastExits += 1;
      if (fastExits >= FAST_EXIT_LIMIT) {
        stopping = true;
        clearInterval(beat);
        say("✗", R, "השרת נפל שלוש פעמים ברצף מיד עם העלייה — זו תקלה קבועה, לא נפילה זמנית.");
        console.log(`
${B}מה עושים:${OFF}

  1. הרץ דוח מלא, ושלח לי אותו:
         ${B}npm run doctor -- --report${OFF}
     (נוצר קובץ lemontank-report.txt)

  2. או פתח את השרת ידנית כדי לראות את השגיאה בעיניים:
         ${B}npm run start${OFF}

  כל מה שקרה עד כאן נשמר ב: data/watchdog.log
`);
        log(`נעצר אחרי ${fastExits} יציאות מהירות — כנראה תקלה קבועה`);
        process.exit(1);
      }
    } else {
      fastExits = 0;
    }

    say("⟳", Y, `השרת נעצר (${why}) — מפעיל אותו מחדש...`);
    log(`השרת נעצר: ${why} (חי ${Math.round(lived / 1000)}s)`);
    scheduleRestart();
  });
}

function scheduleRestart() {
  if (stopping) return;
  const delay = RESTART_BACKOFF_MS[Math.min(restarts, RESTART_BACKOFF_MS.length - 1)];
  restarts += 1;
  setTimeout(async () => {
    if (stopping) return;
    const state = await resolvePort();
    if (state.running) {
      // מישהו כבר הקים תהליך אחר — לא מכפילים
      port = state.port;
      consecutiveFailures = 0;
      fastExits = 0;
      say("✔", G, `האתר חזר לאוויר על http://localhost:${port}`);
      log(`האתר חזר על פורט ${port} (תהליך קיים)`);
      return;
    }
    port = state.port ?? port;
    if (!port) {
      say("✗", R, "אין פורט פנוי — מנסה שוב בעוד חצי דקה.");
      restarts += 1;
      scheduleRestart();
      return;
    }
    startServer(port);
  }, delay);
}

/* הפעלה ראשונה */
{
  const state = await resolvePort();

  if (state.running) {
    port = state.port;
    say("✔", G, `האתר כבר רץ על http://localhost:${port} — ממשיך להשגיח עליו.`);
    say("•", Y, "אם הדפדפן עוד מראה שגיאה — רענן עם Ctrl+F5.");
  } else if (state.allBusy) {
    say("✗", R, "כל הפורטים המוכרים תפוסים. סגור תוכנות אחרות ופתח שוב.");
    process.exit(1);
  } else {
    port = state.port;
    say("•", G, `מפעיל את האתר על פורט ${port}...`);
    startServer(port);
  }
}

/* דופק בריאות */
const beat = setInterval(async () => {
  if (stopping) return;

  if (port && (await isOurSite(port))) {
    if (consecutiveFailures > 0) {
      say("✔", G, `האתר עונה שוב (http://localhost:${port}).`);
      log("האתר עונה שוב");
    }
    consecutiveFailures = 0;
    return;
  }

  consecutiveFailures += 1;
  if (consecutiveFailures < 3) return;

  consecutiveFailures = 0;
  say("⟳", Y, "האתר לא ענה שלוש פעמים ברצף — מפעיל אותו מחדש.");
  log("אין תשובת דופק — הפעלה מחדש");
  try {
    child?.kill();
  } catch {
    /* כבר מת */
  }
  child = null;
  scheduleRestart();
}, CHECK_EVERY_MS);

/* סגירה מסודרת */
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
    clearInterval(beat);
    log(`נסגר לפי ${sig}`);
    say("•", Y, "סוגר את האתר בצורה מסודרת...");
    try {
      child?.kill(sig);
    } catch {
      /* כבר סגור */
    }
    setTimeout(() => process.exit(0), 1200);
  });
}

process.on("uncaughtException", (err) => {
  log(`שגיאה לא צפויה: ${err?.stack ?? err}`);
  say("✗", R, `שגיאה לא צפויה — ממשיך לשמור: ${err?.message ?? err}`);
});

console.log("");
console.log(`${B}האתר מוגן מכאן.${OFF} החלון הזה יכול להישאר מאחור — האתר חי כל עוד הוא פתוח.`);
console.log(`פירוט מלא של כל הפעלה מחדש נשמר ב: data/watchdog.log`);
console.log(`כיבוי מסודר: Ctrl+C במסך הזה.`);
console.log("");
