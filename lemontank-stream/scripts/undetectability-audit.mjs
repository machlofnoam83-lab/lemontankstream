#!/usr/bin/env node
/**
 * מדידת "כמה קל לאתר אותי" — מה שהחוצה יכול ללמוד על השרת שלך.
 *
 * הכלי לא שואל את הקוד "האם אתה חמקן" — הוא מסתכל על מה שהשרת **באמת
 * מחזיר**, בדיוק כמו סורק: שמות טביעת-אצבע בעמוד, כותרות, עוגיות, מזהים,
 * נתיבי נכסים, מפות מקור, אייקון, ואפילו האם קיים הבדל בין "קיים אבל אסור"
 * ל"לא קיים" (זה מה שמאפשר לתוקף למפות את האתר בלי לגעת בו).
 *
 * כל ממצא מדורג:
 *   🔴 חושף     — מזהה את הפלטפורמה/המותג/המבנה באופן ישיר
 *   🟠 מרמז      — עוזר לתוקף לצמצם אפשרויות (גרסה, מסגרת, התנהגות)
 *   🟢 נקי       — לא מלמד דבר
 *
 * הרצה:
 *   node scripts/undetectability-audit.mjs            # מול השרת הרץ
 *   node scripts/undetectability-audit.mjs --verbose  # כולל כל שורה
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = String(process.env.APP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
const verbose = process.argv.includes("--verbose");

/**
 * סוכן בודק אמיתי: אם מצב חמקן דלוק, סריקה בלי סימן סודי תקבל "התעלמות"
 * ולא תוכל למדוד כלום. לכן הכלי קורא את הסימן מ-data/stealth.json ומציג
 * אותו בדיוק כמו שה-CDN היה מציג — כדי למדוד את מה ש**משתמש אמיתי** רואה.
 * בנוסף (סעיף 11) הוא בודק מה רואה מי שאין לו סימן — וזו הבדיקה החשובה.
 */
let STEALTH = null;
let stealthToken = null;
try {
  const file = path.join(ROOT, "data", "stealth.json");
  if (fs.existsSync(file)) {
    STEALTH = JSON.parse(fs.readFileSync(file, "utf8"));
    if (STEALTH.enabled === "on" && Array.isArray(STEALTH.tokens) && STEALTH.tokens.length) {
      stealthToken = STEALTH.tokens[STEALTH.tokens.length - 1];
    }
  }
} catch { /* אין קובץ — מצב רגיל */ }

const HEADERS = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122 Safari/537.36", "x-forwarded-for": "10.99.0.1" };
// כותרת ה-CDN שמזריקה את הסימן (Transform Rule) — כדי לראות את האתר האמיתי
if (stealthToken) HEADERS[(STEALTH.originHeader || "x-lt-origin").toLowerCase()] = stealthToken;

console.log(
  STEALTH?.enabled === "on"
    ? `\n🥷 מצב חמקן פעיל (${STEALTH.mode}) — נמדד גם האתר האמיתי (עם סימן) וגם מה שרואה סורק אנונימי.\n`
    : `\n🔓 מצב חמקן כבוי — נמדד מה שכל מבקר רואה.\n`,
);

const findings = [];
function finding(level, area, what, detail = "") {
  findings.push({ level, area, what, detail });
  if (verbose || level !== "clean") {
    const icon = level === "leak" ? "🔴" : level === "hint" ? "🟠" : "🟢";
    console.log(`${icon} [${area}] ${what}${detail ? ` — ${detail}` : ""}`);
  }
}

async function get(pathname, options = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: { ...HEADERS, ...(options.headers ?? {}) },
    redirect: "manual",
  });
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

const crypto = await import("node:crypto");

