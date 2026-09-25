#!/usr/bin/env node
/**
 * LemonTank Stream — שרת מאובטח (Security Gateway)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * זהו השרת היחיד שחשוף לאינטרנט. Next.js עצמו מאזין רק על 127.0.0.1,
 * כך שאין דרך לעקוף את שכבת האבטחה — כל בקשה, דף, API וקובץ מדיה עוברים כאן.
 *
 * השכבה הזו עושה, לפני שהאפליקציה בכלל רואה את הבקשה:
 *   1. ניקוי ויישור כותרות — זיוף X-Forwarded-For לא יעבוד יותר.
 *   2. זיהוי תקיפות (SQLi/XSS/traversal/RCE/smuggling) וחסימת IP אוטומטית.
 *   3. חסימת Burp Suite, ZAP וכלי יירוט/סריקה לפי חתימות.
 *   4. נתיבי מלכודת (/.env, /wp-login.php…) — כל נגיעה = חסימה ל-24 שעות.
 *   5. הגבלת קצב, חסימת הצפות וכשלי התחברות חוזרים.
 *   6. הסתרת זהות השרת: בלי Server, בלי X-Powered-By, שגיאות גנריות בלבד.
 *
 * הרצה:  npm run start        (פרודקשן — דורש npm run build)
 *         npm run dev          (פיתוח, עם כל שכבת האבטחה)
 *         PORT / HOST / INTERNAL_PORT / SECURITY_MODE משתני סביבה
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = process.env.APP_ROOT ?? __dirname;

/* ─────────────────────────── טעינת .env (בלי תלות חוץ) ───────────────────── */

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(APP_ROOT, ".env.local"));
loadEnvFile(path.join(APP_ROOT, ".env"));

const DEV = process.argv.includes("--dev") || process.env.NODE_ENV === "development";
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 3000);
const INTERNAL_PORT = Number(process.env.INTERNAL_PORT ?? 3311);
const APP_SECRET = process.env.APP_SECRET ?? "dev-secret-not-for-production";
const TRUST_PROXY = process.env.TRUST_PROXY ?? "true";
const TRUSTED_PROXY_CIDRS = (process.env.TRUSTED_PROXY_CIDRS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const INTERNAL_ORIGIN = `http://127.0.0.1:${INTERNAL_PORT}`;

process.env.NODE_ENV = DEV ? "development" : "production";

const { createEngine } = await import("./security/engine.mjs");
const { resolveClientIp, isInternal, isLoopback, normalizeIp, hashIp } = await import("./security/net.mjs");
const { LIMITS } = await import("./security/patterns.mjs");

/* ──────────────────────────── עצים שאסור לגעת בהם ───────────────────────── */

/** נתיבים שלעולם אינם נגישים מבחוץ — כל ניסיון נחשב חדירה */
const DENY_PREFIXES = [
  "/data/", "/scripts/", "/security/", "/tests/", "/src/", "/node_modules/", "/prisma/", "/sql/",
  "/.git", "/.env", "/.vscode", "/.aws", "/.ssh", "/.docker", "/.arena",
];
const DENY_FILES = new Set([
  "/package.json", "/package-lock.json", "/tsconfig.json", "/server.mjs", "/next.config.ts",
  "/postcss.config.mjs", "/eslint.config.mjs", "/.env", "/.env.local", "/.env.example",
  "/lemontank.db", "/data/lemontank.db",
]);

const engine = createEngine({ dbFile: process.env.DATABASE_FILE, appRoot: APP_ROOT, quiet: false });

/* ──────────────────────────────── עזרי בקשה ─────────────────────────────── */

function collectRequestInfo(req) {
  const rawHeaders = req.rawHeaders ?? [];
  const headers = {};
  const duplicateHeaders = [];
  let headerBytes = 0;

  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase();
    const value = rawHeaders[i + 1];
    headerBytes += name.length + value.length + 4;
    if (headers[name] === undefined) headers[name] = value;
    else if (!duplicateHeaders.includes(name)) duplicateHeaders.push(name);
  }

  const url = req.url ?? "/";
  const qIndex = url.indexOf("?");
  const rawPath = qIndex === -1 ? url : url.slice(0, qIndex);
  const rawQuery = qIndex === -1 ? "" : url.slice(qIndex + 1);

  // ניסיונות הברחת בקשות (Request Smuggling)
  let smuggling = null;
  if (headers["content-length"] !== undefined && headers["transfer-encoding"] !== undefined) smuggling = "Content-Length + Transfer-Encoding";
  else if (duplicateHeaders.includes("content-length")) smuggling = "Content-Length כפול";
  else if (duplicateHeaders.includes("transfer-encoding")) smuggling = "Transfer-Encoding כפול";
  else if (duplicateHeaders.includes("host")) smuggling = "Host כפול";

  const socketIp = req.socket?.remoteAddress ?? null;
  const { ip, via, chain } = resolveClientIp({ socketIp, headers: { get: (n) => headers[n] ?? null }, trustProxy: TRUST_PROXY, trustedProxyCidrs: TRUSTED_PROXY_CIDRS });

  return {
    ip,
    socketIp: normalizeIp(socketIp) ?? null,
    ipVia: via,
    xffChain: chain,
    peerInternal: isInternal(socketIp) || isLoopback(socketIp),
    method: (req.method ?? "GET").toUpperCase(),
    httpVersion: req.httpVersion,
    path: rawPath,
    query: rawQuery,
    host: headers["host"] ?? "",
    userAgent: headers["user-agent"] ?? "",
    referer: headers["referer"] ?? "",
    cookieHeader: headers["cookie"] ?? "",
    cookieBytes: (headers["cookie"] ?? "").length,
    headerMap: headers,
    duplicateHeaders,
    headerCount: rawHeaders.length / 2,
    headerBytes,
    smuggling,
  };
}

