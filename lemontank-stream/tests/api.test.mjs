#!/usr/bin/env node
/**
 * בדיקות אינטגרציה ל-API של LemonTank Stream.
 *
 *   npm test                      → מריץ מול http://127.0.0.1:3000
 *   TEST_BASE_URL=http://host:port npm test
 *
 * הבדיקות דורשות שרת רץ ומסד מזורזע (node scripts/seed.mjs).
 * הן בודקות חוזי API והגנות אבטחה — לא את ה-UI.
 */

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { restoreSession, saveSecret, saveSession, savedSecret, totpCode } from "./helpers/admin-login.mjs";

const BASE = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@lemontank.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-2026!";

/** לקוח קטן עם עוגיות — כמו דפדפן, בלי תלויות */
class Client {
  constructor() {
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  store(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
      const [pair] = cookie.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  csrf() {
    return this.cookies.get("lt_csrf") ?? "";
  }

  async raw(path, options = {}) {
    const headers = { ...(options.headers ?? {}) };
    if (this.cookies.size) headers.cookie = this.cookieHeader();
    if (options.method && options.method !== "GET" && options.method !== "HEAD") {
      headers["x-csrf-token"] = options.csrf ?? this.csrf();
      headers.origin = BASE;
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${BASE}${path}`, { ...options, headers, redirect: "manual" });
    this.store(response);
    return response;
  }

  async json(path, options = {}) {
    const response = await this.raw(path, options);
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { status: response.status, body, headers: response.headers };
  }

  async get(path) {
    return this.json(path);
  }

  async post(path, data) {
    return this.json(path, { method: "POST", body: JSON.stringify(data) });
  }

  async patch(path, data) {
    return this.json(path, { method: "PATCH", body: JSON.stringify(data) });
  }

  async delete(path, data) {
    return this.json(path, { method: "DELETE", body: JSON.stringify(data ?? {}) });
  }

  /**
   * התחברות מלאה — כולל מסלול 2FA כשהחשבון מוגן.
   * (אזור הניהול דורש 2FA, ולכן הבדיקות עוברות את אותו מסלול שהאדם עובר.)
   */
  async login(email, password) {
    await this.raw("/login");
    const first = await this.post("/api/auth/login", { email, password });

    if (first.body?.data?.requires2fa && first.body?.data?.challenge) {
      const secret = savedSecret();
      if (!secret) return first;
      const done = await this.post("/api/auth/login", {
        challenge: first.body.data.challenge,
        totp: totpCode(secret),
      });
      if (done.body?.ok === true) {
        // גם את התוצאה השנייה מחזירים בפורמט זהה כדי ששאר הבדיקות לא ישתנו
        return { ...done, body: { ok: true, data: done.body.data } };
      }
      return done;
    }
    return first;
  }

  /** הפעלת 2FA על החשבון הזה — כדי שאזור הניהול ייפתח (מדיניות המבצר) */
  async enableTwoFactorIfNeeded() {
    const me = await this.get("/api/auth/me");
    const user = me.body?.data?.user ?? me.body?.data ?? null;
    if (user && Number(user.twofa_enabled) === 1) return { enabled: true, already: true };

    const setup = await this.post("/api/auth/2fa", { action: "setup" });
    const secret = setup.body?.data?.secret;
    if (!secret) return { enabled: false, reason: `setup_failed:${setup.status}` };

    const enabled = await this.post("/api/auth/2fa", { action: "enable", code: totpCode(secret) });
    if (enabled.body?.ok !== true) return { enabled: false, reason: `enable_failed:${enabled.status}` };

    saveSecret(secret);
    return { enabled: true, already: false };
  }
}

/** נרשם כמשתמש חינם טרי — כדי שהבדיקות יעבדו גם במערכת נקייה בלי משתמשי דמו */
async function freshFreeUser() {
  const c = new Client();
  await c.raw("/register");
  const email = `test-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}@example.com`;
  const res = await c.post("/api/auth/register", {
    name: "בודק בדיקות",
    email,
    password: "Test-Pass-2026!Strong",
    acceptTerms: true,
  });
  if (res.body?.ok !== true) return null;

  // חלק מהתצורות יוצרות סשן כבר בהרשמה; אם לא — מתחברים עם אותו חשבון
  if (!c.csrf() || !c.cookies.get("lt_session")) {
    const login = await c.login(email, "Test-Pass-2026!Strong");
    if (login.body?.ok !== true) return null;
  }
  return c;
}

/** מדלג על בדיקה אם השרת לא זמין/לא מזורזע, כדי לא להכשיל CI ריק */
async function serverReady() {
  try {
    const res = await fetch(`${BASE}/api/plans`, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

let ready = false;
let authOk = false;
let admin;

before(async () => {
  ready = await serverReady();
  if (!ready) {
    console.error(`\n⚠️  אין שרת ב-${BASE} — הבדיקות ידולגו. הרץ: npm run dev (או npm run start)\n`);
    return;
  }
  // קודם מנסים להמשיך סשן מנהל קיים (מכסת ההתחברות מוגבלת במכוון)
  admin = await restoreSession(Client, BASE);
  if (admin) {
    console.log("ℹ️  ממשיכים עם סשן מנהל קיים");
    authOk = true;
    return;
  }

  admin = new Client();
  const res = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (res.body?.ok === true) {
    // שכבת "המבצר": אזור הניהול דורש 2FA — מפעילים אותו על חשבון הבדיקות
    const twofa = await admin.enableTwoFactorIfNeeded();
    if (!twofa.enabled) console.error(`\n⚠️  הפעלת 2FA למנהל נכשלה: ${twofa.reason}\n`);
    saveSession(admin);
    authOk = true;
    return;
  }

  console.error(
    `\n⚠️  התחברות מנהל נכשלה (${res.status} ${res.body?.error?.code ?? "?"}) — בדיקות שדורשות סשן ידולגו.` +
      `\n    סיבות אפשריות: המסד לא מזורזע, סיסמה שונה, או הגבלת קצב התחברות (המתן 5 דקות).\n`,
  );
});

/** מדלג על בדיקה שדורשת סשן מנהל כשההתחברות לא הצליחה */
const requireAuth = (t) => {
  if (!ready) {
    t.skip("אין שרת");
    return false;
  }
  if (!authOk) {
    t.skip("אין סשן מנהל");
    return false;
  }
  return true;
};

describe("קטלוג ציבורי", () => {
  test("GET /api/plans מחזיר שני מסלולים (חינם + פלוס)", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    const { body } = await anon.get("/api/plans");
    assert.equal(body.ok, true);
    const codes = body.data.plans.map((p) => p.code).sort();
    assert.deepEqual(codes, ["free", "plus"]);
    const plus = body.data.plans.find((p) => p.code === "plus");
    assert.ok(plus.price_ils > 0, "לפלוס צריך להיות מחיר");
  });

  test("GET /api/titles מחזיר פריטים עם שדות בסיסיים", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    const { body } = await anon.get("/api/titles?limit=3");
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.data.items));
    for (const item of body.data.items) {
      assert.ok(item.id && item.name_he && ["movie", "series"].includes(item.kind));
      assert.ok(["free", "plus"].includes(item.plan_access));
    }
  });

  test("עמוד הבית נטען בשרת עם כותרות אבטחה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    const res = await anon.raw("/");
    assert.equal(res.status, 200);
    const csp = res.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src/, "חסר CSP");
    assert.match(csp, /nonce-/, "ה-CSP חייב nonce");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("referrer-policy") ?? "", /strict-origin/);
  });
});

describe("הגנות", () => {
  test("בקשה משנה-מצב בלי CSRF נדחית", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    await anon.raw("/");
    const res = await anon.post("/api/ratings", { title_id: 1, stars: 5 });
    // ללא טוקן בכלל: 403 מהשכבת ה-CSRF, או 401 אם אין סשן בכלל
    assert.ok([401, 403].includes(res.status), `התקבל ${res.status}`);
    assert.equal(res.body.ok, false);
  });

  test("CSRF שגוי נדחה עם קוד csrf_mismatch", async (t) => {
    if (!requireAuth(t)) return;
    const c = new Client();
    await c.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await c.json("/api/ratings", {
      method: "POST",
      csrf: "not-a-real-token",
      body: JSON.stringify({ title_id: 1, stars: 5 }),
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.details?.reason, "csrf_mismatch");
  });

  test("נתיבי ניהול חסומים לאורח", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    for (const path of ["/admin", "/account", "/my-list", "/watch/any-title"]) {
      const res = await anon.raw(path);
      assert.ok([302, 307, 308].includes(res.status), `${path} החזיר ${res.status}`);
      assert.match(res.headers.get("location") ?? "", /\/login/);
    }
  });

  test("ניסיון path traversal נחסם", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    for (const path of ["/legal/..%2f..%2fetc%2fpasswd", "/../../etc/passwd", "/api/media/..%2f..%2fpackage.json"]) {
      const res = await anon.raw(path);
      assert.ok([400, 401, 403, 404].includes(res.status), `${path} החזיר ${res.status}`);
    }
  });

  test("מחרוזת SQLi בפרמטר נחסמת בשכבת האבטחה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    const injection = encodeURIComponent("' OR 1=1 --");
    const { status, body } = await anon.get(`/api/titles?q=${injection}&limit=2`);
    // שתי שכבות מגנות: שער האבטחה חוסם את הדפוס (403), וכל שאילתה ממילא
    // עוברת parameter binding — כלומר גם בלי החסימה לא היה נגרם נזק.
    assert.equal(status, 403, "ניסיון הזרקת SQL אמור להיחסם");
    assert.equal(body.ok, false);
    assert.ok(!JSON.stringify(body).toLowerCase().includes("sqlite"), "אין לדלוף שגיאות SQL");
  });

  test("התחברות עם סיסמה שגויה נכשלת בלי לחשוף מידע", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const c = new Client();
    const res = await c.login(ADMIN_EMAIL, "wrong-password-123");
    // 401 = סיסמה שגויה · 423 = החשבון נעול זמנית אחרי ניסיונות · 429 = הגבלת קצב
    assert.ok([400, 401, 423, 429].includes(res.status), `התקבל ${res.status}`);
    assert.equal(res.body.ok, false);
    assert.ok(!JSON.stringify(res.body).includes("scrypt"), "אסור לחשוף פרטי hash");
  });

  test("אבטחת ראשים: אין X-Powered-By", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    const res = await anon.raw("/");
    assert.equal(res.headers.get("x-powered-by"), null);
  });
});

describe("הרשאות (RBAC)", () => {
  test("משתמש רגיל לא ניגש ל-API של ניהול", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const c = await freshFreeUser();
    if (!c) return t.skip("לא ניתן ליצור משתמש בדיקה (הרשמה סגורה או הגבלת קצב)");
    for (const path of ["/api/users", "/api/admin/stats", "/api/coupons", "/api/settings"]) {
      const res = await c.get(path);
      assert.equal(res.status, 403, `${path} החזיר ${res.status}`);
    }
  });

  test("מנהל רואה את רשימת המשתמשים", async (t) => {
    if (!requireAuth(t)) return;
    const { status, body } = await admin.get("/api/users?limit=5");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.data.items));
  });
});

describe("מנוי ותוכן פלוס", () => {
  test("משתמש חינם מקבל PLAN_REQUIRED על הורדה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const c = await freshFreeUser();
    if (!c) return t.skip("לא ניתן ליצור משתמש בדיקה (הרשמה סגורה או הגבלת קצב)");

    const plusTitles = await c.get("/api/titles?plan=plus&limit=1");
    const plusId = plusTitles.body?.data?.items?.[0]?.id;
    if (!plusId) return t.skip("אין כותרי פלוס בקטלוג — הוסף תוכן פלוס כדי לבדוק את הנעילה");

    const res = await c.post("/api/downloads", { title_id: plusId, quality: "720p" });
    assert.equal(res.status, 402);
    assert.equal(res.body.error.code, "PLAN_REQUIRED");
  });

  test("מדיה חסומה לאורח (אין גישה לבייטים בלי התחברות)", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    // במערכת נקייה אין נכסים — בכל מקרה אסור לקבל בייטים: 401 (אין הרשאה) או 404 (לא קיים)
    const res = await anon.get("/api/media/1");
    assert.ok([401, 404].includes(res.status), `התקבל ${res.status}`);
    assert.equal(res.body.ok, false);
    assert.ok(typeof res.body.error.code === "string");
  });
});

describe("חוזה תשובה אחיד", () => {
  test("הצלחה תמיד {ok:true,data} ושגיאה תמיד {ok:false,error{code,message}}", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    const ok = await anon.get("/api/plans");
    assert.equal(ok.body.ok, true);
    assert.ok(ok.body.data !== undefined);

    const fail = await anon.get("/api/titles/99999999");
    assert.equal(fail.body.ok, false);
    assert.ok(typeof fail.body.error.code === "string");
    assert.ok(typeof fail.body.error.message === "string");
  });
});