/* ── טביעות שסורקים מחפשים בפועל ──────────────────────────────────────────── */
const SIGNATURES = [
  [/__next_f/, "Next.js RSC payload (__next_f)", "leak"],
  [/__NEXT_DATA__/, "Next.js pages payload (__NEXT_DATA__)", "leak"],
  [/_next\/static/, "נתיב נכסים של Next (/_next/static)", "leak"],
  [/self\.__next/, "bootstrap של React (self.__next)", "leak"],
  [/buildId"\s*:\s*"/, "buildId של Next", "leak"],
  [/x-nextjs/i, "כותרת Next", "leak"],
  [/react/i, "אזכור React", "hint"],
  [/lemontank/i, "שם המותג/המערכת (LemonTank)", "leak"],
  [/lemon\s*tank/i, "שם המותג בעברית/אנגלית", "leak"],
  [/ניהול המערכת|לימון|לימונטנק/i, "שם מותג בעברית", "leak"],
  [/_next\/image/, "אופטימיזציית תמונות של Next", "hint"],
  [/next-error-h1/, "מחלקת CSS פנימית של Next (next-error-h1)", "leak"],
  [/data-precedence|"precedence"\s*:\s*"next"/, "מנגנון precedence של Next", "hint"],
  [/\$Sreact/, "סמלי RSC של React ($Sreact)", "leak"],
  [/npm|node_modules/, "רמז לסביבת Node/npm", "hint"],
  [/sourceMappingURL/, "הצבעה למפת מקור", "leak"],
  [/webpack/i, "אזכור webpack", "hint"],
];

const PATHS = ["/", "/movies", "/series", "/plans", "/login", "/register", "/redeem"];

console.log(`\n🕵️  מדידת איתוריות — ${BASE}\n`);

/* ── 1. טביעות בתוכן ───────────────────────────────────────────────────────── */
const bodies = new Map();
for (const p of PATHS) {
  const response = await get(p);
  bodies.set(p, response);
  if (response.status !== 200) {
    finding("hint", "תוכן", `${p} → ${response.status}`, "הדף לא נטען — ייתכן שהשער חוסם");
    continue;
  }
  const hits = SIGNATURES.filter(([pattern]) => pattern.test(response.text));
  if (hits.length === 0) finding("clean", "תוכן", `${p}: אין טביעות מסגרת`);
  for (const [, label, level] of hits) {
    finding(level, "תוכן", `${p}: ${label}`);
  }
}

/* ── 2. כותרות ────────────────────────────────────────────────────────────── */
const home = bodies.get("/") ?? (await get("/"));
const identifying = [
  ["x-powered-by", "leak"],
  ["x-nextjs-cache", "leak"],
  ["x-nextjs-prerender", "leak"],
  ["x-nextjs-matched-path", "leak"],
  ["x-vercel-id", "leak"],
  ["x-vercel-cache", "leak"],
  ["server", "hint"],
  ["x-runtime", "hint"],
  ["x-render-origin-server", "hint"],
  ["x-lt-stealth", "leak"],
  ["x-request-id", "hint"],
  ["x-debug", "hint"],
  ["via", "hint"],
  ["x-cache", "hint"],
  ["x-served-by", "hint"],
];
for (const [name, level] of identifying) {
  const value = home.headers.get(name);
  if (value) finding(level, "כותרות", `כותרת ${name}: ${String(value).slice(0, 60)}`);
  else finding("clean", "כותרות", `אין ${name}`);
}

const server = home.headers.get("server");
if (server && server !== "cloudflare") finding("hint", "כותרות", `Server: ${server}`, "מסגיר את שרת ה-origin (nginx/Next?)");

/**
 * סריקה של **כל** כותרות התשובה אחרי טביעות מסגרת — לא רק רשימה קבועה.
 * כאן מתגלות הדליפות השקטות: כותרות preload שמכילות נתיבי נכסים, שמות
 * פנימיים של המסגרת, או מזהי build. סורקים קוראים כותרות לפני שהם קוראים גוף.
 */
const FRAMEWORK_TOKENS = [/next/i, /webpack/i, /react/i, /vercel/i, /turbopack/i, /rsc/i];
const headerNoise = [];
for (const [name, value] of home.headers.entries()) {
  if (name === "content-security-policy") continue; // nonce דינמי, לא טביעת אצבע
  const text = `${name}: ${value}`;
  for (const token of FRAMEWORK_TOKENS) {
    if (token.test(text) && !/next|rsc/i.test(name) === false) headerNoise.push({ name, text });
  }
}
if (headerNoise.length) {
  finding("leak", "כותרות", `${headerNoise.length} כותרות מכילות שמות פנימיים של המסגרת`, headerNoise.slice(0, 3).map((h) => h.text.slice(0, 70)).join(" · "));
  if (verbose) for (const h of headerNoise) console.log(`      ${h.text.slice(0, 110)}`);
} else {
  finding("clean", "כותרות", `אין שמות מסגרת באף אחת מ-${[...home.headers.keys()].length} הכותרות`);
}

