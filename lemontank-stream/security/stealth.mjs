/**
 * מצב חמקן (Stealth) — להפוך את האתר והשרת לבלתי ניתנים לאיתור.
 *
 * הרעיון בשלוש שורות:
 *   1. **נעילת מקור** — השרת לא עונה לאף אחד חוץ מאשר ל-proxy/CDN המהימן
 *      (Cloudflare), שמעביר סימן סודי שהמבקר אינו יכול לזייף.
 *   2. **תגובה לא-מוכרת = היעלמות** — בקשה שלא עוברת את השער מקבלת
 *      "drop" (כמו פורט סגור בחומת אש) או "decoy" (עמוד nginx משעמם),
 *      במקום הודעה שמסגירה שיש כאן אפליקציה.
 *   3. **ניקוי טביעות אצבע** — בלי שמות עוגיות מזהים, בלי שמות פלטפורמה
 *      בכותרות, בלי sitemap, בלי אינדוקס, בלי דלת אחורית של /admin.
 *
 * המצב כבוי כברירת מחדל — מדליקים אותו רק אחרי שהאתר יושב מאחורי CDN,
 * אחרת אפשר לנעול את עצמך בחוץ. ראו STEALTH.md.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inAnyCidr, isInternal, isLoopback, normalizeIp } from "./net.mjs";

/* ─────────────────────────── טווחי Cloudflare ────────────────────────────── */
/** מקור: cloudflare.com/ips — מתעדכן ע"י scripts/stealth.mjs allow --cloudflare */
export const CLOUDFLARE_CIDRS = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

/** טווחי proxy/CDN נוספים — נוח להוסיף כאן או ב-CLI */
export const OTHER_PROXY_CIDRS = [
  // Google Cloud Load Balancer (כשהאתר מאחורי LB של GCP)
  "130.211.0.0/22", "35.191.0.0/16",
  // AWS CloudFront
  "120.52.22.96/27", "205.251.192.0/19", "54.182.0.0/16", "54.192.0.0/16",
  "54.230.0.0/16", "54.239.128.0/18", "54.240.128.0/18", "99.84.0.0/16",
  "13.32.0.0/15", "13.35.0.0/16", "52.84.0.0/15", "204.246.164.0/22",
];

const DEFAULT_CONFIG = {
  enabled: "off",              // on | off — המתג הראשי
  mode: "drop",                // drop = התעלמות מוחלטת · decoy = עמוד nginx משעמע · block = 403
  dropHoldMs: 8000,            // כמה זמן להחזיק חיבור "מת" (כמו פורט שמוגן בחומת אש)
  maxHeldDrops: 300,           // תקרה לחיבורים מוחזקים — מונע ניצול ל-DoS
  originLock: "on",            // דורש סימן סודי מ-CDN לפני שמשרתים בכלל
  allowLocalNoHeaders: "off",  // "on" = מאפשר גלישה מקומית בלי סימן (נוח לפיתוח, פחות חמקן)
  requireTokenAlways: "off",   // "on" = גם חיבורים "מהימנים" חייבים סימן
  originHeader: "x-lt-origin", // שם הכותרת שה-CDN מזריק (Transform Rule)
  requireForwardedBy: "on",    // דורש CF-Connecting-IP/X-Forwarded-For אמיתי
  tokens: [],                  // סימנים סודיים (rotate: מספר ערכים במקביל)
  allowCidrs: [],              // בנוסף ל-CDN: כתובות מורשות (משרד, VPS ניהול)
  decoyTitle: "Welcome to nginx!",
  adminHides404: "on",         // /admin לא מחזיר הפניה ל-login אלא 404
  minimalHeaders: "on",        // מצמצם כותרות-על ומסיר שמות פלטפורמה
  noindex: "on",               // X-Robots-Tag: noindex + robots.txt חסום
  robotsBait: "off",           // מלכודת בקבצי robots: נתיב מפתה + חסימה
  assetMask: "on",             // הסוואת /_next/ בתחילית אקראית
  assetPrefix: null,           // נוצר אוטומטית בהפעלה הראשונה
  bootstrapAlias: null,        // שם פנימי מוסווה ל-__next_f (נוצר אוטומטית)
  brandCover: "",              // שם מוסווה למותג בגוף התשובה (ריק = אוטומטי)
  faviconMask: "on",           // אייקון גנרי במקום אייקון שמזהה את האתר
  cookiePrefix: null,          // קידומת עוגיות אקראית (במקום lt_) — נוצרת אוטומטית
  tokenAliases: {},            // שמות פנימיים של המסגרת שמוחלפים בשמות סתמיים (נוצר אוטומטית)
  canaries: [],                // נתיבי מלכודת סודיים לאיתור דליפת השרת
  updatedAt: null,
};

