#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  "האתר לא נפתח" — בדיקה שאומרת בדיוק מה המצב ומה לעשות
 *
 *  ERR_CONNECTION_REFUSED (או "לא ניתן להתחבר") פירושו בדרך כלל דבר אחד:
 *  **אין שרת שרץ על הפורט הזה**. הסקריפט הזה בודק את הפורטים המוכרים,
 *  מדווח אם האתר רץ ואיפה, ואם לא — אומר בדיוק איזו פקודה להריץ.
 *
 *  הרצה:
 *    npm run status            # בדיקה ידידותית
 *    npm run status -- --json  # פלט מכונה
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { databaseFile, inspectDatabase } from "./lib/db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 3010, 3020, 8080];

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = (c) => (useColor ? `\u001b[${c}m` : "");
const B = C("1"), G = C("32"), Y = C("33"), R = C("31"), OFF = C("0");

async function probe(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200), redirect: "manual" });
    const type = res.headers.get("content-type") ?? "";
    let isLemonTank = false;
    if (type.includes("text/html")) {
      const body = await res.text();
      isLemonTank = /לימונטנק|LemonTank/i.test(body);
    }
    return { port, up: true, isLemonTank, status: res.status };
  } catch {
    return { port, up: false, isLemonTank: false, status: null };
  }
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => {
      if (!entry || entry.family !== "IPv4" || entry.internal) return false;
      if (entry.address.startsWith("169.254.")) return false;
      const [a, b] = entry.address.split(".").map(Number);
      return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    })
    .map((entry) => entry.address)
    .sort((x, y) => Number(y.startsWith("192.168.")) - Number(x.startsWith("192.168.")));
}

const results = await Promise.all(PORTS.map(probe));
const running = results.filter((r) => r.up);
const ourSite = running.find((r) => r.isLemonTank) ?? running[0] ?? null;

const hasBuild = fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"));
const dbInfo = inspectDatabase(databaseFile(ROOT));
const hasDb = dbInfo.state === "ready";
const hasEnv = fs.existsSync(path.join(ROOT, ".env.local"));
const hasDeps = fs.existsSync(path.join(ROOT, "node_modules", "next"));

if (JSON_OUT) {
  console.log(JSON.stringify({ running: ourSite, allListening: running.map((r) => r.port), hasBuild, hasDb, hasEnv, hasDeps }, null, 2));
  process.exit(0);
}

console.log(`\n${B}🍋 מצב האתר${OFF}`);

if (ourSite?.isLemonTank) {
  console.log(`  ${G}✓${OFF} האתר רץ עכשיו:  ${B}http://localhost:${ourSite.port}${OFF}`);
  const lan = lanAddresses();
  if (lan.length) console.log(`  ${G}✓${OFF} מהטלפון באותה רשת: ${lan.map((ip) => `http://${ip}:${ourSite.port}`).join("  ·  ")}`);
  console.log(`\n  כניסת מנהל: admin@lemontank.local / ChangeMe-Admin-2026!`);
} else if (running.length) {
  console.log(`  ${Y}!${OFF} יש שירות אחר מאזין על: ${running.map((r) => r.port).join(", ")}`);
  console.log(`    אבל זה לא LemonTank. הרץ את האתר:`);
  console.log(`      ${B}npm run start${OFF}      (או קליק כפול על START-HERE-WINDOWS.cmd)`);
} else {
  console.log(`  ${R}✗${OFF} אין שרת שרץ כרגע — **זו הסיבה שהדפדפן אומר "לא ניתן להתחבר".**`);
  console.log(`      localhost:3000 נענה רק כשהאתר רץ. סגירת החלון = האתר נופל.`);
  console.log(`\n  איך להעלות:`);
  if (!hasDeps || !hasBuild || !hasDb || !hasEnv) {
    console.log(`      ${B}npm run setup${OFF}     (משלים מה שחסר: חבילות/סודות/מסד/בנייה)`);
  }
  console.log(`      ${B}npm run start${OFF}     ואז לגלוש ל-http://localhost:3000`);
  console.log(`      או קליק כפול על ${B}START-HERE-WINDOWS.cmd${OFF} — הוא גם פותח את הדפדפן.`);

  if (dbInfo.state === "empty") {
    console.log(`\n  ${R}!${OFF} קובץ המסד קיים אבל חסר לו סכימת האפליקציה (users/titles) —`);
    console.log(`      האתר לא יעלה במצב הזה. התיקון:`);
    console.log(`        ${B}node scripts/seed.mjs --reset${OFF}   ואז  ${B}npm run setup${OFF}`);
  }
  const missing = [];
  if (!hasDeps) missing.push("חבילות (node_modules)");
  if (!hasEnv) missing.push("סודות (.env.local)");
  if (dbInfo.state === "missing") missing.push("מסד (data/lemontank.db)");
  if (!hasBuild) missing.push("בנייה (.next)");
  if (missing.length) console.log(`\n  חסר כרגע: ${missing.join(" · ")}`);
}

console.log("");