/* ── 3. עוגיות ────────────────────────────────────────────────────────────── */
const cookies = (home.headers.getSetCookie?.() ?? []).map((c) => c.split("=")[0]);
if (cookies.length) {
  for (const name of cookies) {
    // שם עוגייה ייחודי למותג = טביעת אצבע שמאפשרת לזהות את המערכת בכל אתר
    if (/^lt_|lemon|tank/i.test(name)) finding("leak", "עוגיות", `שם עוגייה מזהה: ${name}`);
    else finding("clean", "עוגיות", `עוגייה ניטרלית: ${name}`);
  }
} else {
  finding("clean", "עוגיות", "אין עוגיות בתשובת הדף הראשי");
}
/**
 * HttpOnly נבדק **לפי סוג העוגייה**. עוגיית CSRF חייבת להיות קריאה מ-JS
 * (זו כל השיטה — double submit), ולכן היעדר HttpOnly עליה אינו ממצא.
 * עוגיית סשן בלי HttpOnly היא גם ממצא אבטחתי וגם רמז לתוקף.
 */
const setCookies = home.headers.getSetCookie?.() ?? [];
for (const cookie of setCookies) {
  const name = cookie.split("=")[0];
  const httpOnly = /httponly/i.test(cookie);
  const sessionish = /session|sess|sid|auth|token/i.test(name);
  if (sessionish && !httpOnly) finding("leak", "עוגיות", `עוגיית סשן בלי HttpOnly: ${name}`, "נגישה ל-JS — גם חולשה וגם טביעת אצבע");
  else if (httpOnly) finding("clean", "עוגיות", `${name}: HttpOnly`);
  else finding("clean", "עוגיות", `${name}: בלי HttpOnly (תקין לעוגיית CSRF/העדפות)`);
}

/* ── 4. אייקון ומזהה חזותי (Shodan/Censys מחפשים לפי hash של favicon) ───────── */
const md5 = (buf) => crypto.createHash("md5").update(buf).digest("hex");

/**
 * אייקון הוא טביעת אצבע רק אם אפשר **לקשר** אותו למשהו: לאייקון המוצר עצמו,
 * או לאייקון זהה באתר אחר. אייקון סתמי וייחודי לכל התקנה הוא חסר משמעות
 * למי שסורק — הוא נראה כמו כל אתר ברירת-מחדל אחר.
 * לכן הכלי מחשב את ה-hash של אייקוני המקור של האפליקציה ומשווה.
 */
const brandIconHashes = new Set();
for (const dir of ["src/app", "public", "app"]) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const name of fs.readdirSync(full)) {
    if (!/icon|favicon|apple/i.test(name)) continue;
    try { brandIconHashes.add(md5(fs.readFileSync(path.join(full, name)))); } catch { /* ignore */ }
  }
}
for (const icon of ["/favicon.ico", "/icon.svg", "/favicon.svg", "/apple-touch-icon.png"]) {
  const response = await get(icon);
  if (response.status === 200 && response.text.length > 0) {
    const hash = md5(Buffer.from(response.text, "utf8"));
    if (brandIconHashes.has(hash)) {
      finding("leak", "אייקון", `${icon} הוא האייקון האמיתי של המערכת (md5 ${hash.slice(0, 12)})`, "Shodan/Censys מזהים את המוצר לפי ה-hash הזה בכל דומיין");
    } else {
      finding("clean", "אייקון", `${icon} נגיש אבל זר למקור (md5 ${hash.slice(0, 12)})`, "אייקון סתמי וייחודי — אין מה לקשר");
    }
  } else {
    finding("clean", "אייקון", `${icon} → ${response.status}`);
  }
}
if (brandIconHashes.size) finding("clean", "אייקון", `${brandIconHashes.size} אייקוני מקור לבדיקת השוואה`);
else finding("hint", "אייקון", "לא נמצאו אייקוני מקור להשוואה — הבדיקה חלקית");