const filePath = (explicit) =>
  explicit || process.env.STEALTH_FILE || path.join(process.env.APP_ROOT || process.cwd(), "data", "stealth.json");

let cache = { config: null, mtimeMs: 0, file: null };

/** טוען את תצורת החמקנות (עם מטמון לפי זמן שינוי הקובץ) */
export function loadStealth(explicit) {
  const file = filePath(explicit);

  const fromEnv = {};
  if (process.env.STEALTH_MODE) fromEnv.enabled = process.env.STEALTH_MODE.toLowerCase() === "on" ? "on" : "off";
  if (process.env.STEALTH_RESPONSE && ["drop", "decoy", "block"].includes(process.env.STEALTH_RESPONSE)) {
    fromEnv.mode = process.env.STEALTH_RESPONSE;
  }
  if (process.env.STEALTH_ORIGIN_TOKEN) fromEnv.tokens = [process.env.STEALTH_ORIGIN_TOKEN];

  try {
    if (!fs.existsSync(file)) {
      cache = { config: { ...DEFAULT_CONFIG, ...fromEnv }, mtimeMs: 0, file };
      return cache.config;
    }
    const stat = fs.statSync(file);
    if (cache.file === file && cache.mtimeMs === stat.mtimeMs) {
      return { ...cache.config, ...fromEnv };
    }
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const config = { ...DEFAULT_CONFIG, ...raw };
    config.tokens = Array.isArray(raw.tokens) ? raw.tokens.filter((t) => typeof t === "string" && t.length >= 16) : [];
    config.allowCidrs = Array.isArray(raw.allowCidrs) ? raw.allowCidrs.filter((c) => typeof c === "string") : [];
    config.canaries = Array.isArray(raw.canaries) ? raw.canaries : [];
    cache = { config, mtimeMs: stat.mtimeMs, file };
    return { ...config, ...fromEnv };
  } catch {
    return { ...DEFAULT_CONFIG, ...fromEnv };
  }
}

