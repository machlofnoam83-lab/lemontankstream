#!/usr/bin/env node
/**
 * פותח את הדפדפן ברגע שהאתר באמת מוכן — במקום "הדף לא נמצא" שלוקח לו שנייה.
 * ממתין עד לקבלת תשובה מהשרת (כל תשובה = השרת חי), ואז פותח חלון דפדפן.
 *
 *   node scripts/open-later.mjs                      # http://localhost:3000
 *   node scripts/open-later.mjs http://localhost:4000
 *   node scripts/open-later.mjs --dry-run            # בלי לפתוח דפדפן (לבדיקות)
 */
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const url = args.find((a) => a.startsWith("http")) ?? "http://localhost:3000";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function serverIsUp() {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2500) });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
}

function openBrowser(target) {
  if (dryRun) {
    console.log(`[dry-run] הייתי פותח: ${target}`);
    return;
  }
  const [cmd, cmdArgs] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", target]]
      : process.platform === "darwin"
        ? ["open", [target]]
        : ["xdg-open", [target]];
  try {
    spawn(cmd, cmdArgs, { detached: true, stdio: "ignore" }).unref();
  } catch {
    console.log(`פתח ידנית: ${target}`);
  }
}

const deadline = Date.now() + 90_000;
let ready = false;
while (Date.now() < deadline) {
  if (await serverIsUp()) {
    ready = true;
    break;
  }
  await sleep(1000);
}

if (ready) {
  console.log(`האתר עלה — פותח את הדפדפן: ${url}`);
  openBrowser(url);
} else if (dryRun) {
  console.log(`[dry-run] השרת לא ענה תוך 90 שניות — הייתי פותח בכל זאת: ${url}`);
} else {
  console.log(`השרת עדיין לא ענה. פתח ידנית בדפדפן: ${url}`);
}
