#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  דוקטור — "האתר לא נפתח? בוא נמצא את הסיבה האמיתית"
 *
 *  הסקריפט הזה לא מנחש: הוא **מריץ את השרת בפועל** על פורט פנוי, מחכה שיעלה,
 *  בודק שהוא עונה גם על IPv4 וגם על IPv6, ואז מכבה אותו. אם הוא לא עולה —
 *  מציג את השגיאה המדויקת וכן כותב דוח לקובץ שאפשר לשלוח.
 *
 *  הרצה:
 *    npm run doctor                # בדיקה מלאה + סיכום בעברית
 *    npm run doctor -- --report    # גם כותב lemontank-report.txt
 *    npm run doctor -- --json      # פלט מכונה
 *
 *  לא נוגע בשום דבר: לא במסד, לא בהגדרות, לא בקבצים (חוץ מדוח אם ביקשת).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const args = process.argv.slice(2);
const WANT_REPORT = args.includes("--report");
const JSON_OUT = args.includes("--json");

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const CC = (c) => (useColor ? `\u001b[${c}m` : "");
const B = CC("1"), G = CC("32"), Y = CC("33"), R = CC("31"), OFF = CC("0");

const lines = [];
const say = (text = "") => { console.log(text); lines.push(text.replace(/\u001b\[\d+m/g, "")); };
const ok = (t) => say(`  ${G}✓${OFF} ${t}`);
const warn = (t) => say(`  ${Y}!${OFF} ${t}`);
const bad = (t) => say(`  ${R}✗${OFF} ${t}`);
const step = (t) => say(`\n${B}${t}${OFF}`);

const probeUrl = async (url, timeout = 2500) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: "manual" });
    const body = res.headers.get("content-type")?.includes("text/html") ? await res.text() : "";
    return { up: true, status: res.status, lemonTank: /לימונטנק|LemonTank/i.test(body) };
  } catch (error) {
    return { up: false, status: null, error: error?.cause?.code ?? error?.code ?? error?.name };
  }
};

const portFree = (port, host = "::") =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen({ port, host, ipv6Only: false });
  });

/* ── 1. סביבה ─────────────────────────────────────────────────────────────── */
step("1️⃣  סביבה");
const [maj, min] = process.versions.node.split(".").map(Number);
const nodeOk = maj >= 24 || (maj === 23 && min >= 4) || (maj === 22 && min >= 13);
(nodeOk ? ok : bad)(`Node v${process.versions.node}${nodeOk ? "" : " — נדרש 22.13+ (או 23.4+)"} · ${process.platform} ${os.release()}`);
ok(`תיקיית הפרויקט: ${ROOT}`);
say(`     CPU: ${os.cpus()?.[0]?.model ?? "?"} · RAM: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`);

const files = {
  "חבילות (node_modules)": fs.existsSync(path.join(ROOT, "node_modules", "next")),
  "סודות (.env.local)": fs.existsSync(path.join(ROOT, ".env.local")),
  "מסד (data/lemontank.db)": fs.existsSync(path.join(ROOT, "data", "lemontank.db")),
  "בנייה (.next)": fs.existsSync(path.join(ROOT, ".next", "BUILD_ID")),
};
step("2️⃣  קבצים נדרשים");
for (const [label, present] of Object.entries(files)) (present ? ok : warn)(`${label}${present ? "" : " — חסר (npm run setup ישלים)"}`);

/* ── 3. פורטים ────────────────────────────────────────────────────────────── */
step("3️⃣  פורטים");
const busy = [];
for (const port of [3000, 3001, 3002]) {
  const free = await portFree(port);
  if (free) say(`  · ${port} פנוי`);
  else busy.push(port);
}
const running = [];
for (const port of [3000, 3001, 3002]) {
  if (busy.includes(port)) {
    const check = await probeUrl(`http://127.0.0.1:${port}/`);
    if (check.up) running.push({ port, ...check });
  }
}
if (running.some((r) => r.lemonTank)) {
  const site = running.find((r) => r.lemonTank);
  ok(`האתר כבר רץ על הפורט ${site.port} — http://localhost:${site.port}`);
} else if (busy.length) {
  warn(`פורטים תפוסים: ${busy.join(", ")} (לא האתר הזה) — לא בעיה, השרת יבחר פורט אחר`);
} else {
  say("  · כל הפורטים המוכרים פנויים (אין שרת שרץ כרגע)");
}