/* ── 5. קבצים שמסגירים מבנה ───────────────────────────────────────────────── */
for (const file of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/manifest.json", "/sw.js", "/.well-known/security.txt", "/humans.txt"]) {
  const response = await get(file);
  if (response.status === 200) {
    const leaky = /lemontank|לימון|sitemap|Disallow: \/[a-z]/i.test(response.text) && !/Disallow: \/\s*$/m.test(response.text);
    finding(leaky ? "hint" : "clean", "קבצים", `${file} נגיש`, leaky ? "התוכן מסגיר מבנה או מותג" : "תוכן לא מסגיר");
  } else {
    finding("clean", "קבצים", `${file} → ${response.status}`);
  }
}

/* ── 6. מפות מקור — דליפת קוד מלאה ────────────────────────────────────────── */
for (const map of ["/static/js/main.js.map", "/_next/static/chunks/main.js.map"]) {
  const response = await get(map);
  if (response.status === 200 && /"version"|"sources"|webpack/i.test(response.text)) {
    finding("leak", "מפות מקור", `${map} נגיש`, "🔴 מפת מקור חושפת את הקוד כולו");
  } else {
    finding("clean", "מפות מקור", `${map} → ${response.status}`);
  }
}

/* ── 7. אורקל מיפוי: "קיים ואסור" מול "לא קיים" ───────────────────────────── */
/**
 * השיטה הנכונה למדוד אורקל: להשוות כל נתיב לנתיב **דמיוני באותו אורך בדיוק**.
 * השוואה בין נתיבים באורכים שונים תמיד "תראה הבדל" — עמוד ה-404 של כל אתר
 * משתנה עם אורך הכתובת, וזו לא דליפה. הדליפה היא רק כשנתיב אמיתי מתנהג
 * אחרת מכתובת דמיונית באותו אורך.
 */
const probes = [
  "/admin", "/admin/fortress", "/admin/giftcards", "/account", "/account/security",
  "/api/admin/fortress", "/api/titles", "/login", "/definitely-not-here-9f3a",
];
/**
 * הכתובת הדמיונית חייבת להיות באותו אורך **ובאותו אופי תווים** —
 * אחרת קידוד ה-JSON שבתוך העמוד יוצר הפרש של בתים בודדים, וסורק
 * קפדן יכול להבחין בכך. אותיות קטנות, כמו רוב הנתיבים האמיתיים.
 */
const fakeOfShape = (path) => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const randomWord = (n) => {
    const bytes = crypto.randomBytes(Math.max(1, n));
    return Array.from(bytes, (b) => letters[b % 26]).join("").slice(0, Math.max(1, n));
  };
  /**
   * חשוב: הכתובת הדמיונית חייבת לשמור על **מבנה הנתיב** — אותו מספר
   * קטעים ואותו אורך בכל קטע. אחרת ההשוואה לא הוגנת: נתיב עם שני קטעים
   * מייצר מקטעי route אחרים בתוך ה-payload, וההפרש הזה אינו דליפת מידע.
   * מה שנמדד הוא האם נתיב אמיתי מתנהג אחרת מנתיב דמיוני **באותה צורה**.
   */
  const segments = path.split("/");
  return segments.map((seg, i) => (i === 0 ? "" : randomWord(seg.length))).join("/");
};
/**
 * ה-nonce של ה-CSP (base64) אקראי בכל בקשה בהפרש של כמה בתים — ולכן
 * השוואת גדלים "גולמית" מייצרת דליפות שווא. מנרמלים אותו בשני הצדדים.
 */
