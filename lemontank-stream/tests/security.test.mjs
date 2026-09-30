/**
 * בדיקות אינטגרציה לשכבת האבטחה — רצות מול השרת החי.
 *
 *   npm test                                   (השרת על 127.0.0.1:3000)
 *   TEST_BASE_URL=http://host:port npm test
 *
 * הערה חשובה: הבדיקות "מתחזות" ללקוח חיצוני בעזרת X-Forwarded-For. כתובות
 * לדוגמה נלקחות מטווחים ציבוריים שאינם בשימוש, כדי לא לחסום את 127.0.0.1.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { stealthHeaders, CSRF_COOKIE, SESSION_COOKIE, STEALTH_ON } from "./helpers/stealth-entry.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

let serverUp = false;
try {
  const probe = await fetch(`${BASE}/api/plans`, { redirect: "manual" });
  serverUp = probe.status < 500;
} catch {
  serverUp = false;
}

if (!serverUp) {
  console.error(`\n⚠️  אין שרת ב-${BASE} — בדיקות האבטחה ידולגו. הרץ: npm run start\n`);
}

const t = (name, fn) => test(name, { skip: !serverUp }, fn);

/**
 * לקוח חיצוני מדומה. כל בדיקה מקבלת כתובת ייחודית — אחרת בדיקה שנחסמה
 * "מדביקה" לבדיקה אחרת (המערכת חוסמת לפי IP, וזה בדיוק הרעיון).
 */
let ipCounter = 1;
// שני אוקטטים אקראיים בכל ריצה — כדי שריצה חדשה לא "תיפול" על חסימות מריצה קודמת
const ipBase = `45.${150 + Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 250)}`;
const makeIp = () => `${ipBase}.${ipCounter++}`;

async function probe(pathname, { ip = makeIp(), headers = {}, method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    redirect: "manual",
    headers: { "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/122 Safari/537.36", "accept-language": "he-IL", ...stealthHeaders(), ...headers },
    body,
  });
  return { status: res.status, headers: res.headers, text: await res.text(), ip };
}

/* ────────────────────────────── כותרות אבטחה ────────────────────────────── */

t("כותרות אבטחה קיימות בכל תשובה", async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  // במצב חמקן: no-referrer (בלי דליפת נתיב למקורות חיצוניים)
  assert.match(res.headers.get("referrer-policy") ?? "", STEALTH_ON ? /no-referrer/ : /strict-origin/);
  assert.equal(res.headers.get("x-powered-by"), null);
  assert.equal(res.headers.get("server"), null, "אין חשיפת שם שרת");
});

t("האתר מסתיר את עצמו: אין גרסה, אין נתיבי מערכת", async () => {
  for (const p of ["/package.json", "/data/lemontank.db", "/scripts/seed.mjs", "/.env.local", "/security/engine.mjs"]) {
    const res = await probe(p);
    assert.ok([403, 404].includes(res.status), `${p} → ${res.status}`);
  }
});

/* ────────────────────────────── חסימת תקיפות ─────────────────────────────── */

t("SQL Injection בפרמטר נחסם וכתובת ה-IP נחסמת", async () => {
  const ip = makeIp();
  const first = await probe("/movies?q=1+UNION+SELECT+name_he+FROM+users", { ip });
  assert.equal(first.status, 403);

  const second = await probe("/movies", { ip });
  assert.equal(second.status, 403, "הכתובת נשארת חסומה גם בבקשה תמימה");
  assert.match(second.text + first.text, /אבטחה|חסומ/);
});

t("XSS בפרמטר נחסם", async () => {
  const res = await probe("/search?q=%3Cscript%3Ealert(1)%3C/script%3E");
  assert.equal(res.status, 403);
});

t("חדירת נתיבים נחסמת", async () => {
  const res = await probe("/static/../../../../etc/passwd");
  assert.equal(res.status, 403);
});

t("נתיבי מלכודת נחסמים", async () => {
  for (const p of ["/wp-login.php", "/.env", "/.git/config", "/phpmyadmin/index.php"]) {
    const res = await probe(p);
    assert.equal(res.status, 403, `${p} → ${res.status}`);
  }
});

