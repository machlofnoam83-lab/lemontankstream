#!/usr/bin/env node
/**
 * בדיקות אינטגרציה לחמש מערכות הפיצ'רים שנוספו:
 *   1. הישגים ותגים        4. ניוזלטר
 *   2. צפייה משותפת        5. מפתחות API ו-API ציבורי
 *   3. דגלי פיצ'רים
 *
 * דורש שרת רץ (`npm run start`) ומסד מזורזע. אם השרת למטה — הבדיקות מדלגות.
 */

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { restoreSession, saveSecret, saveSession, savedSecret, stepUp, totpCode } from "./helpers/admin-login.mjs";

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



/** מדלג על בדיקה אם השרת לא זמין — כדי לא להכשיל סביבה ריקה */
async function serverReady() {
  try {
    const res = await fetch(`${BASE}/api/plans`, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

let ready = false;
let admin = null;

before(async () => {
  ready = await serverReady();
  if (!ready) {
    console.error(`\n⚠️  אין שרת ב-${BASE} — בדיקות הפיצ'רים ידולגו. הרץ: npm run start\n`);
    return;
  }
  admin = await restoreSession(Client, BASE);
  if (admin) {
    console.log("ℹ️  ממשיכים עם סשן מנהל קיים");
  } else {
    admin = new Client();
    const login = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (login.body?.ok === true) {
      const twofa = await admin.enableTwoFactorIfNeeded();
      if (!twofa.enabled) console.error(`\n⚠️  הפעלת 2FA למנהל נכשלה: ${twofa.reason}\n`);
      saveSession(admin);
    } else {
      console.error("\n⚠️  התחברות מנהל נכשלה — בדיקות הפיצ'רים ידולגו\n");
      admin = null;
      return;
    }
  }

  // פעולות רגישות (מפתחות API, מחיקות, ייצוא) דורשות אימות מחדש בתוך חלון קצר.
  const stepped = await stepUp(admin, ADMIN_PASSWORD);
  if (!stepped.ok) console.error(`\n⚠️  אימות מחדש נכשל (${stepped.status}) — פעולות רגישות עלולות להיחסם\n`);
});

/**
 * הבדיקות נרשמות תמיד, והדילוג נעשה בזמן ההרצה — אחרי ש-hook ה-before
 * בדק אם השרת למעלה ואם יש סשן מנהל. (skip בהרשמה היה קופא על "אין שרת".)
 */
const maybe = (name, fn) =>
  test(name, async (t) => {
    if (!ready) return t.skip("אין שרת ב-3000");
    if (!admin) return t.skip("אין סשן מנהל");
    return fn(t);
  });

/* ───────────────────────────── 1. הישגים ───────────────────────────── */

describe("הישגים ותגים", () => {
  maybe("GET /api/achievements מחזיר תגים, נקודות והתקדמות", async () => {
    const res = await admin.get("/api/achievements");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const data = res.body.data;
    assert.ok(Array.isArray(data.badges) && data.badges.length >= 15, "קטלוג התגים נטען");
    assert.equal(typeof data.points, "number");
    assert.ok(data.totalCount === data.badges.length);
    for (const badge of data.badges) {
      assert.ok(badge.code && badge.name && badge.icon, "לכל תג יש קוד, שם ואייקון");
      assert.ok(badge.criterion.target > 0, "לכל תג יש יעד מדיד");
      assert.ok(badge.percent >= 0 && badge.percent <= 100, "אחוז התקדמות תקין");
      assert.equal(typeof badge.earned, "boolean");
    }
  });

  maybe("תג מוענק פעם אחת — לא מוכפל ולא נמחק", async () => {
    const first = await admin.post("/api/achievements", {});
    assert.equal(first.body.ok, true);
    const earnedFirst = first.body.data.earnedCount;

    const second = await admin.post("/api/achievements", {});
    assert.equal(second.body.ok, true);
    assert.equal(second.body.data.earnedCount, earnedFirst, "הרצה חוזרת לא מוסיפה תגים");
    assert.equal(second.body.data.newlyEarned.length, 0, "אין הענקה כפולה");
  });

  maybe("תג שהושג לא נעלם גם אחרי מחיקת הפעילות שממנה הוענק", async () => {
    const before = (await admin.get("/api/achievements")).body.data;
    const earned = before.badges.filter((b) => b.earned).map((b) => b.code);
    if (!earned.length) return; // אין עדיין תגים בחשבון הזה

    await admin.delete("/api/progress", { all: true });
    const after = (await admin.get("/api/achievements")).body.data;
    for (const code of earned) {
      assert.ok(after.badges.find((b) => b.code === code)?.earned, `התג ${code} נשאר בהיסטוריה`);
    }
  });

  maybe("טבלת המצטיינים לא חושפת אימיילים או Hash", async () => {
    const res = await admin.get("/api/achievements");
    const board = res.body.data.leaderboard;
    assert.ok(Array.isArray(board));
    const serialized = JSON.stringify(board);
    assert.doesNotMatch(serialized, /@/, "בלי כתובות אימייל");
    assert.doesNotMatch(serialized, /password|hash|scrypt/i, "בלי סודות");
  });
});

/* ─────────────────────── 2. צפייה משותפת ─────────────────────── */

describe("צפייה משותפת", () => {
  let partyId = null;
  let title = null;

  maybe("פותחים חדר — מקבלים קוד הצטרפות", async () => {
    const list = await admin.get("/api/titles?limit=1");
    title = list.body?.data?.items?.[0] ?? list.body?.data?.titles?.[0];
    assert.ok(title, "יש כותר זמין");

    const res = await admin.post("/api/parties", { title_id: title.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    partyId = res.body.data.party.id;
    assert.match(partyId, /^[A-Z2-9]{8}$/, "קוד חדר באורך 8 תווים קריאים");
    assert.equal(res.body.data.party.host_id > 0, true);
    assert.equal(Number(res.body.data.party.is_playing), 0);
  });

  maybe("חדר לא תקין מחזיר 404 ולא יוצר רשומה", async () => {
    const res = await admin.post("/api/parties", { title_id: 99999999 });
    assert.equal(res.status, 404);
  });

  maybe("קריאת מצב החדר מחזירה את המשתתפים", async () => {
    const res = await admin.get(`/api/parties/${partyId}`);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.data.party.members.some((m) => m.user_id > 0), "המארח חבר בחדר");
  });

  maybe("מיקום מתעדכן ונשמר (המארח קובע)", async () => {
    const res = await admin.patch(`/api/parties/${partyId}`, { position_sec: 321, is_playing: true });
    assert.equal(res.body.ok, true);
    assert.equal(Math.round(res.body.data.party.position_sec), 321);
    assert.equal(Number(res.body.data.party.is_playing), 1);

    const check = await admin.get(`/api/parties/${partyId}`);
    assert.equal(Math.round(check.body.data.party.position_sec), 321, "המצב נשמר בשרת");
  });

  maybe("מי שאינו מארח לא יכול לשנות מצב", async () => {
    const guest = await freshFreeUser();
    if (!guest) return;
    // הצטרפות
    const join = await guest.post(`/api/parties/${partyId}/join`, {});
    assert.equal(join.body.ok, true);
    // ניסיון לקבוע מיקום — נדחה
    const attempt = await guest.patch(`/api/parties/${partyId}`, { position_sec: 9999 });
    assert.equal(attempt.status, 403, "רק המארח קובע את המיקום");
    // והמיקום לא זז
    const check = await admin.get(`/api/parties/${partyId}`);
    assert.notEqual(Math.round(check.body.data.party.position_sec), 9999);
  });

  maybe("מי שלא הצטרף לא יכול לקרוא מצב החדר", async () => {
    const outsider = await freshFreeUser();
    if (!outsider) return;
    const res = await outsider.get(`/api/parties/${partyId}`);
    assert.equal(res.status, 403, "חדר הוא לחברים בלבד");
    assert.equal(res.body.ok, false);
  });

  maybe("הקוד בכתובת לא מבחין בין אותיות קטנות לגדולות", async () => {
    const res = await admin.get(`/api/parties/${partyId.toLowerCase()}`);
    assert.equal(res.body.ok, true);
  });

  maybe("סגירת החדר מסירה אותו גם מהרשימה", async () => {
    const res = await admin.delete(`/api/parties/${partyId}`, {});
    assert.equal(res.body.ok, true);
    const list = await admin.get("/api/parties");
    assert.equal(list.body.data.parties.some((p) => p.id === partyId), false, "החדר לא מופיע יותר");
  });
});

/* ────────────────────── 3. מפתחות API ────────────────────── */

describe("מפתחות API ו-API ציבורי", () => {
  let apiKey = null;
  let keyId = null;

  maybe("יצירת מפתח מחזירה סוד פעם אחת בלבד", async () => {
    const res = await admin.post("/api/keys", { name: "בדיקה אוטומטית", scopes: ["read"], rate_limit: 60 });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    apiKey = res.body.data.key;
    keyId = res.body.data.record.id;
    assert.match(apiKey, /^lt_live_[a-z0-9]{38}$/, "מבנה המפתח תקין");
    assert.ok(!JSON.stringify(res.body.data.record).includes(apiKey.slice(10)), "הסוד לא נשמר ברשומה");
  });

  maybe("הרשימה מציגה קידומת בלבד — בלי הסוד", async () => {
    const res = await admin.get("/api/keys");
    assert.equal(res.body.ok, true);
    const row = res.body.data.keys.find((k) => k.id === keyId);
    assert.ok(row, "המפתח ברשימה");
    assert.ok(!JSON.stringify(row).includes(apiKey), "הסוד המלא לא מוחזר ברשימה");
    assert.match(row.prefix, /^lt_live_/);
  });

  maybe("Bearer עובד מול /api/v1/titles", async () => {
    const res = await fetch(`${BASE}/api/v1/titles?limit=3`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.data.items));
    assert.ok(body.data.total >= 0);
  });

  maybe("בלי מפתח — 401, ומפתח מזויף נדחה", async () => {
    const anon = await fetch(`${BASE}/api/v1/titles`);
    assert.ok([401, 403].includes(anon.status), "אין גישה אנונימית ל-API הציבורי");

    const fake = await fetch(`${BASE}/api/v1/titles`, {
      headers: { authorization: `Bearer lt_live_${"a".repeat(38)}` },
    });
    assert.ok([401, 403].includes(fake.status), "מפתח מומצא נדחה");
  });

  maybe("פרטי כותר בודד + רשימת פרקים", async () => {
    const list = await fetch(`${BASE}/api/v1/titles?limit=1`, { headers: { authorization: `Bearer ${apiKey}` } });
    const first = (await list.json()).data.items[0];
    assert.ok(first?.slug, "יש כותר לחיפוש");

    const res = await fetch(`${BASE}/api/v1/titles/${first.slug}`, { headers: { authorization: `Bearer ${apiKey}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.title.slug, first.slug);
    assert.ok(Array.isArray(body.data.episodes));
    assert.doesNotMatch(JSON.stringify(body.data.title), /video_url|storage|video_asset/i, "אין חשיפת מקורות וידאו");
  });

  maybe("/api/v1/me מזהה את בעל המפתח", async () => {
    const res = await fetch(`${BASE}/api/v1/me`, { headers: { authorization: `Bearer ${apiKey}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.key.name, "בדיקה אוטומטית");
    assert.ok(body.data.user.id > 0);
    assert.ok(!JSON.stringify(body.data).includes("password"), "אין סודות בתשובה");
  });

  maybe("ביטול מפתח חוסם אותו מיד", async () => {
    const before = await fetch(`${BASE}/api/v1/me`, { headers: { authorization: `Bearer ${apiKey}` } });
    assert.equal(before.status, 200);

    const revoke = await admin.delete(`/api/keys/${keyId}`, {});
    assert.equal(revoke.body.ok, true);

    const after = await fetch(`${BASE}/api/v1/me`, { headers: { authorization: `Bearer ${apiKey}` } });
    assert.ok([401, 403].includes(after.status), "המפתח המבוטל לא עובד יותר");
  });

  maybe("ביטול מפתח של מישהו אחר לא עובד", async () => {
    const other = await freshFreeUser();
    if (!other) return;
    const res = await other.delete(`/api/keys/${keyId}`, {});
    // 404 = "לא שלך / לא קיים", 403 = נחסם עוד קודם (נדרש אימות מחדש).
    // בשני המקרים המפתח נשאר בתוקף — זו התכונה שנבדקת כאן.
    assert.ok([403, 404].includes(res.status), `צפוי 403/404, התקבל ${res.status}`);
    assert.notEqual(res.body?.ok, true, "המפתח של אחר לא בוטל");
  });
});

/* ──────────────────────── 4. ניוזלטר ──────────────────────── */

describe("ניוזלטר", () => {
  const email = `news-${Date.now().toString(36)}@example.com`;
  let confirmUrl = null;

  maybe("הרשמה מחזירה קישור אישור (double opt-in)", async () => {
    const res = await admin.post("/api/newsletter", { email, source: "test" });
    assert.equal(res.body.ok, true);
    confirmUrl = res.body.data.confirmUrl;
    assert.match(confirmUrl, /^\/api\/newsletter\/confirm\?token=[a-f0-9]{48}&email=/);
  });

  maybe("לפני אישור — הרשומה מסומנת כממתינה", async () => {
    const res = await admin.get("/api/admin/newsletter");
    assert.equal(res.body.ok, true);
    const row = res.body.data.subscribers.find((s) => s.email === email);
    assert.ok(row, "הנרשם מופיע ברשימה");
    assert.equal(Number(row.confirmed), 0, "עוד לא אושר");
  });

  maybe("קישור אישור שגוי לא מאשר אף אחד", async () => {
    const res = await fetch(`${BASE}/api/newsletter/confirm?token=${"b".repeat(48)}&email=${encodeURIComponent(email)}`, {
      redirect: "manual",
    });
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /newsletter=invalid/);
  });

  maybe("אישור נכון מסמן כמאושר", async () => {
    const res = await fetch(`${BASE}${confirmUrl}`, { redirect: "manual" });
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /newsletter=confirmed/);

    const check = await admin.get("/api/admin/newsletter");
    const row = check.body.data.subscribers.find((s) => s.email === email);
    assert.equal(Number(row.confirmed), 1, "מסומן כמאושר");
  });

  maybe("הרשמה כפולה לא יוצרת שורה כפולה", async () => {
    await admin.post("/api/newsletter", { email, source: "test-again" });
    const res = await admin.get("/api/admin/newsletter");
    const rows = res.body.data.subscribers.filter((s) => s.email === email);
    assert.equal(rows.length, 1, "שורה אחת לכל כתובת");
  });

  maybe("הסרה מסירה מהרשימה מיד", async () => {
    const res = await admin.delete("/api/newsletter", { email });
    assert.equal(res.body.ok, true);
    const check = await admin.get("/api/admin/newsletter");
    assert.equal(check.body.data.subscribers.some((s) => s.email === email), false, "הוסר");
  });

  maybe("שליחת עדכון מדווחת כמה נמענים", async () => {
    const res = await admin.post("/api/admin/newsletter", {
      subject: "בדיקה אוטומטית",
      body: "זהו תוכן בדיקה — לא נשלח באמת.",
      notify_users: false,
    });
    assert.equal(res.body.ok, true);
    assert.ok(res.body.data.emailRecipients >= 0);
  });

  maybe("לא-מנהל לא ניגש לרשימת התפוצה", async () => {
    const plain = await freshFreeUser();
    if (!plain) return;
    const res = await plain.get("/api/admin/newsletter");
    assert.ok([401, 403].includes(res.status), "גישה למנהלים בלבד");
  });
});

/* ───────────────────── 5. דגלי פיצ'רים ───────────────────── */

describe("דגלי פיצ'רים", () => {
  maybe("רשימת הדגלים כוללת את הפיצ'רים החדשים", async () => {
    const res = await admin.get("/api/features");
    assert.equal(res.body.ok, true);
    const keys = res.body.data.flags.map((f) => f.key);
    for (const key of ["watch_party", "achievements", "developer_api", "newsletter", "badges"]) {
      assert.ok(keys.includes(key), `הדגל ${key} קיים`);
    }
  });

  maybe("כיבוי דגל צפייה משותפת חוסם פתיחת חדר", async () => {
    const off = await admin.patch("/api/features", { key: "watch_party", enabled: false });
    assert.equal(off.body.ok, true);

    const list = await admin.get("/api/titles?limit=1");
    const title = list.body?.data?.items?.[0] ?? list.body?.data?.titles?.[0];
    const blocked = await admin.post("/api/parties", { title_id: title.id });
    assert.equal(blocked.status, 403, "הפיצ'ר כבוי — אין פתיחת חדר");

    const on = await admin.patch("/api/features", { key: "watch_party", enabled: true });
    assert.equal(on.body.ok, true);
    const allowed = await admin.post("/api/parties", { title_id: title.id });
    assert.equal(allowed.body.ok, true, "הפיצ'ר חזר לפעול");
    await admin.delete(`/api/parties/${allowed.body.data.party.id}`, {});
  });

  maybe("כיבוי ה-API הציבורי חוסם יצירת מפתח", async () => {
    await admin.patch("/api/features", { key: "developer_api", enabled: false });
    const blocked = await admin.post("/api/keys", { name: "חסום" });
    assert.equal(blocked.status, 403);
    await admin.patch("/api/features", { key: "developer_api", enabled: true });
  });
});