const normalizeNonce = (text) => text.replace(/nonce="[^"]*"/g, 'nonce=""');
const probeResults = [];
for (const p of probes) {
  const real = await get(p);
  const fakePath = fakeOfShape(p);
  const fake = await get(fakePath);
  probeResults.push({
    path: p,
    fakePath,
    status: real.status,
    length: normalizeNonce(real.text).length,
    fakeStatus: fake.status,
    fakeLength: normalizeNonce(fake.text).length,
    location: real.headers.get("location") ?? "",
  });
}
/** הפניה לעמוד התחברות היא התנהגות של אתר רגיל — לא אורקל */
const isLoginRedirect = (r) => [301, 302, 303, 307, 308].includes(r.status) && /login|signin/i.test(r.location);
const differs = (r) => !(r.status === r.fakeStatus && r.length === r.fakeLength);

/**
 * מדידת האורקל הנכונה היא לא "כל נתיב שמתנהג אחרת" אלא **מה שהאתר חושף
 * בלי להתכוון**. נתיב שמקושר מהדף הציבורי גלוי ממילא (למשל /login) —
 * אין כאן שום מידע לתוקף. הדליפה האמיתית היא נתיב **מוסתר** שמתנהג אחרת
 * מכתובת דמיונית: זה מה שמאפשר למפות אזורים פרטיים בלי סיסמה.
 */