/** שמירת תצורת החמקנות (הקובץ לא נכנס ל-Git — ראו .gitignore) */
export function saveStealth(config, explicit) {
  const file = filePath(explicit);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const clean = { ...DEFAULT_CONFIG, ...config, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(clean, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows / הרשאות חסרות */
  }
  cache = { config: clean, mtimeMs: fs.statSync(file).mtimeMs, file };
  return clean;
}

/** האם מצב חמקן פעיל */
export const stealthEnabled = (file) => loadStealth(file).enabled === "on";

/* ─────────────────────────── מלכודות (Canary) ────────────────────────────── */

/**
 * יוצר "קנארי": כתובת סודית שאיש אינו אמור לבקש.
 * כל פנייה אליה = מישהו מצא את השרת (דליפת IP, סריקה אגרסיבית, או הדלפה פנימית).
 */
export function makeCanary(label = "host") {
  const id = crypto.randomBytes(6).toString("hex");
  return {
    path: `/.well-known/${label}-${id}`,
    token: crypto.randomBytes(18).toString("base64url"),
    label,
    createdAt: new Date().toISOString(),
    hits: 0,
    lastHitAt: null,
    lastHitIp: null,
  };
}

/** האם הנתיב הוא קנארי שהגדרנו */
export function matchCanary(pathname, file) {
  const config = loadStealth(file);
  return config.canaries.find((c) => c.path === pathname) ?? null;
}

// השוואה בזמן קבוע — לא חושפים אורך/תוכן של סימן סודי
export function safeTokenEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ─────────────────────── החלטת השער במצב חמקן ────────────────────────────── */

/**
 * מחליט מה לעשות עם בקשה במצב חמקן.
 *
 * @returns {{action: "serve"|"drop"|"decoy"|"block", reason: string, canary?: object}}
 *   serve  → להמשיך לאפליקציה
 *   drop   → לסגור בשקט (נראה כמו פורט סגור)
 *   decoy  → להחזיר עמוד שרת סטטי משעמע
 *   block  → 403 רגיל
 */
export function stealthDecision(info, { file, headers } = {}) {
  const config = loadStealth(file);
  const result = (action, reason, extra = {}) => ({ action, reason, config, ...extra });

  if (config.enabled !== "on") return result("serve", "stealth_off");

  const h = headers ?? info.headerMap ?? {};
  const get = (name) => h[String(name).toLowerCase()];

  /* 0 — מלכודות: עדיפות עליונה, גם על כתובות פנימיות */
  const canary = matchCanary(info.path, file);
  if (canary) return result("drop", "canary", { canary });

  const peer = normalizeIp(info.socketIp) ?? normalizeIp(info.ip);
  const peerInternal = peer ? isLoopback(peer) || isInternal(peer) : false;

  /**
   * `allowLocalNoHeaders` — גלישה מקומית בלי סימן, למפתח שיושב על אותה מכונה.
   *
   * הבאג שהיה כאן: האפשרות הוצהרה ותועדה ("נוח לפיתוח, פחות חמקן") אבל
   * **אף פעם לא נקראה** — מי שהפעיל אותה גילה שהיא לא עושה כלום. מימוש
   * מדויק: רק חיבור **מהלולאה** (127.0.0.1/::1) ובלי זהות מועברת.
   * זו לא הקלה אבטחתית אמיתית: אף אחד באינטרנט לא יכול לגרום לבקשה
   * להיראות כמגיעה מלולאה, ובפרודקשן המנהרה תמיד מוסיפה CF-Connecting-IP
   * (ולכן מסומנת כמנהרה גם ככה).
   */
  const forwardedIdentity = Boolean(normalizeIp(get("cf-connecting-ip")) ?? normalizeIp(get("x-forwarded-for")));
  if (config.allowLocalNoHeaders === "on" && peer && isLoopback(peer) && !forwardedIdentity) {
    return result("serve", "local_no_headers_allowed");
  }
  const peerTrustedProxy = peer
    ? inAnyCidr(peer, [...CLOUDFLARE_CIDRS, ...OTHER_PROXY_CIDRS, ...config.allowCidrs])
    : false;

  // האם המבקש הוכיח את עצמו
  let trusted = peerTrustedProxy;

  /* 1 — נעילת מקור: בלי הוכחה — אין שירות */
  if (config.originLock === "on") {
    const tokens = config.tokens.length
      ? config.tokens
      : (process.env.STEALTH_ORIGIN_TOKEN ? [process.env.STEALTH_ORIGIN_TOKEN] : []);

    const headerName = (config.originHeader || "x-lt-origin").toLowerCase();
    const provided = get(headerName) ?? "";
    const tokenOk = tokens.length > 0 && tokens.some((t) => safeTokenEqual(provided, t));

    const entryCookie = `${(process.env.COOKIE_PREFIX ?? "lt").replace(/[^a-z0-9]/gi, "") || "lt"}_entry`;
    const cookieOk =
      tokens.length > 0 &&
      tokens.some((t) =>
        new RegExp(`(?:^|;\\s*)${entryCookie}=${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:;|$)`).test(get("cookie") ?? ""),
      );

    const hasToken = tokenOk || cookieOk;
    // הזהות שה-CDN מעביר: CF-Connecting-IP או X-Forwarded-For חוקי
    const forwardedOk = Boolean(normalizeIp(get("cf-connecting-ip")) ?? normalizeIp(get("x-forwarded-for")));
    // בקשה שהגיעה מהמנהרה/ה-proxy המקומי של אותה מכונה (cloudflared / nginx)
    const tunnelStyle = peerInternal && forwardedOk;

    trusted = trusted || hasToken || tunnelStyle;

    if (config.requireTokenAlways === "on" && !hasToken) {
      return result(config.mode, "origin_token_required");
    }
    if (!hasToken && !tunnelStyle && !peerTrustedProxy) {
      // ישיר מהאינטרנט, או חיבור מקומי "ערום" — מתעלמים
      return result(config.mode, peerInternal ? "origin_lock_local_unmarked" : "origin_lock_direct");
    }
  }

  /* 2 — דרישת כותרת proxy אמיתית (CF-Connecting-IP / XFF חוקי) */
  if (config.requireForwardedBy === "on" && !peerInternal && !trusted) {
    const cfIp = normalizeIp(get("cf-connecting-ip"));
    const xff = normalizeIp(get("x-forwarded-for"));
    if (!cfIp && !xff) return result(config.mode, "no_forwarded_identity");
  }

  /* 3 — שם מתחזה/חסר: בקשה בלי Host חוקי נחשדת בסריקה */
  const host = String(info.host ?? "").toLowerCase().split(":")[0];
  const allowedHosts = (process.env.ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowedHosts.length && host && !allowedHosts.includes(host)) {
    return result(config.mode, "wrong_host");
  }

  return result("serve", "ok");
}

/* ───────────────────────── הסוואת זהות המותג ────────────────────────────── */

/**
 * ברירת המחדל של שם ההסוואה: שם סתמי שלא מושך עין ולא מתאים לאף מותג אמיתי.
 * אפשר לשנות עם brandCover (למשל שם של עסק אחר שהאתר אמור להיראות כמוהו).
 */
export const DEFAULT_BRAND_COVER = "Northwind Media";

/** כל התצורות של שם המערכת שמופיעות בפועל בתשובות — כולל בעברית ובקידוד שונה */
const BRAND_PATTERNS = [
  /LemonTank Stream/g,
  /LemonTank/gi,
  /lemontank/gi,
  /לימונטנק/g,
  /לימון\s*טנק/g,
];

/**
 * מחליף שם מותג בכל טקסט שיוצא החוצה. **למה זה נחוץ:** טביעת האצבע
 * החזקה ביותר שהאתר משאיר אינה המסגרת — היא **השם שלו**. סורק שמחפש
 * מחרוזת אחת בסריקת אינטרנט שלם מוצא כל עותק של האתר בכל דומיין,
 * גם אם הוא מאחורי CDN, גם אם אין DNS, וגם אם הוא על כתובת IP אחרת.
 */
export function coverBrand(text, config) {
  if (!text) return text;
  const cover = (config?.brandCover && String(config.brandCover).trim()) || DEFAULT_BRAND_COVER;
  let out = text;
  for (const pattern of BRAND_PATTERNS) out = out.replace(pattern, cover);
  return out;
}

/**
 * ── החלפת שמות פנימיים של המסגרת ─────────────────────────────────────────
 *
 * למה זה בטוח: כל שם ברשימה הוא **מזהה פנימי של החבילה עצמה** (webpack /
 * Next). כל עוד ההחלפה נעשית אותו דבר גם בגוף היוצא וגם בנתיב הנכנס,
 * הקוד ממשיך לעבוד — הדפדפן פשוט רואה שמות אחרים. אין שום דבר מחוץ לקבצים
 * המוגשים שמכיר את השמות האלה.
 *
 * למה זה נחוץ: סורק לא צריך לנחש — הוא מחפש "webpack" בגוף התשובה או בשם
 * הקובץ ומסיק מיד מהיכן האתר נבנה. הסוואת נתיב הנכסים לבדה לא מספיקה כי
 * שם הקובץ עצמו מכיל את המילה.
 */
const ALIAS_SOURCES = [
  // ── שמות מודולים/גלובלים פנימיים של החבילה ──
  "react-server-dom-webpack",
  "webpackChunk_N_E",
  "__webpack_require__",
  "__webpack_modules__",
  "__webpack_exports__",
  "__NEXT_DATA__",
  "webpack",
  // ── שמות קבצים/תיקיות שהמסגרת מייצרת (הנתיב נכנס לשרת ומתורגם חזרה) ──
  // ── סימנים ספציפיים ל-Next שנשארים בתוך ה-HTML ──
  "next-error-h1",
  /**
   * ערך ה-precedence של React מגיע ללקוח בתוך ה-Flight payload, גם בצורה
   * escaped. **חשוב:** מחליפים את הצירוף המלא (מפתח+ערך) ולא את הדפוס
   * `":"next"` — דפוס כזה מופיע גם בנתונים אמיתיים של האתר (למשל קטגוריית
   * דגל בשם "next") והיה הופך גוף JSON תקין לשבור: `"category":"next"`
   * הפך ל-`"categoryx1a2b"`. כלומר ההסוואה עצמה הפילה בקשות.
   */
  '"precedence":"next"',
  '\\"precedence\\":\\"next\\"',
  "next-error",
  "data-precedence",
  "app-pages-internals",
  "app-build-manifest",
  "static/chunks",
  "static/media",
  "static/css",
  "build-manifest",
  "_buildManifest",
  "_ssgManifest",
  "__nextjs_",
  "next/dist",
  "turbopack",
  "main-app",
  "polyfills",
  // ── סמלי פרוטוקול של React (Symbol.for) — מוחלפים באופן זהה בשני הצדדים ──
  "react.suspense_list",
  "react.forward_ref",
  "react.strict_mode",
  "react.debug_trace_mode",
  "react.legacy_hidden",
  "react.tracing_marker",
  "react.suspense",
  "react.fragment",
  "react.consumer",
  "react.profiler",
  "react.activity",
  "react.offscreen",
  "react.context",
  "react.element",
  "react.portal",
  "react.server",
  "react.lazy",
  "react.memo",
  "react-dom",
  "_reactRetry",
];

/** מייצר מילון החלפה אקראי (פעם אחת להתקנה — נשמר בהגדרות) */
export function generateAliases() {
  const map = {};
  for (const source of ALIAS_SOURCES) {
    const rand = crypto.randomBytes(4).toString("hex");
    map[source] = source.startsWith("__") ? `__x${rand}__` : `x${rand}`;
  }
  return map;
}

/** האם המילון מלא ותקין — אחרת מייצרים חדש */
export function aliasesComplete(aliases) {
  if (!aliases || typeof aliases !== "object") return false;
  return ALIAS_SOURCES.every((k) => typeof aliases[k] === "string" && aliases[k].length >= 5);
}

/**
 * **כלל ברזל של ההסוואה:** מחליפים רק מחרוזות שהן *תוכן* — לעולם לא חתיכות
 * שמכילות את מבנה ה-JSON/HTML. אחרת גוף תקין הופך לשבור:
 *   `{"category":"next"}`  →  `{"categoryx1a2b"}`   ← JSON לא תקין, ה-API נופל.
 * לכן ערך שנמצא *בתוך* הקשר (למשל ה-precedence של React) מוחלף רק דרך
 * תבנית שמזהה את המפתח ואת המרכאות — ורק את הערך עצמו.
 */
const CONTEXT_ONLY = new Set(['"precedence":"next"', '\\"precedence\\":\\"next\\"']);

const CONTEXT_REWRITES = [
  // "precedence":"next"  — JSON רגיל
  { pattern: /("precedence"\s*:\s*")([^"]*)(")/g, source: '"precedence":"next"' },
  // \"precedence\":\"next\" — בתוך ה-Flight payload (escaped)
  { pattern: /(\\"precedence\\"\s*:\s*\\")([^"\\]*)(\\")/g, source: '\\"precedence\\":\\"next\\"' },
];

/**
 * מחליף שמות פנימיים בטקסט יוצא. הסדר חשוב: הארוך קודם, אחרת "webpack"
 * היה נכנס לתוך "webpackChunk_N_E" ומפרק אותו.
 */
export function coverTokens(text, config) {
  if (!text) return text;
  const aliases = config?.tokenAliases;
  if (!aliasesComplete(aliases)) return text;
  let out = text;
  for (const source of ALIAS_SOURCES) {
    if (CONTEXT_ONLY.has(source)) continue; // מטופל רק בהקשר, כדי לא לשבור מבנה
    out = out.split(source).join(aliases[source]);
  }
  for (const { pattern, source } of CONTEXT_REWRITES) {
    out = out.replace(pattern, (_match, before, _value, after) => `${before}${aliases[source]}${after}`);
  }
  return out;
}

/** הופך את ההחלפה על נתיב נכנס — כדי שהנכס עצמו יימצא */
export function uncoverPath(pathname, config) {
  const aliases = config?.tokenAliases;
  if (!pathname || !aliasesComplete(aliases)) return pathname;
  let out = pathname;
  // היפוך בסדר הפוך — מבטל את ההחלפה האחרונה ראשונה
  for (const source of [...ALIAS_SOURCES].reverse()) out = out.split(aliases[source]).join(source);
  return out;
}

/**
 * אייקון גנרי במצב חמקן.
 *
 * למה זה חשוב: Shodan ו-Censys מחשבים hash של favicon ומשתמשים בו כמזהה
 * דומיין-על. אייקון מותג קבוע = "כל האתרים עם ה-hash הזה הם אותו מוצר".
 * אייקון גנרי נראה כמו כל אתר ברירת-מחדל — כלומר כמו מיליון אחרים.
 */
export function genericFavicon(seed) {
  /**
   * חשוב: אייקון **זהה לכל ההתקנות** היה יוצר hash משותף — בדיוק הכלי
   * שאיתו Shodan/Censys מקשרים בין דומיינים ("כל מי שיש לו את ה-hash הזה
   * הוא אותו מוצר"). לכן כל התקנה מקבלת צבע רקע אקראי מתוך פלטה נפוצה:
   * האייקון נשאר סתמי לחלוטין, אבל ה-hash שלו ייחודי ולא מקשר לשום דבר.
   */
  const palette = ["#f2f3f5", "#ffffff", "#e9ecef", "#f8f9fa", "#eceff1", "#f5f5f5", "#eef1f4", "#fbfbfb"];
  const key = String(seed ?? "seed");
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const color = palette[Math.abs(h) % palette.length];
  const radius = Math.abs(h >> 3) % 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="${radius}" fill="${color}"/></svg>`;
}

/** מניפסט ניטרלי — בלי שם מערכת, בלי רשימת עמודים שמסגירה את המבנה */
export function genericManifest() {
  return JSON.stringify({ name: "Site", short_name: "Site", start_url: "/", display: "standalone" });
}

/* ────────────────────────── הקבצים שמגישים ──────────────────────────────── */

/** עמוד "decoy" — נראה כמו התקנת nginx טרייה, בלי שום רמז שיש כאן אפליקציה */
export function decoyPage(title = "Welcome to nginx!") {
  const safe = String(title).replace(/[<>&"]/g, "");
  return `<!DOCTYPE html>
<html>
<head>
<title>${safe}</title>
<style>
    body { width: 35em; margin: 0 auto; font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>${safe}</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>
<p>For online documentation and support please refer to
<a href="https://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="https://nginx.com/">nginx.com</a>.</p>
<p><em>Thank you for using nginx.</em></p>
</body>
</html>`;
}

/** robots.txt במצב חמקן — חסימת הכול, ואם רוצים: פיתיון לסורקים */
export function stealthRobots(config, bait) {
  const lines = [
    "# Nothing to see here.",
    "User-agent: *",
    "Disallow: /",
  ];
  if (config.robotsBait === "on" && bait) lines.push("", `Disallow: ${bait}`);
  return lines.join("\n") + "\n";
}

/** תקציר מצב החמקנות לפאנל/CLI */
export function stealthStatus(file) {
  const config = loadStealth(file);
  return {
    enabled: config.enabled,
    mode: config.mode,
    originLock: config.originLock,
    tokens: config.tokens.length,
    allowCidrs: config.allowCidrs.length,
    trustedCidrs: CLOUDFLARE_CIDRS.length + OTHER_PROXY_CIDRS.length,
    canaries: config.canaries.map((c) => ({ path: c.path, hits: c.hits, lastHitAt: c.lastHitAt, lastHitIp: c.lastHitIp })),
    noindex: config.noindex,
    adminHides404: config.adminHides404,
    minimalHeaders: config.minimalHeaders,
    robotsBait: config.robotsBait,
    assetMask: config.assetMask,
    brandCover: (config.brandCover && String(config.brandCover).trim()) || DEFAULT_BRAND_COVER,
    faviconMask: config.faviconMask,
    cookiePrefix: config.cookiePrefix,
    tokenAliases: aliasesComplete(config.tokenAliases) ? Object.keys(config.tokenAliases).length : 0,
    assetPrefix: config.assetPrefix,
    updatedAt: config.updatedAt,
  };
}

/**
 * אם הבקשה כוללת ?lt_entry=<סימן תקף> — מחזיר את הסימן, כדי שהשער יוכל
 * להציב עוגיית כניסה ולגשת לדף נקי (בלי הסימן בכתובת ובהיסטוריה).
 */
export function entryTokenFromRequest(reqUrl, file) {
  const config = loadStealth(file);
  const tokens = config.tokens.length ? config.tokens : (process.env.STEALTH_ORIGIN_TOKEN ? [process.env.STEALTH_ORIGIN_TOKEN] : []);
  if (!tokens.length) return null;
  let provided = null;
  try {
    provided = new URL(reqUrl, "http://localhost").searchParams.get("lt_entry");
  } catch {
    return null;
  }
  if (!provided) return null;
  return tokens.find((t) => safeTokenEqual(provided, t)) ?? null;
}

