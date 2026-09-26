/**
 * בדיקות מצב חמקן (Stealth) — שהאתר והשרת לא ניתנים לאיתור.
 *
 *   npm test
 *
 * הבדיקות מרימות **שרת חמקן נפרד** על פורט אקראי, עם תצורה ומסד משלהם,
 * כדי לא לגעת בשרת הפיתוח/פרודקשן שרץ על 3000.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "TEST-ORIGIN-TOKEN-0123456789abcdef";

/* ──────────────────────────── בדיקות יחידה ──────────────────────────────── */

const { stealthDecision, makeCanary, saveStealth, loadStealth, decoyPage, stealthRobots } = await import(
  path.join(ROOT, "security/stealth.mjs")
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lt-stealth-"));
const configFile = path.join(tmpDir, "stealth.json");
const canary = makeCanary("unit");

const baseConfig = {
  ...loadStealth(configFile),
  enabled: "on",
  mode: "drop",
  originLock: "on",
  tokens: [TOKEN],
  canaries: [canary],
  allowLocalNoHeaders: "off",
};

saveStealth(baseConfig, configFile);

const request = (overrides = {}) => ({
  path: "/",
  query: "",
  method: "GET",
  host: "lemontank.co.il",
  userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/122 Safari/537.36",
  headerMap: {},
  headerCount: 12,
  headerBytes: 700,
  cookieBytes: 60,
  ip: "82.166.20.7",
  socketIp: "172.64.1.1", // כתובת של Cloudflare
  ...overrides,
});

const decide = (overrides) => stealthDecision(request(overrides), { file: configFile });

test("מצב חמקן: מבקר דרך CDN מתקבל כרגיל", () => {
  const res = decide({ headerMap: { "cf-connecting-ip": "82.166.20.7" } });
  assert.equal(res.action, "serve");
});

test("מצב חמקן: תוקף שמצא את כתובת השרת לא מקבל כלום", () => {
  const res = decide({ socketIp: "45.9.9.9", ip: "45.9.9.9", headerMap: {} });
  assert.equal(res.action, "drop");
  assert.equal(res.reason, "origin_lock_direct");
});

test("מצב חמקן: חיבור מקומי בלי סימן נחסם גם הוא (בלי דלת אחורית)", () => {
  const res = decide({ socketIp: "127.0.0.1", ip: "127.0.0.1", headerMap: {} });
  assert.equal(res.action, "drop");
  assert.equal(res.reason, "origin_lock_local_unmarked");
});

test("מצב חמקן: סימן סודי או עוגיית כניסה מאפשרים גישה", () => {
  assert.equal(decide({ headerMap: { "x-lt-origin": TOKEN } }).action, "serve");
  assert.equal(decide({ headerMap: { cookie: `lt_entry=${TOKEN}` } }).action, "serve");
  assert.equal(decide({ socketIp: "45.9.9.9", headerMap: { "x-lt-origin": TOKEN } }).action, "serve");
});

test("מצב חמקן: מלכודת (canary) מפילה גם בקשה תמימה-למראה", () => {
  const res = stealthDecision(request({ path: canary.path, headerMap: { "x-lt-origin": TOKEN } }), { file: configFile });
  assert.equal(res.action, "drop");
  assert.equal(res.reason, "canary");
  assert.equal(res.canary.path, canary.path);
});

test("מצב חמקן: כיבוי מחזיר את האתר לאוויר", () => {
  saveStealth({ ...baseConfig, enabled: "off" }, configFile);
  assert.equal(decide({ socketIp: "45.9.9.9" }).action, "serve");
  saveStealth(baseConfig, configFile);
});

test("עמוד ההסוואה נראה כמו שרת סטטי, בלי רמז לאפליקציה", () => {
  const html = decoyPage("Welcome to nginx!");
  assert.match(html, /Thank you for using nginx/);
  assert.doesNotMatch(html, /lemontank|next|react|__NEXT_DATA__/i);
});

test("robots.txt בחמקן חוסם הכול (ואופציונלית גם מפליל סורקים)", () => {
  const robots = stealthRobots({ robotsBait: "on" }, "/.well-known/bait");
  assert.match(robots, /Disallow: \//);
  assert.match(robots, /\.well-known\/bait/);
  assert.doesNotMatch(robots, /Sitemap/i);
});

/* ─────────────────── בדיקות אינטגרציה מול שרת חמקן חי ──────────────────── */

const hasBuild = fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"));
const skipIntegration = !hasBuild || process.env.SKIP_STEALTH_INTEGRATION === "1";

const freePort = async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
};

let child = null;
let port = 0;
const tmpDb = path.join(tmpDir, "stealth.db");

/** חיבור גולמי: שולח בקשת HTTP ומחזיר מה שהשרת ענה (או null אם החיבור נסגר בשקט) */
function rawRequest(targetPort, pathname, extraHeaders = {}, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: targetPort });
    let data = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(null));
    socket.on("connect", () => {
      const lines = [
        `GET ${pathname} HTTP/1.1`,
        `Host: 127.0.0.1:${targetPort}`,
        "Connection: close",
        "User-Agent: Mozilla/5.0 (Windows NT 10.0) Chrome/122 Safari/537.36",
        ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
        "",
        "",
      ];
      socket.write(lines.join("\r\n"));
    });
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      // "Connection: close" — קוראים עד שהשרת סוגר, עם תקרה כדי לא לצבור זבל
      if (data.length > 3 * 1024 * 1024) finish(data);
    });
    socket.on("close", () => finish(data || null));
    socket.on("error", () => finish(null));
  });
}