/* ── 4. הרצה אמיתית של השרת ───────────────────────────────────────────────── */
step("4️⃣  מרים את השרת לבדיקה (20 שניות)…");
const testPort = 3899;
let serverLog = "";
let listenOk = false;
let siteAnswers = { ipv4: null, ipv6: null, localhost: null };

if (!(await portFree(testPort))) {
  warn(`הפורט ${testPort} תפוס — לא ניתן לבצע הרצת בדיקה`);
} else {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(testPort), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const collect = (chunk) => { serverLog += chunk.toString(); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await probeUrl(`http://127.0.0.1:${testPort}/`, 1500);
    if (res.up) { listenOk = true; break; }
    if (child.exitCode !== null) break; // השרת מת — אין טעם להמשיך לחכות
  }

  if (listenOk) {
    ok(`השרת עלה בהצלחה על הפורט ${testPort}`);
    const [v4, v6, lh] = await Promise.all([
      probeUrl(`http://127.0.0.1:${testPort}/`),
      probeUrl(`http://[::1]:${testPort}/`),
      probeUrl(`http://localhost:${testPort}/`),
    ]);
    siteAnswers = { ipv4: v4, ipv6: v6, localhost: lh };
    (v4.up ? ok : bad)(`IPv4 (127.0.0.1) → ${v4.up ? "עונה" : "לא עונה"}`);
    (v6.up ? ok : warn)(`IPv6 ([::1])     → ${v6.up ? "עונה" : "לא עונה (הדפדפן עדיין יעבוד דרך IPv4)"}`);
    (lh.up ? ok : bad)(`localhost        → ${lh.up ? "עונה" : "לא עונה"}`);
  } else {
    bad("השרת לא עלה — זו הסיבה ל-ERR_CONNECTION_REFUSED");
    const tail = serverLog.trim().split("\n").slice(-12).join("\n");
    if (tail) say(`\n${B}פלט השרת:${OFF}\n${tail}`);
    else warn("לא הייתה שום פלט מהשרת — ייתכן שהוא נחסם לפני שהתחיל");
  }

  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));
  if (child.exitCode === null) child.kill("SIGKILL");
}

/* ── 5. סיכום ─────────────────────────────────────────────────────────────── */
step("5️⃣  מה לעשות");
if (listenOk) {
  say(`  השרת תקין לחלוטין. כדי לגלוש:`);
  say(`    1. ${B}npm run start${OFF}   (השאר את החלון פתוח!)`);
  say(`    2. פתח בדפדפן: ${B}http://localhost:3000${OFF}`);
  if (running.some((r) => r.lemonTank)) say(`  (כרגע הוא כבר רץ — פשוט גלוש לכתובת למעלה)`);
} else if (!files["בנייה (.next)"]) {
  say(`  חסרה בנייה — הרץ: ${B}npm run setup${OFF}   (או: npm run build)`);
} else if (!files["חבילות (node_modules)"]) {
  say(`  חסרות חבילות — הרץ: ${B}npm run setup${OFF}`);
} else {
  say(`  השרת קיים אבל לא עולה — שלח לי את הדוח:`);
  say(`     ${B}npm run doctor -- --report${OFF}   → קובץ lemontank-report.txt`);
}

/* ── 6. דוח ───────────────────────────────────────────────────────────────── */
if (WANT_REPORT) {
  const reportPath = path.join(ROOT, "lemontank-report.txt");
  const report = [
    "=== LemonTank Stream — דוח דוקטור ===",
    `תאריך: ${new Date().toISOString()}`,
    `מערכת: ${process.platform} ${os.release()} (${os.arch()})`,
    `Node: ${process.versions.node} · npm: ${process.env.npm_config_user_agent ?? "?"}`,
    "",
    lines.join("\n"),
    "",
    "=== פלט השרת (הרצת בדיקה) ===",
    serverLog.trim() || "(אין פלט)",
    "",
    `=== בדיקות תשובה === IPv4=${siteAnswers.ipv4?.up} IPv6=${siteAnswers.ipv6?.up} localhost=${siteAnswers.localhost?.up}`,
  ].join("\n");
  fs.writeFileSync(reportPath, report);
  say(`\n📄 נכתב דוח: ${reportPath}`);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ nodeOk, files, busy, running, listenOk, siteAnswers }, null, 2));
}
