/**
 * מנוע האבטחה — מקבל החלטה על כל בקשה שנכנסת לאתר.
 *
 * הרעיון: כל בקשה עוברת "שער" אחד לפני שהיא מגיעה לאפליקציה.
 * השער צובר ראיות (דפוס תקיפה, חתימת כלי, מוניטין IP, קצב, כשלי התחברות)
 * ומחליט: לאשר, לחסום בקשה, או לחסום את כתובת ה-IP לתקופה.
 *
 *   allow  → ממשיכים לאפליקציה
 *   block  → 403/429 למבקש, בלי להגיע לאתר
 *   ban    → 403 למבקש + רשומת חסימה ב-ip_bans (עם החמרה על חזרות)
 *
 * המנוע זהה לחלוטין עבור בקשה לדף, ל-API ולקובץ מדיה — אין דרך לעקוף אותו.
 */

import crypto from "node:crypto";
import {
  HONEYPOT_PATHS, ATTACK_RULES, PROXY_HEADERS, TOOL_AGENTS,
  ALLOWED_METHODS, FORBIDDEN_METHODS, GET_ONLY_PREFIXES, STATIC_EXT, LIMITS,
} from "./patterns.mjs";
import { classifyIp, isScannerAgent, isMissingAgent, intelStatus } from "./intel.mjs";
import { hashIp, isInternal, isLoopback, maskIp, normalizeIp } from "./net.mjs";
import { banTtlSeconds, openStore, DEFAULT_SETTINGS } from "./store.mjs";

const SCORE_WINDOW_SEC = 300;
const SCORE_BAN_THRESHOLD = 300;
const MAX_SCORE_PER_REQUEST = 60;   // תקרה לבקשה בודדת — מונע חסימה מניקוד "קבוע" כמו VPN
const MAX_DECODE_ROUNDS = 3;

/** מפענח אחוזים/HTML ברמות מקוננות — טריק נפוץ להסתרת עומס זדוני */
function deepDecode(value) {
  let out = String(value ?? "");
  for (let i = 0; i < MAX_DECODE_ROUNDS; i++) {
    let next = out;
    try {
      next = decodeURIComponent(out.replace(/\+/g, " "));
    } catch {
      next = out;
    }
    next = next
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
      .replace(/&#x27;/gi, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
    if (next === out) break;
    out = next;
  }
  return out;
}

/** נרמול "צורת התקיפה": מסיר רווחי SQL, הערות ואותיות גדולות */
function canonicalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 8192);
}