/** חתימה פנימית — האפליקציה יכולה לוודא שהבקשה עברה דרך השער */
function signInternal(ip, ts, fingerprint) {
  return crypto.createHmac("sha256", APP_SECRET).update(`${ip}|${ts}|${fingerprint}`).digest("hex").slice(0, 32);
}

/** טביעת אצבע של הלקוח — לריכוז תקיפות ולזיהוי החלפת זהות */
function fingerprintOf(info) {
  const material = [
    info.userAgent, info.headerMap["accept-language"], info.headerMap["accept"],
    info.headerMap["accept-encoding"], info.headerMap["sec-ch-ua"], info.headerMap["sec-ch-ua-platform"],
    info.ip, info.headerMap["upgrade-insecure-requests"] ?? "",
  ].join("|");
  return hashIp(crypto.createHash("sha256").update(material).digest("hex"), APP_SECRET);
}

/** מנקה כותרות שהלקוח שלח ויכולות להטעות את האפליקציה */
function sanitizeHeaders(info) {
  const headers = { ...info.headerMap };

  // מחיקת כותרות פנימיות שהגיעו מבחוץ (ניסיון להתחזות לשכבה הפנימית)
  for (const name of Object.keys(headers)) {
    if (name.startsWith("x-lt-")) delete headers[name];
  }
  // מחיקת כותרות פרוקסי מזויפות — נכתוב בעצמנו ערכים מהימנים
  delete headers["x-forwarded-for"];
  delete headers["x-real-ip"];
  delete headers["forwarded"];
  delete headers["via"];
  delete headers["proxy-connection"];
  delete headers["x-originating-ip"];
  delete headers["x-remote-addr"];
  delete headers["x-client-ip"];
  delete headers["x-proxy-id"];
  delete headers["x-forwarded-server"];
  delete headers["x-http-method-override"];
  delete headers["x-method-override"];
  delete headers["x-original-url"];
  delete headers["x-rewrite-url"];

  const ts = Date.now().toString(36);
  headers["x-forwarded-for"] = info.ip;
  headers["x-real-ip"] = info.ip;
  headers["x-lt-ip"] = info.ip;
  headers["x-lt-via"] = info.ipVia;
  headers["x-lt-fp"] = info.fingerprint;
  headers["x-lt-ts"] = ts;
  headers["x-lt-sig"] = signInternal(info.ip, ts, info.fingerprint);
  headers["x-lt-peer"] = info.peerInternal ? "internal" : "external";
  const proto = headers["x-forwarded-proto"];
  headers["x-lt-proto"] = proto === "http" || proto === "https" ? proto : (info.peerInternal ? "http" : "https");
  headers["x-request-id"] = headers["x-request-id"] ?? crypto.randomUUID();
  return headers;
}

/* ──────────────────────────────── תשובות חסימה ──────────────────────────── */

/**
 * יומן אבטחה בפורמט JSON-לכל-שורה — לשימוש fail2ban, ניטור ולוגרוטציה.
 * נכתב רק על חסימות וחסימות IP (לא על כל בקשה), כדי לא להעמיס על הדיסק.
 */
const LOG_DIR = path.join(APP_ROOT, "logs");
let logStream = null;

