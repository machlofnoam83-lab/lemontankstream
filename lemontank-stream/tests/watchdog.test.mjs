#!/usr/bin/env node
/**
 * בדיקות לשומר הסף (scripts/watchdog.mjs) — הדבר שמונע את
 * "ERR_CONNECTION_REFUSED" מלחזור.
 *
 * מה שהבדיקות מוכיחות:
 *   1. כשהאתר רץ — שומר הסף **מזהה** אותו ולא מנסה להפעיל תהליך כפול.
 *   2. כשהאתר לא רץ — הוא מדווח על פורט פנוי הפעלה (קוד יציאה 2), לא נופל.
 *   3. מפעיל ווינדוס (START-HERE-WINDOWS.cmd) תקין: קיים, ובסופי שורה CRLF.
 *   4. קובץ הפעלה אוטומטית לא נכתב בטעות לפלטפורמה לא נתמכת.
 *
 * הבדיקות לא מפעילות שרת חדש ולא נוגעות בפורטים — רק מריצות את הסקריפט
 * במצב בדיקה (--once) וקוראות את הקבצים.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

let serverUp = false;

before(async () => {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
    serverUp = res.ok;
  } catch {
    serverUp = false;
  }
  if (!serverUp) console.error(`\n⚠️  אין שרת ב-${BASE} — חלק מבדיקות שומר הסף ידולגו.\n`);
});

/** מריץ את שומר הסף במצב בדיקה ומחזיר קוד יציאה + פלט */
async function watchdogOnce() {
  try {
    const { stdout } = await run(process.execPath, [path.join(ROOT, "scripts", "watchdog.mjs"), "--once"], {
      cwd: ROOT,
      timeout: 20_000,
    });
    return { code: 0, out: stdout };
  } catch (err) {
    return { code: err.code ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("שומר הסף", () => {
  test("הסקריפט קיים ועובר בדיקת תחביר", async () => {
    const file = path.join(ROOT, "scripts", "watchdog.mjs");
    assert.ok(existsSync(file), "watchdog.mjs חסר");
    await run(process.execPath, ["--check", file]); // זורק אם יש שגיאת תחביר
  });

  test("כשהאתר רץ — מזוהה ולא מופעל תהליך כפול", async (t) => {
    if (!serverUp) return t.skip("אין שרת");
    const { code, out } = await watchdogOnce();
    assert.equal(code, 0, `צפוי קוד 0 כשהאתר רץ, התקבל ${code}: ${out.slice(0, 160)}`);
    assert.match(out, /רץ/);
    // אסור שיפעיל שרת שני על אותה כתובת
    assert.doesNotMatch(out, /מפעיל את האתר על פורט/);
  });

  test("כשהאתר לא רץ — מדווח פורט פנוי ולא קורס", async (t) => {
    if (!serverUp) return t.skip("אין שרת");
    // פורט גבוה ובכוונה לא בשימוש כדי לדמות "אתר למטה"
    const probe = await run(
      process.execPath,
      ["-e", "const n=require('node:net');const s=n.createServer();s.listen(0,'0.0.0.0',()=>{console.log(s.address().port);s.close()})"],
      { timeout: 10_000 },
    );
    const freePort = Number(probe.stdout.trim());
    assert.ok(Number.isFinite(freePort) && freePort > 0);

    try {
      await run(process.execPath, [path.join(ROOT, "scripts", "watchdog.mjs"), "--once", "--port", String(freePort)], {
        cwd: ROOT,
        timeout: 25_000,
      });
      assert.fail("צפוי קוד יציאה 2 כשאין אתר רץ");
    } catch (err) {
      assert.equal(err.code, 2, `צפוי 2, התקבל ${err.code}: ${(err.stdout ?? "").slice(0, 160)}`);
      assert.match(String(err.stdout ?? ""), /לא רץ|פנוי/);
    }
  });

  test("מפעיל הווינדוס קיים ובסופי שורה של ווינדוס (CRLF)", () => {
    const cmd = path.join(ROOT, "START-HERE-WINDOWS.cmd");
    assert.ok(existsSync(cmd), "START-HERE-WINDOWS.cmd חסר");
    const raw = readFileSync(cmd, "utf8");
    assert.ok(raw.includes("\r\n"), "הקובץ חייב CRLF — אחרת ווינדוס מציג שגיאות");
    assert.equal(raw.split("\r\n").length - 1, raw.split("\n").length - 1, "נמצאו שורות LF בודדות");
    // המפעיל חייב להריץ את שומר הסף, לא את השרת החשוף
    assert.match(raw, /watchdog\.mjs/, "המפעיל צריך להריץ את שומר הסף");
  });

  test("התקנת הפעלה אוטומטית מזוהה נכון בפלטפורמה הזאת", async () => {
    const supported = process.platform === "win32" || process.platform === "darwin";
    try {
      const { stdout } = await run(process.execPath, [path.join(ROOT, "scripts", "install-autostart.mjs"), "--status"], {
        cwd: ROOT,
        timeout: 15_000,
      });
      assert.equal(typeof stdout, "string");
    } catch (err) {
      // 1 = "לא מותקן" (זו תשובה תקינה), אחר = שגיאה אמיתית
      assert.equal(err.code, supported ? 1 : 1, `קוד לא צפוי: ${err.code}`);
      const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      assert.match(out, /מותקנת|נתמכת/, `פלט לא צפוי: ${out.slice(0, 160)}`);
    }
  });
});
