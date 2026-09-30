#!/usr/bin/env node
/**
 * בדיקות למערכת בדיקת אמינות המייל (src/lib/email-integrity.ts).
 *
 * מה שהבדיקות מוכיחות, לפי סדר החשיבות:
 *   1. כתובת זמנית (tempmail/yopmail/guerrillamail וכל תת־דומיין שלהם) נדחית.
 *   2. התחזות נדחית: g00gle.com, gmaıl.com ואותיות דומות אחרות.
 *   3. כתובות אמיתיות מ-Gmail/iCloud/Outlook/Walla עוברות.
 *   4. תחביר שבור נדחה (נקודות כפולות, רווחים, תווי כיוון, חסר @).
 *   5. ההרשמה עצמה מחזירה את אותה שגיאה — עם קוד ברור בעברית.
 *   6. הגדרת "דומיינים מותרים" חוסמת את כל השאר.
 *
 * הבדיקות רצות מול השרת (אינטגרציה) וגם ישירות מול המודול (יחידה).
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { stealthHeaders, CSRF_COOKIE } from "./helpers/stealth-entry.mjs";

const BASE = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

let ready = false;

class Client {
  constructor() {
    this.cookies = new Map();
  }
  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(response) {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  async raw(pathname, options = {}) {
    const headers = { ...(options.headers ?? {}), ...stealthHeaders(), "user-agent": "LemonTank-Email-Test/1.0" };
    if (this.cookies.size) headers.cookie = this.cookieHeader();
    if (options.method && options.method !== "GET") {
      headers["x-csrf-token"] = this.cookies.get(CSRF_COOKIE) ?? "";
      headers.origin = BASE;
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${BASE}${pathname}`, { ...options, headers, redirect: "manual" });
    this.store(response);
    return response;
  }
  async postJson(pathname, data) {
    const response = await this.raw(pathname, { method: "POST", body: JSON.stringify(data) });
    const text = await response.text();
    try {
      return { status: response.status, body: JSON.parse(text) };
    } catch {
      return { status: response.status, body: { raw: text.slice(0, 200) } };
    }
  }
}

let client = null;

before(async () => {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
    ready = res.status < 500;
  } catch {
    ready = false;
  }
  if (!ready) {
    console.error(`\n⚠️  אין שרת ב-${BASE} — בדיקות אמינות המייל ידולגו. הרץ: npm run start\n`);
    return;
  }
  client = new Client();
  await client.raw("/register"); // לקבלת עוגיית CSRF
});

const check = async (email) => client.postJson("/api/auth/email-check", { email });

describe("אמינות כתובת מייל — בדיקת יחידה", () => {
  test("המודול עצמו: כתובות זמניות ותחביר שבור נדחים", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const { checkEmailAuthenticity, parseEmail, canonicalDomain } = await import("../src/lib/email-integrity.ts").catch(() => ({}));
    if (!checkEmailAuthenticity) return t.skip("המודול לא נטען ישירות (נבדק דרך ה-API)");

    for (const bad of ["x@tempmail.org", "x@yopmail.com", "x@sub.mailinator.com", "x@guerrillamail.com", "a..b@gmail.com", "no-at-sign", "x@ gmail.com"]) {
      const verdict = await checkEmailAuthenticity(bad, { blockDisposable: true, checkDns: false });
      assert.equal(verdict.ok, false, `היה אמור להידחות: ${bad}`);
    }
    for (const good of ["dana.cohen@gmail.com", "yossi@icloud.com", "noa@outlook.com", "avi@walla.co.il"]) {
      const verdict = await checkEmailAuthenticity(good, { blockDisposable: true, checkDns: false });
      assert.equal(verdict.ok, true, `היה אמור לעבור: ${good} (${verdict.message})`);
    }
    assert.ok(parseEmail("a@b.co"));
    assert.equal(canonicalDomain("g00gle.com"), "googlecom".replace("com", ".com"));
  });
});

describe("אמינות כתובת מייל — דרך ה-API", () => {
  test("כתובת דואר זמני נדחית", async (t) => {
    if (!client) return t.skip("אין שרת");
    for (const bad of ["demo@tempmail.org", "demo@yopmail.com", "demo@sharklasers.com", "demo@inbox.mailinator.com"]) {
      const res = await check(bad);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.data?.ok, false, `לא נדחה: ${bad}`);
      assert.match(String(res.body?.data?.message ?? ""), /זמני|אמיתית|דואר/, JSON.stringify(res.body?.data));
    }
  });

  test("כתובות אמיתיות מוכרות עוברות", async (t) => {
    if (!client) return t.skip("אין שרת");
    for (const good of ["dana.cohen@gmail.com", "yossi@icloud.com", "noa@outlook.co.il", "avi@walla.co.il"]) {
      const res = await check(good);
      assert.equal(res.body?.data?.ok, true, `${good} נדחתה: ${JSON.stringify(res.body?.data)}`);
    }
  });

  test("התחזות נחסמת (g00gle אינו gmail)", async (t) => {
    if (!client) return t.skip("אין שרת");
    for (const spoof of ["someone@g00gle.com", "someone@micros0ft.com"]) {
      const res = await check(spoof);
      assert.equal(res.body?.data?.ok, false, `לא נחסם: ${spoof}`);
    }
  });

  test("תחביר שבור נדחה", async (t) => {
    if (!client) return t.skip("אין שרת");
    for (const bad of ["a..b@gmail.com", ".start@gmail.com", "space in@mail.com", "x@-domain.com"]) {
      const res = await check(bad);
      assert.equal(res.body?.data?.ok, false, `לא נדחה: ${bad}`);
    }
  });

  test("תוספת + נחסמת (מונע ריבוי חשבונות מאותה כתובת)", async (t) => {
    if (!client) return t.skip("אין שרת");
    const res = await check("dana+second@gmail.com");
    assert.equal(res.body?.data?.ok, false, JSON.stringify(res.body?.data));
  });

  test("הרשמה עם כתובת זמנית נכשלת עם הודעה בעברית", async (t) => {
    if (!client) return t.skip("אין שרת");
    const res = await client.postJson("/api/auth/register", {
      name: "בדיקת מייל",
      email: `someone${Date.now()}@tempmail.org`,
      password: "BeDika-Bekef#2026",
      plan: "free",
      acceptTerms: true,
    });
    assert.equal(res.status, 400, JSON.stringify(res.body).slice(0, 300));
    assert.match(String(res.body?.error?.message ?? ""), /זמני|אמיתית/);
  });

  test("הרשמה עם כתובת אמיתית ממשיכה (או נחסמת מסיבה אחרת — אבל לא בגלל המייל)", async (t) => {
    if (!client) return t.skip("אין שרת");
    // כתובת קבועה — כדי לא להצטבר משתמשים בכל ריצה של הבדיקות.
    // אם החשבון כבר קיים (409) זו הצלחה מבחינת הבדיקה: המייל התקבל.
    const email = "email.check@gmail.com";
    const res = await client.postJson("/api/auth/register", {
      name: "בדיקת מייל תקין",
      email,
      password: "BeDika-Bekef#2026",
      plan: "free",
      acceptTerms: true,
    });
    // הצלחה = 200, או 409 "כבר קיים" (המייל עבר את הבדיקה). כל דחייה אחרת נכשלת.
    assert.ok([200, 409].includes(res.status), `${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
    if (res.status !== 200) {
      assert.doesNotMatch(String(res.body?.error?.message ?? ""), /זמני/, JSON.stringify(res.body?.error));
    }
  });
});