const statusOf = (raw) => (raw ? Number((raw.match(/^HTTP\/1\.[01] (\d{3})/) ?? [])[1]) : null);

if (!skipIntegration) {
  const realDb = path.join(ROOT, "data", "lemontank.db");
  if (fs.existsSync(realDb)) fs.copyFileSync(realDb, tmpDb);

  port = await freePort();
  const strictConfig = { ...loadStealth(configFile), requireTokenAlways: "on", dropHoldMs: 1200 };
  saveStealth(strictConfig, configFile);

  child = spawn(process.execPath, ["server.mjs"], {
    cwd: ROOT,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      DATABASE_FILE: tmpDb,
      STEALTH_FILE: configFile,
      STEALTH_ORIGIN_TOKEN: TOKEN,
      COOKIE_PREFIX: "s7kq2x",
      APP_SECRET: "test-secret-for-stealth-tests-0123456789",
      COOKIE_SECURE: "false",
      TRUST_PROXY: "true",
    },
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();
  const killChild = () => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch { /* ignore */ }
    }
  };
  process.on("exit", killChild);
  process.on("SIGINT", () => {
    killChild();
    process.exit(130);
  });

  // ממתינים לעלייה (עד 90 שניות)
  const deadline = Date.now() + 90_000;
  for (;;) {
    const raw = await rawRequest(port, "/", { "x-lt-origin": TOKEN, "cf-connecting-ip": "82.166.20.7" }, 4000);
    if (raw || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 400));
  }
}

const AUTH = { "x-lt-origin": TOKEN, "cf-connecting-ip": "82.166.20.7" };
const it = (name, fn) => test(name, { skip: skipIntegration }, fn);

it("שרת חמקן: בקשה בלי סימן לא מקבלת שום תשובה (כמו פורט סגור)", async () => {
  const raw = await rawRequest(port, "/", { "cf-connecting-ip": "45.9.9.9", "x-forwarded-for": "45.9.9.9" }, 6000);
  assert.equal(raw, null, `התקבלה תשובה במקום היעלמות: ${String(raw).slice(0, 80)}`);
});

it("שרת חמקן: מבקר דרך ה-CDN מקבל את האתר", async () => {
  const raw = await rawRequest(port, "/", AUTH, 15000);
  assert.equal(statusOf(raw), 200);
  assert.ok(raw.includes("<html"));
});

it("שרת חמקן: אין זכר ל-Next.js בקוד שנשלח לדפדפן", async () => {
  const raw = await rawRequest(port, "/", AUTH, 15000);
  assert.ok(raw, "התקבלה תשובה");
  const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
  assert.equal(body.includes("/_next/"), false, "נתיבי /_next/ חייבים להיות מוסווים");
  const prefix = loadStealth(configFile).assetPrefix;
  assert.ok(prefix, "נוצרה תחילית נכסים אקראית");
  assert.ok(body.includes(`/${prefix}/`), "הנכסים מוגשים תחת התחילית המוסווית");
});