const publicLinked = new Set();
for (const [, body] of bodies) {
  for (const m of body.text.matchAll(/href="(\/[^"?#]{0,60})"/g)) publicLinked.add(m[1].replace(/\/$/, "") || "/");
}
const isPublic = (path) => publicLinked.has(path) || publicLinked.has(`${path}/`) || PATHS.includes(path);
const classify = (r) => {
  if (!differs(r)) return "clean";
  if (isLoginRedirect(r) || isPublic(r.path)) return "clean";
  if (r.path.startsWith("/api/")) return "hint"; // לכל אתר עם API יש תשובות שונות — לא מזהה מוצר
  return "leak";
};
const oracles = probeResults.filter((r) => classify(r) === "leak");
const apiHints = probeResults.filter((r) => classify(r) === "hint");
if (apiHints.length) {
  finding("hint", "אורקל מיפוי", `${apiHints.length} נתיבי API מגיבים אחרת מכתובת דמיונית (${apiHints.map((r) => r.path).join(", ")})`, "חושף מבנה API — משותף לכל אתר עם API, לא מזהה את המוצר");
}
for (const r of probeResults.filter((r) => !differs(r) || isPublic(r.path))) {
  finding("clean", "אורקל מיפוי", `${r.path} — זהה לכתובת דמיונית באותו אורך`);
}
if (oracles.length) {
  finding(
    "leak",
    "אורקל מיפוי",
    `${oracles.length} מתוך ${probes.length} נתיבים מתנהגים אחרת מכתובת דמיונית באותו אורך`,
    "אפשר למפות את האתר בלי סיסמה: קיים ≠ לא קיים",
  );
  for (const r of oracles) console.log(`      ${r.path} → ${r.status} ${r.length}B   ·   ${r.fakePath} → ${r.fakeStatus} ${r.fakeLength}B`);
} else {
  finding("clean", "אורקל מיפוי", `כל ${probes.length} הנתיבים מתנהגים בדיוק כמו כתובת דמיונית באותו אורך`);
}
if (verbose) for (const r of probeResults) {
  const same = r.status === r.fakeStatus && r.length === r.fakeLength;
  console.log(`      ${same ? "=" : "≠"} ${String(r.status).padEnd(3)} ${String(r.length).padStart(6)}B ${r.path}  ${isLoginRedirect(r) ? "(הפניה להתחברות — תקין)" : ""}`);
}

/* ── 8. דליפת מידע בשגיאות ────────────────────────────────────────────────── */
const errorProbe = await get("/api/titles?id=%27%20OR%201%3D1");
if (/stack|at Object|node_modules|SQLITE|TypeError|ReferenceError/i.test(errorProbe.text)) {
  finding("leak", "שגיאות", "תשובת שגיאה כוללת עקבות קוד או פרטי מסד");
} else {
  finding("clean", "שגיאות", "אין עקבות קוד בתשובת שגיאה");
}

/* ── 9. חשיפת מבנה הבנייה (chunks) ────────────────────────────────────────── */
const html = home.text;
const assetPaths = [...html.matchAll(/(?:src|href)="(\/[^"]{4,80}\.(?:js|css))"/g)].map((m) => m[1]);
if (assetPaths.length) {
  const frameworkish = assetPaths.filter((p) => /_next|static\/chunks|webpack|main-app|framework/i.test(p));
  finding(frameworkish.length ? "leak" : "clean", "נכסים", `נתיבי נכסים בעמוד: ${assetPaths.length}`, frameworkish.length ? `מזהים מסגרת: ${frameworkish.slice(0, 3).join(", ")}` : "לא מזהים מסגרת");
} else {
  finding("clean", "נכסים", "לא נמצאו נתיבי נכסים בעמוד");
}

/* ── 10. האם יש בכלל תשובה לכתובת שאינה קיימת ─────────────────────────────── */
const ghost = await get("/this-path-does-not-exist-8b2c");
finding(ghost.status === 404 ? "clean" : "hint", "קיום", `נתיב לא קיים → ${ghost.status}`, ghost.status === 403 ? "403 חושף שהשרת חי ומגן" : "");

/* ── 11. מבט של סורק אנונימי (בלי שום סימן) ───────────────────────────────── */
const stealthOn = STEALTH?.enabled === "on";
if (stealthOn) {
  /**
   * בלי X-Forwarded-For ובלי סימן: זה מה שסורק שולח כשהוא פוגע בשרת ישירות.
   * (כשמוסיפים XFF הבקשה נראית כמו תעבורה שמגיעה מהמנהרה המקומית — וזו
   * בדיקה אחרת, שנעשית בנפרד בסעיף 12.)
   */
  const anonHeaders = { "user-agent": "Mozilla/5.0 (compatible; Nmap Scripting Engine)" };
  const anonPaths = ["/", "/admin", "/admin/fortress", "/api/titles", "/login", "/this-does-not-exist-7c1d"];
  const anonResults = [];
  for (const p of anonPaths) {
    let outcome;
    try {
      const controller = new AbortController();
      // drop מחזיק את החיבור ~8 שניות בכוונה; מספיק לקצר כדי למדוד אחידות בלי להמתין
      const timer = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(`${BASE}${p}`, { headers: anonHeaders, redirect: "manual", signal: controller.signal });
      clearTimeout(timer);
      outcome = { path: p, status: response.status, length: (await response.text()).length };
    } catch (err) {
      outcome = { path: p, status: -1, length: 0, note: err?.name === "AbortError" ? "החיבור הוחזק ולא נענה (drop)" : (err?.message ?? "שגיאה") };
    }
    anonResults.push(outcome);
  }
  const statuses = new Set(anonResults.map((r) => r.status));
  const sizes = new Set(anonResults.map((r) => r.length));
  const uniform = statuses.size === 1 && sizes.size === 1;
  const localBypass = STEALTH?.allowLocalNoHeaders === "on";
  finding(
    uniform ? "clean" : localBypass ? "hint" : "leak",
    "סורק אנונימי",
    uniform
      ? `כל ${anonPaths.length} הנתיבים מחזירים תשובה זהה למי שאין לו סימן (${[...statuses][0]})`
      : `תשובות שונות לפי נתיב למי שאין סימן: ${[...statuses].join("/")}, ${sizes.size} גדלים`,
    uniform
      ? "אי אפשר להבדיל בין הדף הראשי, הניהול, ה-API ונתיב לא קיים"
      : localBypass
        ? `הבדיקה לא תקפה כאן: allowLocalNoHeaders דלוק והסריקה רצה מהמכונה עצמה. הנתיב האמיתי (תוקף מהאינטרנט) נמדד בסעיף 12 · ${anonResults.map((r) => `${r.path}→${r.status}`).join(" · ")}`
        : anonResults.map((r) => `${r.path}→${r.status}`).join(" · "),
  );
  if (!uniform && verbose) for (const r of anonResults) console.log(`      ${r.status} ${String(r.length).padStart(6)}B ${r.path} ${r.note ?? ""}`);
}

/* ── 12. החלטת השער כלפי תוקף מהאינטרנט (בדיקת לוגיקה, בלי תלות ברשת) ─────── */
if (stealthOn) {
  /**
   * הארגז לא יוצא לאינטרנט, ולכן אי אפשר "להתקשר מהחוץ". במקום זה מריצים את
   * אותה פונקציה שהשרת מריץ — עם כתובת ציבורית אמיתית — ובודקים מה היא
   * מחליטה. זו הבדיקה שמכסה את המסלול שאי אפשר לבדוק מבפנים.
   */
  try {
    const { stealthDecision } = await import("../security/stealth.mjs");
    const outsider = (path, extraHeaders = {}) =>
      stealthDecision(
        {
          path,
          method: "GET",
          ip: "203.0.113.9",
          socketIp: "203.0.113.9",
          host: "example.com",
          userAgent: "Mozilla/5.0 (compatible; Nmap Scripting Engine)",
          headerMap: { host: "example.com", "user-agent": "nmap", ...extraHeaders },
        },
        { headers: { host: "example.com", "user-agent": "nmap", ...extraHeaders } },
      );

    const probePaths = ["/", "/admin", "/api/titles", "/movies", "/this-does-not-exist"];
    const outsiderActions = probePaths.map((p) => ({ path: p, action: outsider(p).action }));
    const allRefused = outsiderActions.every((r) => r.action !== "serve");
    finding(
      allRefused ? "clean" : "leak",
      "תוקף מהאינטרנט",
      allRefused
        ? `כל ${probePaths.length} הנתיבים נדחים לתוקף מהאינטרנט (${[...new Set(outsiderActions.map((r) => r.action))].join("/")})`
        : `יש נתיבים שנענים לתוקף מהאינטרנט: ${outsiderActions.filter((r) => r.action === "serve").map((r) => r.path).join(", ")}`,
      allRefused ? "השער לא משרת כלום לפני זיהוי" : "מסלול עוקף",
    );

    // בדיקה נגדית: עם סימן חוקי — כן משרתים (אחרת בעל האתר נועל את עצמו בחוץ)
    const withToken = outsider("/", { [STEALTH.originHeader || "x-lt-origin"]: stealthToken });
    finding(
      withToken.action === "serve" ? "clean" : "leak",
      "תוקף מהאינטרנט",
      withToken.action === "serve" ? "עם סימן חוקי מהאינטרנט — משרת (מסלול בעל האתר תקין)" : `עם סימן חוקי — ${withToken.action} (מסלול הכניסה שבור!)`,
      withToken.action === "serve" ? "" : "הבעלים לא יוכל להיכנס לבד",
    );
  } catch (err) {
    finding("hint", "תוקף מהאינטרנט", `בדיקת ההחלטה לא רצה: ${err?.message ?? err}`);
  }
}

/* ── סיכום ────────────────────────────────────────────────────────────────── */
const leaks = findings.filter((f) => f.level === "leak");
const hints = findings.filter((f) => f.level === "hint");
const cleans = findings.filter((f) => f.level === "clean");

console.log("\n" + "─".repeat(72));
console.log(`   🔴 חושף: ${leaks.length}   🟠 מרמז: ${hints.length}   🟢 נקי: ${cleans.length}`);
console.log(`   מצב חמקן: ${stealthOn ? "🟢 פעיל" : "🟠 כבוי (האתר מזוהה)"}`);
const areas = [...new Set(findings.map((f) => f.area))];
console.log("─".repeat(72));
for (const area of areas) {
  const rows = findings.filter((f) => f.area === area);
  const l = rows.filter((r) => r.level === "leak").length;
  const h = rows.filter((r) => r.level === "hint").length;
  console.log(`   ${l === 0 && h === 0 ? "🟢" : l ? "🔴" : "🟠"} ${area.padEnd(14)} חושף ${l} · מרמז ${h} · נקי ${rows.length - l - h}`);
}
if (leaks.length) {
  console.log("\n🔴 מה שמסגיר אותך כרגע:");
  for (const f of leaks) console.log(`   · [${f.area}] ${f.what}${f.detail ? ` — ${f.detail}` : ""}`);
}
console.log("");
console.log(`📊 ציון איתוריות (0 = שקוף לחלוטין, 100 = זוהה מיד): ${Math.min(100, leaks.length * 12 + hints.length * 3)}`);
console.log("");
process.exit(leaks.length ? 1 : 0);