t("כלי יירוט וסורקים נחסמים", async () => {
  const burp = await probe("/api/auth/login", {
    method: "POST",
    headers: { "proxy-connection": "keep-alive", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(burp.status, 403, "Burp (Proxy-Connection)");

  const sqlmap = await probe("/", { headers: { "user-agent": "sqlmap/1.7#stable" } });
  assert.equal(sqlmap.status, 403, "sqlmap");

  const zap = await probe("/", { headers: { "user-agent": "Mozilla/5.0 OWASP ZAP 2.14.0" } });
  assert.equal(zap.status, 403, "OWASP ZAP");
});

// הערה: TRACE נחסמת בשער (security/self-test.mjs בודק אותה), אבל fetch של Node
// מסרב לשלוח מתודה כזו — לכן היא נבדקת בבדיקה העצמית ולא כאן.

t("זיוף כותרות IP לא עוקף את המערכת", async () => {
  // מנסים להתחזות למנהל מקומי עם כותרות פנימיות מזויפות
  const res = await probe("/api/admin/security/bans", {
    headers: { "x-lt-ip": "127.0.0.1", "x-lt-sig": "deadbeef", "x-lt-peer": "internal", "x-internal-report": "dev" },
  });
  assert.notEqual(res.status, 200, "הכותרות הפנימיות לא מתקבלות מבחוץ");
});

/* ────────────────────────────── לא לחסום סתם ─────────────────────────────── */

t("גלישה לגיטימית לא נחסמת", async () => {
  const ip = makeIp();
  const pages = ["/", "/movies", "/series", "/plans", "/genres", "/login", "/register"];

  // דף כותר נבדק רק אם יש כותר בקטלוג: האתר נשלח עם קטלוג ריק בכוונה
  // (רק הבעלים מוסיף תוכן), ולכן אין slug קבוע שאפשר להניח עליו.
  const list = await probe("/api/titles?limit=1", { ip });
  const slug = list.body?.data?.items?.[0]?.slug ?? null;
  if (slug) pages.push(`/title/${slug}`);

  for (const page of pages) {
    const res = await probe(page, { ip });
    assert.equal(res.status, 200, `${page} → ${res.status}`);
  }
});

/* ─────────────── הגבלת קצב כברירת מחדל (לקח מהמדידה) ─────────────── */

/**
 * הבאג שנחשף במדידת ההתקפות: ההגבלה הייתה **אופציונלית** — כל נתיב שלא
 * הוסיפו לו כלל במפורש היה ללא הגבלה בכלל. נתיב ציבורי אחד שנשכח = מכונת
 * הצפה. הבדיקה כאן נכשלת אם מישהו יוסיף בעתיד נתיב בלי הגנה, כי היא
 * בודקת נתיב שאין לו כלל מפורש בקוד.
 */
t("נתיב בלי כלל מפורש עדיין מוגבל (ברירת מחדל)", async () => {
  const ip = makeIp();
  let blocked = 0;
  let sawOk = 0;
  for (let i = 0; i < 260; i += 1) {
    const response = await probe(`/api/genres?limit=1&p=${i}`, { ip });
    if (response.status === 429) blocked += 1;
    if (response.status === 200) sawOk += 1;
  }
  assert.ok(sawOk > 0, "הנתיב אמור לעבוד לפני החסימה");
  assert.ok(blocked > 0, "נתיב בלי rateLimit מפורש חייב עדיין להיחסם אחרי המכסה (240/דקה)");
});

t("קצב גלישה אנושי לא נחסם", async () => {
  const ip = makeIp();
  for (let i = 0; i < 20; i += 1) {
    const response = await probe(i % 2 ? "/movies" : "/", { ip });
    assert.notEqual(response.status, 429, "גלישה רגילה לא אמורה להיחסם");
  }
});

t("חיפוש בעברית עם גרש לא נחסם", async () => {
  const res = await probe("/search?q=rock%27n%27roll");
  assert.equal(res.status, 200);
});

test("טבלת זמני החסימה זהה בשני הצדדים (JS ו-TypeScript)", async () => {
  const { openStore, banTtlSeconds } = await import(path.join(ROOT, "security/store.mjs"));
  void openStore;

  // קוראים את הערכי ה-TS מתוך קובץ המקור — הגנה מפני פיצול בין השכבות
  const fs = await import("node:fs");
  const tsSource = fs.readFileSync(path.join(ROOT, "src/lib/security/bans.ts"), "utf8");
  const tsBlock = tsSource.slice(tsSource.indexOf("export const BAN_TTL"), tsSource.indexOf("const MAX_TTL"));
  const tsTtl = Object.fromEntries([...tsBlock.matchAll(/(\w+):\s*([\d_]+)/g)].map((m) => [m[1], Number(m[2].replace(/_/g, ""))]));

  for (const [category, seconds] of Object.entries(tsTtl)) {
    assert.equal(banTtlSeconds(category, 1), seconds, `פער בקטגוריה ${category}`);
  }
  assert.equal(banTtlSeconds("honeypot", 3), 86_400 * 4);
  assert.equal(banTtlSeconds("manual", 12), 2_592_000, "תקרה של 30 יום");
});

test("מנוע האבטחה עובר בדיקה עצמית מלאה", async () => {
  const { runSelfTest } = await import(path.join(ROOT, "security/self-test.mjs"));
  const results = runSelfTest();
  const failed = results.filter((r) => !r.pass);
  assert.equal(failed.length, 0, `נכשלו: ${failed.map((f) => f.name).join(", ")}`);
});