export function createEngine({ dbFile, appRoot = process.cwd(), quiet = true, dbConn = null } = {}) {
  const store = dbConn ?? openStore({ dbFile, appRoot, quiet });
  const logCache = new Map(); // האטת כתיבת לוגים חוזרים

  /* ─────────────────── שער החסימה: האם ה-IP חסום? ───────────────────────── */

  function staffBypass(cookieHeader) {
    if (store.setting("staff_bypass") !== "on" || !cookieHeader) return false;
    const match = /(?:^|;\s*)lt_session=([^;]{8,200})/.exec(cookieHeader);
    if (!match) return false;
    const hash = crypto.createHash("sha256").update(match[1]).digest("hex");
    try {
      const row = store.staffBySessionHash?.(hash);
      return Boolean(row);
    } catch {
      return false;
    }
  }

  /**
   * שער ראשי. מחזיר החלטה + מידע לדיווח.
   * @param {object} req מידע גולמי על הבקשה (IP, מתודה, נתיב, כותרות, UA)
   */
  function evaluate(req) {
    const settings = store.settings();
    const ip = normalizeIp(req.ip) ?? "0.0.0.0";
    const mode = settings.mode === "monitor" ? "monitor" : "enforce";
    const result = {
      action: "allow",
      status: 200,
      category: null,
      reason: null,
      severity: "info",
      score: 0,
      mode,
      ban: null,
      ip,
      ipMasked: maskIp(ip),
      rules: [],
    };

    const block = (status, category, reason, severity = "warning", extra = {}) => {
      result.action = mode === "monitor" ? "allow" : "block";
      result.status = status;
      result.category = category;
      result.reason = reason;
      result.severity = severity;
      Object.assign(result, extra);
      for (const entry of extra.log ?? []) {
        logEvent(ip, entry.kind, entry.severity ?? severity, entry.detail ?? reason);
      }
      return result;
    };
    const ban = (category, reason, severity = "critical", extra = {}) => {
      result.action = mode === "monitor" ? "allow" : "ban";
      result.status = 403;
      result.category = category;
      result.reason = reason;
      result.severity = severity;
      Object.assign(result, extra);
      for (const entry of extra.log ?? []) {
        logEvent(ip, entry.kind, entry.severity ?? severity, entry.detail ?? reason);
      }
      if (mode === "enforce" && settings.autoban === "on" && !internalProtected) {
        const row = store.ban({
          ip,
          category,
          reason,
          severity,
          path: `${req.path || ""}${req.query ? `?${req.query}` : ""}`.slice(0, 400),
          method: req.method,
          userAgent: req.userAgent,
          action: extra.rules?.[0] ?? null,
          auto: true,
        });
        result.ban = row;
        if (row?.ttl_sec) result.retryAfterSec = row.ttl_sec;
      }
      return result;
    };

    const internal = isLoopback(ip) || isInternal(ip);
    const internalProtected = settings.internal_bypass === "on" && internal;

    /* 1 ── חסימת IP קיימת (הבדיקה הזולה והחשובה ביותר) */
    const active = store.isBanned(ip);
    if (active && !internalProtected) {
      if (!(settings.staff_bypass === "on" && staffBypass(req.cookieHeader))) {
        store.incr(`banhits:${ip}`, 3600);
        logEvent(ip, "banned_request", "warning", `category=${active.category} ban_id=${active.id}`);
        return block(403, active.category, `הכתובת חסומה: ${active.reason}`, "warning", {
          banned: true,
          banId: active.id,
          retryAfterSec: secondsUntil(active.expires_at),
        });
      }
    }

    /* 2 ── תקינות בסיסית של הבקשה (smuggling, מתודות אסורות, גדלים) */
    const rawPath = req.path || "/";
    const rawQuery = req.query || "";
    const full = `${rawPath}${rawQuery ? `?${rawQuery}` : ""}`;
    const decoded = deepDecode(full);
    const canon = canonicalize(decoded);

    if (!ALLOWED_METHODS.has(req.method)) {
      if (FORBIDDEN_METHODS.has(req.method)) {
        return ban("probe", `מתודה אסורה (${req.method}) — סימן לסריקת שרתים`, "critical", { log: [{ kind: "forbidden_method", severity: "warning" }] });
      }
      return ban("malformed", `מתודה לא מוכרת (${req.method})`, "warning");
    }

    if (req.httpVersion === "1.0") return ban("probe", "בקשת HTTP/1.0 — תואם רק לכלים אוטומטיים", "warning");

    if (req.smuggling) {
      return ban("malformed", `ניסיון הברחת בקשה: ${req.smuggling}`, "critical", { log: [{ kind: "request_smuggling", severity: "critical" }] });
    }

    if (full.length > LIMITS.urlLength || rawPath.length > LIMITS.pathLength || rawQuery.length > LIMITS.queryLength) {
      return block(414, "malformed", "כתובת ארוכה מדי", "warning");
    }

    if ((req.headerCount ?? 0) > LIMITS.headerCount) return ban("malformed", "יותר מדי כותרות בבקשה", "warning");
    if ((req.headerBytes ?? 0) > LIMITS.headerSize) return block(431, "malformed", "כותרות גדולות מדי", "warning");
    if ((req.cookieBytes ?? 0) > LIMITS.cookieSize) return block(431, "malformed", "עוגיות גדולות מדי", "warning");

    const ua = req.userAgent || "";
    if (ua.length > LIMITS.userAgentLength) return ban("malformed", "User-Agent ארוך באופן חריג", "warning");
    const referer = req.referer || "";
    if (referer.length > LIMITS.refererLength) return ban("malformed", "Referer ארוך באופן חריג", "warning");

    /* 3 ── מתודות שינוי על נכסים סטטיים */
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      if (STATIC_EXT.test(rawPath) || GET_ONLY_PREFIXES.some((p) => rawPath.startsWith(p))) {
        return ban("probe", "ניסיון לכתוב לקובץ סטטי", "warning");
      }
    }

    /* 4 ── נתיבי מלכודת (Honeypot) */
    if (settings.honeypot_paths === "on" && settings.honeypot !== "off") {
      for (const re of HONEYPOT_PATHS) {
        if (re.test(rawPath)) {
          const hard = settings.honeypot === "ban";
          const out = hard
            ? ban("honeypot", `פנייה לנתיב מלכודת: ${rawPath.slice(0, 120)}`, "critical", { log: [{ kind: "honeypot_triggered", severity: "critical", detail: rawPath.slice(0, 200) }] })
            : block(403, "honeypot", "הנתיב אינו קיים במערכת", "warning");
          return out;
        }
      }
    }

    /* 5 ── דפוסי תקיפה בנתיב ובשאילתה */
    const hit = matchRules(canon) ?? matchRules(canonicalize(rawPath));
    if (hit) {
      const detail = `${hit.rule.name} :: ${decoded.slice(0, 180)}`;
      if (hit.rule.action === "ban") {
        return ban(hit.rule.category, `זוהתה תקיפה: ${hit.rule.name}`, hit.rule.severity, {
          score: hit.rule.score,
          rules: [hit.rule.name],
          log: [{ kind: `attack_${hit.rule.category}`, severity: hit.rule.severity, detail }],
        });
      }
      if (hit.rule.action === "block") {
        addScore(ip, hit.rule.score);
        return block(403, hit.rule.category, `הבקשה נחסמה: ${hit.rule.name}`, hit.rule.severity, {
          rules: [hit.rule.name],
          log: [{ kind: `attack_${hit.rule.category}`, severity: "warning", detail }],
        });
      }
      addScore(ip, hit.rule.score);
      logEvent(ip, `suspicious_${hit.rule.category}`, "info", detail.slice(0, 300));
    }

    /* 6 ── סימני פרוקסי / כלי יירוט (Burp, ZAP, Postman…) */
    const toolSignals = detectTooling(req);
    if (toolSignals.length) {
      const score = toolSignals.reduce((sum, s) => sum + s.score, 0);
      const isCritical = toolSignals.some((s) => s.score >= 80);
      const detail = toolSignals.map((s) => s.note).join(" | ").slice(0, 300);
      const policy = settings.proxy_policy;

      if (isCritical && settings.tool_block === "ban") {
        return ban("tool", `זוהה כלי תקיפה/יירוט: ${toolSignals[0].note}`, "critical", {
          score,
          log: [{ kind: "proxy_tool_detected", severity: "critical", detail }],
        });
      }
      if (isCritical && settings.tool_block === "block") {
        return block(403, "tool", `הבקשה נחסמה: זוהה כלי יירוט (${toolSignals[0].note})`, "critical", {
          log: [{ kind: "proxy_tool_detected", severity: "critical", detail }],
        });
      }
      if (policy === "block-all" || (policy === "block-writes" && isWriteMethod(req.method))) {
        return block(403, "proxy", "שימוש בפרוקסי/כלי יירוט אינו מותר בשינוי תוכן", "warning", {
          log: [{ kind: "proxy_blocked", severity: "warning", detail }],
        });
      }
      addScore(ip, score);
      logEvent(ip, "proxy_signature", score >= 60 ? "warning" : "info", detail);
    }

    /* 7 ── סורק פגיעויות לפי User-Agent */
    if (isScannerAgent(ua)) {
      return ban("tool", `סורק פגיעויות זוהה: ${ua.slice(0, 80)}`, "critical", {
        log: [{ kind: "scanner_detected", severity: "critical", detail: ua.slice(0, 200) }],
      });
    }
    if (settings.empty_ua !== "off" && isMissingAgent(ua) && !internal) {
      const allowQuiet = /^(GET|HEAD|OPTIONS)$/.test(req.method) && !/^\/api\//.test(rawPath);
      if (!allowQuiet) {
        if (settings.empty_ua === "block") {
          addScore(ip, 60);
          logEvent(ip, "missing_user_agent", "warning", ua.slice(0, 120) || "(ריק)");
        } else {
          addScore(ip, 25);
        }
      }
    }

    /* 8 ── מוניטין כתובת: TOR / מרכז נתונים / רשימת חסימה ידנית */
    const intel = classifyIp(ip);
    if (intel.blocked) {
      return ban("probe", "הכתובת נמצאת ברשימת החסימה של המערכת", "critical", { log: [{ kind: "blocklisted_ip", severity: "critical" }] });
    }
    if (intel.tor) {
      const torBan = settings.tor_ban === "on" || settings.proxy_policy === "block-all";
      if (torBan && !internalProtected) {
        return ban("probe", "פנייה מרשת TOR — אנונימיזציה אינה מורשית", "critical", { log: [{ kind: "tor_blocked", severity: "critical" }] });
      }
      if (settings.proxy_policy === "block-writes" && isWriteMethod(req.method)) {
        return block(403, "proxy", "פעולות כתיבה מרשת TOR חסומות", "warning");
      }
      logEvent(ip, "tor_visitor", "info", "פנייה מרשת TOR (מדיניות: ניקוד)");
    }
    if (intel.datacenter && !internalProtected) {
      if (settings.datacenter_ban === "on" || settings.proxy_policy === "block-all") {
        if (!intel.crawler) return ban("proxy", "פנייה ממרכז נתונים/אירוח — נחסם לפי המדיניות", "warning", { log: [{ kind: "datacenter_blocked", severity: "warning" }] });
      }
      if (settings.proxy_policy === "block-writes" && isWriteMethod(req.method)) {
        return block(403, "proxy", "פעולות כתיבה ממרכזי נתונים חסומות (פרוקסי/VPN)", "warning", {
          log: [{ kind: "datacenter_write_blocked", severity: "warning", detail: ip }],
        });
      }
      logEvent(ip, "datacenter_visitor", "info", "פנייה ממרכז נתונים/VPN (מדיניות: ניקוד)");
    }

    /* 9 ── בדיקת Host: זיוף/הפניית שם מתחזה */
    const hostCheck = checkHost(req);
    if (hostCheck) {
      addScore(ip, hostCheck.score);
      logEvent(ip, hostCheck.kind, "warning", hostCheck.detail);
      if (hostCheck.block) return block(421, "spoof", "כותרת Host אינה תקינה", "warning");
    }

    /* 10 ── הגבלת קצב (הצפה) */
    const limit = Number(settings.rate_per_minute || 0);
    if (limit > 0 && !internalProtected) {
      const hits = store.incr(`rate:${ip}`, 60);
      if (hits > limit) {
        const violations = store.incr(`flood:${ip}`, 600);
        logEvent(ip, "rate_limited", "warning", `hits=${hits}/${limit}`);
        if (settings.flood_ban === "on" && violations >= 3) {
          return ban("flood", `הצפת בקשות: ${hits} בדקה (מעל ${limit})`, "warning");
        }
        return block(429, "flood", "יותר מדי בקשות — האט בבקשה", "warning", { retryAfterSec: 60 });
      }
    }

    /* 11 ── ניקוד איומים מצטבר — חוסם מתמשכים גם בלי דפוס בודד חריג */
    const score = currentScore(ip);
    if (score >= SCORE_BAN_THRESHOLD && !internalProtected) {
      return ban("threat", `ניקוד איומים מצטבר חרג מהסף (${score})`, "warning");
    }

    result.score = score;
    return result;

    /* ── עזר פנימי ────────────────────────────────────────────────────────── */
    /**
     * צבירת ניקוד איומים.
     * חשוב: מדלגים על ניקוד נמוך (מתחת ל-45) ועל ניקוד גבוה מדי לבקשה אחת —
     * אחרת לקוח לגיטימי מאחורי VPN היה נחסם אחרי כמה צפיות תמימות.
     */
    function addScore(targetIp, points) {
      const capped = Math.min(MAX_SCORE_PER_REQUEST, Number(points) || 0);
      if (capped < 45) return;
      store.addCounter(`score:${targetIp}`, capped, SCORE_WINDOW_SEC);
    }

    function currentScore(targetIp) {
      return store.getCounter(`score:${targetIp}`);
    }

    function logEvent(targetIp, kind, severity, detail) {
      const throttleKey = `${targetIp}|${kind}`;
      const last = logCache.get(throttleKey) ?? 0;
      if (Date.now() - last < 60_000) return;
      logCache.set(throttleKey, Date.now());
      if (logCache.size > 5000) logCache.clear();
      const stored = store.setting("ip_mode") === "full" ? targetIp : null;
      store.event({ kind, severity, ip: stored, detail: stored ? detail : `${detail} [ip:${hashIp(targetIp, process.env.APP_SECRET ?? "lt")}]` });
    }

    function matchRules(value) {
      for (const rule of ATTACK_RULES) {
        rule.re.lastIndex = 0;
        if (rule.re.test(value)) return { rule };
      }
      return null;
    }
  }

  /* ───────────────────────── זיהוי כלי יירוט/פרוקסי ─────────────────────── */

  function detectTooling(req) {
    const signals = [];
    const headers = req.headerMap || {};

    for (const { name, severity, score, note } of PROXY_HEADERS) {
      if (headers[name] !== undefined && score > 0) {
        const value = String(headers[name]).slice(0, 120);
        signals.push({ note: `${note} (${name})`, score, severity, detail: `${name}=${value}` });
      }
    }

    // חתימות בכל ערך כותרת רלוונטי
    const values = [req.userAgent, req.referer, headers["x-requested-with"], headers["accept"], headers["x-forwarded-for"]].filter(Boolean).join(" \u0000 ");
    for (const tool of TOOL_AGENTS) {
      if (tool.score >= 60 && tool.re.test(values)) signals.push({ note: tool.note, score: tool.score, severity: "critical" });
    }

    // "forwarded"/"via" — סימן לפרוקסי מקצועי או לכלי
    if (headers["via"]) signals.push({ note: `כותרת Via (${String(headers.via).slice(0, 60)})`, score: 45, severity: "warning" });
    if (headers["forwarded"]) signals.push({ note: "כותרת Forwarded", score: 40, severity: "warning" });

    // בקשה "ערומה" לגמרי: בלי Accept-Language, בלי Accept, בלי Sec-Fetch — אופייני לכלים
    const claimsBrowser = /mozilla|chrome|safari|firefox|edge|opera/i.test(req.userAgent || "");
    if (!isInternal(req.ip) && !isLoopback(req.ip)) {
      const looksBrowser = Boolean(headers["accept-language"] || headers["sec-fetch-mode"] || headers["accept"]?.includes("text/html"));
      if (claimsBrowser && !headers["accept-language"]) {
        // דפדפן אמיתי תמיד שולח Accept-Language — בלעדיו זה כלי שמתחזה לדפדפן
        // ניקוד בלבד (מתחת לסף ה"קריטי") — יש דפדפנים ודפדפנים-מוגני-פרטיות
        // שלא שולחים Accept-Language, ואסור לחסום משתמש אמיתי בגלל זה.
        signals.push({ note: "User-Agent של דפדפן בלי Accept-Language (התחזות?)", score: headers["sec-fetch-mode"] ? 50 : 70, severity: "warning" });
      } else if (!looksBrowser && !/^(GET|HEAD|OPTIONS)$/.test(req.method) && !/^\/api\//.test(req.path || "")) {
        signals.push({ note: "בקשה ללא כותרות דפדפן", score: 35, severity: "info" });
      }
    }

    // כותרות כפולות — טריק נפוץ להברחת בקשות ולעקיפת בדיקות
    if (Array.isArray(req.duplicateHeaders) && req.duplicateHeaders.length) {
      const risky = req.duplicateHeaders.filter((h) => /^(content-length|host|transfer-encoding|x-forwarded-for|authorization|cookie)$/i.test(h));
      if (risky.length) signals.push({ note: `כותרות כפולות: ${risky.join(", ")}`, score: 90, severity: "critical" });
    }

    return signals;
  }

  /* ───────────────────────────── בדיקת Host ──────────────────────────────── */

  function checkHost(req) {
    const host = String(req.host || "").toLowerCase().trim();
    if (!host) return { kind: "missing_host", score: 30, detail: "בקשה בלי כותרת Host" };
    if (/[\s@\\/]/.test(host) || host.includes("..")) return { kind: "malformed_host", score: 80, detail: host.slice(0, 120), block: true };

    const allowed = (process.env.ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (allowed.length) {
      const hostname = host.replace(/:\d+$/, "");
      if (!allowed.includes(hostname) && !allowed.includes(host)) {
        return { kind: "host_not_allowed", score: 100, detail: `host=${hostname}`, block: true };
      }
      return null;
    }

    // בלי רשימה מפורשת: מתריעים על אי-התאמה בין Host ל-X-Forwarded-Host
    const xfh = String(req.headers?.["x-forwarded-host"] ?? "").toLowerCase().replace(/:\d+$/, "");
    if (xfh && xfh !== host.replace(/:\d+$/, "")) {
      return { kind: "host_mismatch", score: 30, detail: `host=${host} xfh=${xfh}` };
    }
    // IP גולמי כשיש דומיין מוגדר — סימן לסריקה או לעקיפת DNS
    const appDomain = safeHostname(process.env.APP_URL);
    if (appDomain && !/^\d+\.\d+\.\d+\.\d+$/.test(appDomain) && /^\d+\.\d+\.\d+\.\d+$/.test(host.replace(/:\d+$/, ""))) {
      return { kind: "ip_host_header", score: 35, detail: host.slice(0, 60) };
    }
    return null;
  }

  /* ────────────────────── תגובת מערכת (אחרי שהאתר ענה) ───────────────────── */

  /** נקרא מהשרת אחרי שהתקבלה תשובה — לצורך ספירת 404 וכשלי התחברות */
  function afterResponse({ ip, status, path: reqPath, method }) {
    if (!ip) return null;
    const norm = normalizeIp(ip);
    if (!norm || isInternal(norm) || isLoopback(norm)) return null;
    const settings = store.settings();
    if (settings.autoban !== "on") return null;

    // סריקת קבצים/נתיבים: 404 מרובה = סורק
    if (status === 404 || status === 403) {
      const notFound = store.incr(`nf:${norm}`, 300);
      if (notFound > 40) return store.ban({ ip: norm, category: "probe", reason: `סריקת נתיבים (${notFound} כתובות לא קיימות ב-5 דקות)`, severity: "warning", path: reqPath, method });
    }

    // כישלונות התחברות: 20 כשלים ב-15 דקות = חסימה
    if (status === 401 && String(reqPath || "").includes("/api/auth/login")) {
      const fails = store.incr(`login_fail:${norm}`, 900);
      if (fails === 20 || (fails > 20 && fails % 10 === 0)) {
        logEventSafe(norm, "brute_force_detected", "critical", `${fails} כשלי התחברות`);
        return store.ban({ ip: norm, category: "brute", reason: `כוח גס על התחברות (${fails} כשלים)`, severity: "critical", path: reqPath, method });
      }
    }
    return null;
  }

  function logEventSafe(ip, kind, severity, detail) {
    const stored = store.setting("ip_mode") === "full" ? ip : null;
    store.event({ kind, severity, ip: stored, detail: stored ? detail : `${detail} [ip:${hashIp(ip, process.env.APP_SECRET ?? "lt")}]` });
  }

  /* ───────────────────────────── API למנהל ───────────────────────────────── */

  return {
    store,
    evaluate,
    afterResponse,
    settings: () => store.settings(),
    setSetting: (k, v) => store.setSetting(k, v),
    ban: (input) => store.ban(input),
    unban: (ip, by) => store.unban(ip, by),
    unbanAll: (by) => store.unbanAll(by),
    isBanned: (ip) => store.isBanned(ip),
    bannedList: (limit) => store.bannedList(limit),
    banHistory: (limit) => store.banHistory(limit),
    stats: () => ({
      bans: store.banStats(),
      events24h: store.recentEvents(24).length,
      topOffenders: store.topOffenders(10),
      intel: intelStatus(),
      mode: store.setting("mode"),
    }),
    prune: (days) => ({ bans: store.purgeExpired(days), events: store.pruneEvents(days), counters: store.pruneCounters() }),
    close: () => store.close(),
    DEFAULT_SETTINGS,
    banTtlSeconds,
  };
}

const isWriteMethod = (method) => ["POST", "PUT", "PATCH", "DELETE"].includes(String(method).toUpperCase());

function secondsUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