function securityLog(event, info, extra = {}) {
  try {
    if (!logStream) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      logStream = fs.createWriteStream(path.join(LOG_DIR, "security.log"), { flags: "a" });
    }
    logStream.write(
      JSON.stringify({
        event,                                  // blocked | banned
        ip: info.ip,                            // ← fail2ban קורא מכאן (חייב להיות אחרי event)
        time: new Date().toISOString(),
        method: info.method,
        path: (info.path ?? "").slice(0, 300),
        category: extra.category ?? null,
        reason: (extra.reason ?? "").slice(0, 200),
        userAgent: (info.userAgent ?? "").slice(0, 200),
        xff: info.xffChain?.length ? info.xffChain.join(",") : null,
        fingerprint: info.fingerprint ?? null,
      }) + "\n",
    );
  } catch {
    /* היומן לא מפיל בקשה */
  }
}

function securityHeaders(res, extra = {}) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
}

function deniedPage(reason, requestId, retryAfterSec) {
  const safeReason = String(reason ?? "").replace(/[<>&]/g, "");
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>הגישה נחסמה</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050508;color:#e8e8ef;
      font-family:system-ui,-apple-system,"Segoe UI",Rubik,Arial,sans-serif}
 .card{max-width:520px;padding:40px 34px;border-radius:22px;background:#0d0d14;border:1px solid rgba(247,194,43,.22);
       box-shadow:0 30px 90px -50px rgba(247,194,43,.5);text-align:center}
 .icon{font-size:44px;margin-bottom:14px}
 h1{margin:0 0 10px;font-size:22px;letter-spacing:-.02em}
 p{margin:0 0 8px;color:#a3a3b8;font-size:14.5px;line-height:1.65}
 code{direction:ltr;display:inline-block;background:#15151f;padding:3px 9px;border-radius:8px;font-size:12.5px;color:#f7c22b}
 .foot{margin-top:20px;font-size:12px;color:#5d5d72}
</style></head><body><div class="card">
 <div class="icon">🛡️</div>
 <h1>הבקשה נחסמה על ידי מערכת האבטחה</h1>
 <p>${safeReason}</p>
 ${retryAfterSec ? `<p>נסה שוב בעוד <b>${Math.ceil(retryAfterSec / 60)} דקות</b>.</p>` : ""}
 <p class="foot">מזהה בקשה: <code>${requestId}</code></p>
</div></body></html>`;
}

function sendBlocked(reqInfo, res, decision) {
  const requestId = crypto.randomUUID();
  const status = decision.status === 200 ? 403 : decision.status;
  const retryAfter = decision.retryAfterSec ? Math.max(1, Math.round(decision.retryAfterSec)) : null;
  const extra = retryAfter ? { "Retry-After": String(retryAfter) } : {};
  securityHeaders(res, extra);

  const isApi = reqInfo.path.startsWith("/api/") || reqInfo.path.startsWith("/_next/") ||
    /\.(json|svg|png|jpe?g|webp|css|js|mjs|woff2?|mp4|webm|vtt)$/i.test(reqInfo.path);

  if (isApi) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: false,
      error: {
        code: decision.banned ? "IP_BANNED" : "BLOCKED",
        message: decision.banned ? "הגישה מהכתובת שלך נחסמה על ידי מערכת האבטחה" : "הבקשה נחסמה על ידי מערכת האבטחה",
        reason: decision.category ?? undefined,
      },
      requestId,
    }));
    return;
  }

  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(deniedPage(decision.reason ?? "הבקשה סומנה כחשודה.", requestId, retryAfter));
}

/* ──────────────────────────────── השרת ──────────────────────────────────── */

const nextModule = await import("next");
const next = nextModule.default ?? nextModule;
const app = next({ dev: DEV, dir: APP_ROOT, hostname: "127.0.0.1", port: INTERNAL_PORT });
await app.prepare();

const handler = app.getRequestHandler();
const upgradeHandler = typeof app.getUpgradeHandler === "function" ? app.getUpgradeHandler() : null;

function onRequest(req, res) {
  const info = collectRequestInfo(req);

  // 0 — נתיבי מערכת שאסור לחשוף לעולם
  const lowerPath = info.path.toLowerCase();
  if (DENY_PREFIXES.some((p) => lowerPath.startsWith(p)) || DENY_FILES.has(lowerPath)) {
    engine.store.event({ kind: "system_path_probe", severity: "critical", ip: info.ip, detail: `${info.method} ${info.path.slice(0, 200)}` });
    engine.ban({ ip: info.ip, category: "probe", reason: `ניסיון גישה לקובץ מערכת: ${info.path.slice(0, 120)}`, severity: "critical", path: info.path, method: info.method, userAgent: info.userAgent });
    securityLog("banned", info, { category: "probe", reason: "system_path" });
    return sendBlocked(info, res, { status: 403, banned: true, reason: "ניסיון גישה לקובץ מערכת פנימי נרשם.",
      category: "probe", retryAfterSec: 3600 });
  }

  // 1 — מנוע האבטחה
  let decision;
  try {
    decision = engine.evaluate(info);
  } catch (err) {
    console.error("[security] engine error:", err?.message);
    decision = { action: "allow", status: 200 };
  }

  if (decision.action !== "allow") {
    if (decision.ban) {
      securityLog("banned", info, { category: decision.category, reason: decision.reason });
    } else {
      securityLog("blocked", info, { category: decision.category, reason: decision.reason });
    }
    return sendBlocked(info, res, decision);
  }

  // 2 — העברת בקשה נקייה לאפליקציה
  info.fingerprint = decision.fingerprint ?? fingerprintOf(info);
  const headers = sanitizeHeaders(info);
  req.headers = headers;
  const flat = [];
  for (const [k, v] of Object.entries(headers)) flat.push(k, v);
  req.rawHeaders = flat;

  if (DEV) {
    console.log(`[req] ${info.method} ${info.path} ip=${info.ip} via=${info.ipVia} score=${decision.score ?? 0}`);
  }

  // 3 — רישום תוצאת הבקשה (404 מרובה / כשלי התחברות) לאוטומציה של החסימות
  res.on("finish", () => {
    try {
      engine.afterResponse({ ip: info.ip, status: res.statusCode, path: info.path, method: info.method });
    } catch { /* לא מפיל בקשה */ }
  });

  return handler(req, res);
}

const server = http.createServer({
  maxHeaderSize: LIMITS.headerSize,
  insecureHTTPParser: false,
  joinDuplicateHeaders: false,
  requestTimeout: Number(process.env.REQUEST_TIMEOUT_MS ?? 300_000), // מאפשר העלאות וידאו ארוכות
  headersTimeout: Number(process.env.HEADERS_TIMEOUT_MS ?? 20_000),
  keepAliveTimeout: 5_000,
}, onRequest);

server.maxHeadersCount = LIMITS.headerCount;
server.on("clientError", (err, socket) => {
  const code = err?.code ?? "";
  const ip = normalizeIp(socket.remoteAddress) ?? "unknown";
  if (!isInternal(ip) && !isLoopback(ip)) {
    const count = engine.store.incr(`malformed:${ip}`, 300);
    if (count > 5) {
      engine.ban({ ip, category: "malformed", reason: `בקשות פגומות חוזרות (${code || "clientError"})`, severity: "warning" });
    } else {
      engine.store.event({ kind: "malformed_request", severity: "warning", ip, detail: code.slice(0, 80) });
    }
  }
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

if (upgradeHandler) server.on("upgrade", upgradeHandler);

server.on("listening", () => {
  const settings = engine.settings();
  console.log(`
╭──────────────────────────────────────────────────────────────╮
│  🍋 LemonTank Stream — שרת מאובטח                            │
╰──────────────────────────────────────────────────────────────╯
   🌐  כתובת:            http://${HOST}:${PORT}
   🔒  Next.js:           בתוך התהליך — אין פורט נפרד שחשוף לאינטרנט
   🛡️   מצב אבטחה:        ${settings.mode === "monitor" ? "MONITOR (לוג בלבד)" : "ENFORCE (חסימה פעילה)"}
   ⚡  חסימת IP אוטומטית: ${settings.autoban === "on" ? "פעילה" : "כבויה"}
   🧪  מלכודות:           ${settings.honeypot_paths === "on" ? `${settings.honeypot === "ban" ? "פעילות + חסימה" : "פעילות"}` : "כבויות"}
   🔎  מודיעין איומים:    ${engine.stats().intel.torCount} טווחי TOR · ${engine.stats().intel.datacenterCount} טווחי ענן
   📊  חסימות פעילות:     ${engine.stats().bans.active}
`);
});

server.listen(PORT, HOST);

/* סגירה מבוקרת */
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`\n[security] ${signal} — סוגר בצורה מבוקרת…`);
    server.close(() => {
      engine.close();
      app.close?.();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

process.on("unhandledRejection", (reason) => console.error("[security] unhandledRejection:", reason));
process.on("uncaughtException", (err) => console.error("[security] uncaughtException:", err));