it("שרת חמקן: דפדפן שדורש gzip מקבל את הדף המלא (בלי גוף קרוע)", async () => {
  // דפדפנים תמיד שולחים Accept-Encoding — בעבר ההסוואה השחיתה תשובה דחוסה
  const raw = await rawRequest(port, "/", { ...AUTH, "accept-encoding": "gzip, deflate, br" }, 15000);
  assert.equal(statusOf(raw), 200);
  const head = raw.split("\r\n\r\n")[0].toLowerCase();
  assert.doesNotMatch(head, /content-encoding: (gzip|br|deflate)/, "הגוף חייב להגיע בלתי-דחוס כשמסווטים אותו");
  const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
  assert.ok(body.includes("</html>"), "הדף הושלם — לא גוף קטוע");
});

it("שרת חמקן: ה-bootstrap של React מוסווה והנכסים מסונכרנים", async () => {
  const raw = await rawRequest(port, "/", AUTH, 15000);
  const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
  assert.equal(body.includes("__next_f"), false, "שם ה-bootstrap המקורי לא אמור להופיע");
  const alias = loadStealth(configFile).bootstrapAlias;
  assert.ok(alias && alias !== "off", "נוצר שם מוסווה");
  assert.ok(body.includes(`self.${alias}=self.${alias}||[]`), "ה-HTML משתמש בשם המוסווה");
  // וכל הצ'אנקים שהדפדפן טוען מוסווים באותו שם בדיוק — אחרת האתר נשבר
  const chunkUrls = [...new Set(body.match(/\/_[a-f0-9]{8}\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.(?:js|css)/g) ?? [])].slice(0, 10);
  assert.ok(chunkUrls.length > 0, "נמצאו נתיבי צ'אנקים מוסווים");
  let seenAlias = false;
  for (const url of chunkUrls) {
    const chunk = await rawRequest(port, url, AUTH, 15000);
    assert.equal(statusOf(chunk), 200, `הצ'אנק ${url} לא נטען`);
    assert.equal(chunk.includes("__next_f"), false, `הצ'אנק ${url} לא מוסווה`);
    if (chunk.includes(alias)) seenAlias = true;
  }
  assert.ok(seenAlias, "השם המוסווה מופיע בצ'אנק שהדפדפן טוען — סנכרון מלא");
});

it("שרת חמקן: /admin מוסתר כ-404 (לא מסגיר שמערכת ניהול קיימת)", async () => {
  const raw = await rawRequest(port, "/admin", AUTH, 15000);
  assert.equal(statusOf(raw), 404);
  assert.doesNotMatch(raw.split("\r\n\r\n")[0], /location:/i);
});

it("שרת חמקן: אין אינדוקס, אין כותרות מזהות ואין שמות פלטפורמה", async () => {
  const raw = await rawRequest(port, "/", AUTH, 15000);
  const head = raw.split("\r\n\r\n")[0].toLowerCase();
  assert.match(head, /x-robots-tag: noindex/);
  assert.doesNotMatch(head, /x-powered-by/);
  assert.doesNotMatch(head, /^server:/m);
  assert.doesNotMatch(head, /e2b|arena\.ai|vercel/);
  assert.match(head, /content-security-policy: .*frame-ancestors 'self'/);
});

it("שרת חמקן: כותרות התשובה לא מסגירות את הפריימוורק", async () => {
  const raw = await rawRequest(port, "/", AUTH, 15000);
  const head = raw.split("\r\n\r\n")[0];
  assert.doesNotMatch(head, /next|rsc|react/i, "כותרות שמסגירות את הפריימוורק");
  // Vary נשאר רק עם אסימונים תמימים (למשל Accept-Encoding) — בלי שמות של Next.js
  const vary = (head.match(/^vary:\s*(.+)$/im) ?? [])[1];
  if (vary) {
    const allowed = /^(accept-encoding|accept|cookie|origin)$/i;
    for (const token of vary.split(",").map((t) => t.trim())) {
      assert.ok(allowed.test(token), `אסימון Vary מזהה פריימוורק: ${token}`);
    }
  }
});

it("שרת חמקן: שמות העוגיות אינם מסגירים את המערכת", async () => {
  const raw = await rawRequest(port, "/", AUTH, 15000);
  const cookies = [...raw.matchAll(/set-cookie:\s*([^=\r\n]+)=/gi)].map((m) => m[1].trim());
  assert.ok(cookies.length > 0, "אמורה להיקבע עוגיית CSRF ראשונית");
  for (const name of cookies) {
    assert.ok(!name.startsWith("lt_"), `שם עוגייה מזהה: ${name}`);
    assert.match(name, /^s7kq2x_/, "הקידומת מגיעה מההגדרה");
  }
});

it("שרת חמקן: כניסה עם סימן בכתובת מגדירה עוגייה ומנקה את הכתובת", async () => {
  const raw = await rawRequest(port, `/?lt_entry=${TOKEN}`, { "cf-connecting-ip": "82.166.20.7", "x-lt-origin": TOKEN }, 15000);
  assert.equal(statusOf(raw), 302);
  assert.match(raw, /location: \//i);
  assert.match(raw.toLowerCase(), /set-cookie: s7kq2x_entry=/);
});

it("שרת חמקן: מלכודת נרשמת, נחסמת לצמיתות והחיבור מושתק", async () => {
  const trap = loadStealth(configFile).canaries[0].path;
  const raw = await rawRequest(port, trap, { "x-forwarded-for": "45.9.9.9", "cf-connecting-ip": "45.9.9.9" }, 6000);
  assert.equal(raw, null, "מלכודת לא אמורה להשיב");
  await new Promise((r) => setTimeout(r, 500));
});

/* ─────────────── בדיקות ההסוואה החדשה (זהות, נתיבים, אורקל) ───────────────── */

it("שרת חמקן: כניסה עם סימן בכתובת בלבד (בלי כותרת) עובדת", async () => {
  /**
   * רגרסיה לבאג אמיתי: בדיקת הסימן ישבה בשלב מאוחר מדי — אחרי שהבקשה
   * כבר הושלכה בשקט. כלומר הקישור היחיד שנועד להכניס את הבעלים פנימה
   * נחסם בעצמו, ומי שהפעיל חמקן ננעל בחוץ בלי דרך חזרה.
   */
  const raw = await rawRequest(port, `/?lt_entry=${TOKEN}`, { "cf-connecting-ip": "82.166.20.7" }, 15000);
  assert.equal(statusOf(raw), 302, "בקשה עם סימן בכתובת חייבת להיענות");
  assert.match(raw, /set-cookie: s7kq2x_entry=/i, "הסימן מגדיר עוגיית מעבר");
});

it("שרת חמקן: אין אף זכר לשם המערכת או לפריימוורק בגוף הדף", async () => {
  const raw = await rawRequest(port, "/", AUTH, 15000);
  const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
  const forbidden = [
    [/lemontank/i, "שם המערכת באנגלית"],
    [/לימונטנק|לימון\s*טנק/, "שם המערכת בעברית"],
    [/__next_f|_next\/static/, "טביעת Next"],
    [/self\.__next/, "bootstrap של Next"],
    [/\bwebpack\b/i, "טביעת webpack"],
    [/static\/chunks/, "תיקיית נכסים של webpack"],
    [/\$Sreact/, "סמל RSC של React"],
    [/next-error-h1/, "מחלקת CSS פנימית של Next"],
    [/data-precedence/, "מנגנון precedence של Next"],
  ];
  for (const [pattern, label] of forbidden) {
    assert.doesNotMatch(body, pattern, `נשאר בגוף הדף: ${label}`);
  }
  assert.match(body, /Northwind Media/, "שם ההסוואה מוצג במקום שם המערכת");
});

it("שרת חמקן: כל נכס שהדף מבקש נטען (ההסוואה לא שוברת את האתר)", async () => {
  const raw = await rawRequest(port, "/", AUTH, 15000);
  const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
  const assets = [...new Set(body.match(/\/_[a-f0-9]{8}\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.(?:js|css)/g) ?? [])];
  assert.ok(assets.length >= 5, `נמצאו ${assets.length} נכסים — ציפינו ליותר`);
  for (const url of assets) {
    const asset = await rawRequest(port, url, AUTH, 15000);
    assert.equal(statusOf(asset), 200, `הנכס המוסווה ${url} לא נטען`);
  }
});

it("שרת חמקן: ‎/admin זהה לחלוטין לכתובת שאינה קיימת (אין אורקל מיפוי)", async () => {
  /**
   * הבדיקה שמכסה את הבאג הגדול: קודם ‎/admin החזיר עמוד 404 מקוצר משלו
   * (כ-100 בתים) בעוד כל כתובת דמיונית מקבלת את ה-404 הרגיל (כ-12 אלף
   * בתים) — כלומר ההסתרה עצמה הייתה טביעת אצבע שאומרת "כאן יש משהו".
   * עכשיו: אותו סטטוס, אותו גודל, אותו תוכן.
   */
  const normalize = (raw) => (raw ?? "").replace(/nonce="[^"]*"/g, 'nonce=""');
  const hidden = await rawRequest(port, "/admin", AUTH, 15000);
  const fake = await rawRequest(port, "/abcde", AUTH, 15000);
  assert.equal(statusOf(hidden), 404);
  assert.equal(statusOf(hidden), statusOf(fake));
  assert.equal(normalize(hidden).length, normalize(fake).length, "גודל התשובה שונה — זו טביעת אצבע");
  assert.doesNotMatch(hidden.split("\r\n\r\n")[0], /location:/i);
});

/* ────────────────────────── יחידות: שכבת ההסוואה ─────────────────────────── */

it("הסוואה: שם המערכת מוחלף בכל הצורות (אנגלית, עברית, רישיות)", async () => {
  const { coverBrand, DEFAULT_BRAND_COVER } = await import(path.join(ROOT, "security/stealth.mjs"));
  const text = "LemonTank Stream · lemontank · LemonTank · לימונטנק · לימון טנק";
  const out = coverBrand(text, { brandCover: "" });
  assert.doesNotMatch(out, /lemontank|לימון/i);
  assert.match(out, new RegExp(DEFAULT_BRAND_COVER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(coverBrand(text, { brandCover: "Acme TV" }), "Acme TV · Acme TV · Acme TV · Acme TV · Acme TV");
});

it("הסוואה: החלפת שמות פנימיים היא דו-כיוונית (הנכס חוזר לשרת בשלום)", async () => {
  const { coverTokens, uncoverPath, generateAliases, aliasesComplete } = await import(path.join(ROOT, "security/stealth.mjs"));
  const aliases = generateAliases();
  assert.ok(aliasesComplete(aliases), "המילון שנוצר חייב להיות מלא");
  const config = { tokenAliases: aliases };
  for (const original of [
    "/_next/static/chunks/webpack-e85dfe.js",
    "/_next/static/chunks/main-app-cf85ff.js",
    "/_next/static/chunks/polyfills-42372e.js",
    "/_next/static/css/043f431e.css",
    "/api/x?q=webpack",
  ]) {
    const masked = coverTokens(original, config);
    // ‎/_next/ מוחלף בשכבת השרת (תחילית אקראית), לא כאן — כאן נבדקים השמות הפנימיים
    assert.doesNotMatch(masked, /webpack|static\/chunks|main-app|polyfills/, `לא הוסווה: ${original}`);
    assert.equal(uncoverPath(masked, config), original, `ההיפוך נכשל עבור ${original}`);
  }
  /**
   * ההיפוך המלא בדיוק כמו שהשרת עושה: הנתיב בגוף התשובה (אחרי תחילית
   * אקראית + החלפת שמות פנימיים) חייב להיות זהה לכתובת שהדפדפן יבקש —
   * אחרת הדף נטען בלי CSS/JS, וזו הצורה השכיחה של "ההסוואה שברה את האתר".
   */
  const prefix = "/_21cd1c17";
  const serverOriginal = "/_next/static/chunks/webpack-e85dfe.js";
  const expected = `${prefix}/${aliases["static/chunks"]}/${aliases.webpack}-e85dfe.js`;
  const bodyMasked = coverTokens(serverOriginal.replace("/_next/", `${prefix}/`), config);
  assert.equal(bodyMasked, expected, "הנתיב בגוף חייב להתאים לזה שהדפדפן מבקש");
  assert.equal(`/_next/${uncoverPath(expected.slice(prefix.length + 1), config)}`, serverOriginal, "הבקשה הנכנסת חייבת לחזור לנתיב המקורי");
});

it("הסוואה: החלפת שמות לא שוברת JSON (באג אמיתי שמנע תשובות תקינות)", async () => {
  /**
   * הרגרסיה: הדפוס ‎":"next" הוחלף בכל מקום שבו הופיע — כולל בנתוני האתר
   * (`"category":"next"`), וכך גוף JSON תקין הפך ל-`"categoryx1a2b"`.
   * כלומר ההסוואה הפילה בקשות API. הכלל שנקבע: מחליפים צירופים מלאים
   * (מפתח+ערך) של המסגרת, לעולם לא דפוסים גנריים של תוכן.
   */
  const { coverTokens, uncoverPath, generateAliases } = await import(path.join(ROOT, "security/stealth.mjs"));
  const config = { tokenAliases: generateAliases() };
  const payload = {
    category: "next",
    name: "webpack",
    lib: "react-dom",
    asset: "/_next/static/chunks/webpack-e85dfe.js",
    nested: { precedence: "next", items: ["next", "react.suspense"] },
  };
  const raw = JSON.stringify(payload);
  const masked = coverTokens(raw, config);
  const parsed = JSON.parse(masked); // אם זה זורק — ההסוואה שברה את הגוף
  assert.deepEqual(Object.keys(parsed), Object.keys(payload), "המפתחות חייבים להישאר זהים");
  assert.equal(parsed.category, "next", "ערך תוכן לא משתנה");
  assert.equal(parsed.nested.items[0], "next");
  assert.doesNotMatch(parsed.asset, /webpack|static\/chunks/, "נתיב נכס חייב להיות מוסווה");
  assert.equal(uncoverPath(parsed.asset, config), payload.asset, "הנתיב חייב לחזור לקדמותו");
});

it("שרת חמקן: תשובות API נשארות JSON תקין (ההסוואה לא נוגעת במבנה)", async () => {
  /**
   * זו הבדיקה שתפסה באג אמיתי: ההסוואה החליפה גם דפוסי תוכן
   * (`"category":"next"`) וכך הפכה גוף JSON תקין לשבור — כלומר האתר
   * החזיר תשובות פגומות. המבנה חייב לשרוד כל החלפה.
   */
  const response = await fetch(`http://127.0.0.1:${port}/api/plans`, {
    headers: { ...AUTH, ...(localStorageHeaders()) },
    redirect: "manual",
  });
  assert.equal(response.status, 200);
  const parsed = await response.json(); // אם הגוף שבור — כאן זה נכשל
  assert.equal(parsed.ok, true, "מבנה התשובה נשמר");
  assert.ok(Array.isArray(parsed.data?.plans ?? parsed.data), "רשימת המסלולים חזרה תקינה");
});

const localStorageHeaders = () => ({});

it("הסוואה: לכל התקנה אייקון סתמי משל עצמה (אין hash משותף שמקשר בין אתרים)", async () => {
  const { genericFavicon, genericManifest } = await import(path.join(ROOT, "security/stealth.mjs"));
  const hashes = new Set();
  for (let i = 0; i < 40; i += 1) hashes.add(genericFavicon(`seed-${i}`));
  assert.ok(hashes.size > 5, "האייקון חייב להשתנות בין התקנות");
  for (const svg of hashes) {
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /lemon|tank|לימון|next|react/i, "האייקון לא מסגיר דבר");
  }
  const manifest = JSON.parse(genericManifest());
  assert.equal(manifest.name, "Site");
  assert.doesNotMatch(JSON.stringify(manifest), /lemon|tank|לימון|admin|api/i);
});

it("הסוואה: allowLocalNoHeaders פועל רק על חיבור מהמכונה עצמה", async () => {
  const { stealthDecision } = await import(path.join(ROOT, "security/stealth.mjs"));
  const localFile = path.join(tmpDir, "local.json");
  saveStealth({ ...baseConfig, allowLocalNoHeaders: "on", originLock: "on" }, localFile);
  const withFile = (info) => stealthDecision(info, { file: localFile, headers: info.headerMap });

  // 1. לולאה, בלי זהות מועברת → משרת (זה המסלול של בעל האתר על המכונה)
  const loopback = withFile({ path: "/", method: "GET", ip: "127.0.0.1", socketIp: "127.0.0.1", host: "x", headerMap: { host: "x" } });
  assert.equal(loopback.action, "serve");

  // 2. תוקף מהאינטרנט — לא משרת גם כשהאפשרות דלוקה
  const external = withFile({ path: "/", method: "GET", ip: "203.0.113.9", socketIp: "203.0.113.9", host: "x", headerMap: { host: "x" } });
  assert.notEqual(external.action, "serve");

  // 3. כתובת פנימית שאינה לולאה (למשל קונטיינר אחר ברשת) — גם היא לא נהנית מההקלה
  const internal = withFile({ path: "/", method: "GET", ip: "10.1.2.3", socketIp: "10.1.2.3", host: "x", headerMap: { host: "x" } });
  assert.notEqual(internal.action, "serve");

  saveStealth(baseConfig, configFile);
});

test("ניקוי: סגירת שרת הבדיקה", () => {
  if (child) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch { /* ignore */ }
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
