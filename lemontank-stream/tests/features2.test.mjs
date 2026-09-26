#!/usr/bin/env node
/**
 * בדיקות אינטגרציה לסבב הפיצ'רים השני:
 *   1. פרופילים ומצב ילדים (החלפה + PIN + סינון קטלוג)
 *   2. רשימות מותאמות אישית (CRUD, פריטים, שיתוף)
 *   3. הורדות ומכשירים (מדיניות מסלול + טוקן + ניהול)
 *   4. בקשות תוכן (בקשה, הצבעה, קונסולת אדמין + התראה)
 *   5. "השנה שלי" ותובנות אדמין (הכנסות/מעורבות/בריאות + CSV)
 *
 * דורש שרת רץ (`npm run start`). אם השרת למטה — הבדיקות מדלגות.
 */

import { test, before, after, describe } from "node:test";
import { suiteIp } from "./helpers/suite-ip.mjs";
import assert from "node:assert/strict";
import { restoreSession, saveSecret, saveSession, savedSecret, stepUp, totpCode } from "./helpers/admin-login.mjs";
import { ensureTestTitle, leftoverTestTitles, removeTestTitle } from "./helpers/test-catalog.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@lemontank.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-2026!";

/** כתובת המבקר של החבילה הזו — נפרדת מכסת הרשמה לכל חבילה */
const SUITE_IP = suiteIp("features2-suite");

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
    const headers = { ...(options.headers ?? {}), "x-forwarded-for": SUITE_IP };
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

  get(path) {
    return this.json(path);
  }

  post(path, data) {
    return this.json(path, { method: "POST", body: JSON.stringify(data ?? {}) });
  }

  patch(path, data) {
    return this.json(path, { method: "PATCH", body: JSON.stringify(data ?? {}) });
  }

  del(path, data) {
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

async function serverReady() {
  try {
    const res = await fetch(`${BASE}/api/plans`, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

const FREE_ACCOUNT_FILE = "/tmp/lt-r2-free-account.json";
const FREE_PASSWORD = "Test-Pass-2026!Strong";

/**
 * משתמש חינם לבדיקות.
 * הקצאת משתמש חדש מוגבלת במכוון (5 הרשמות בשעה לכל IP), ולכן:
 *   1. מנסים חשבון שמור מהרצה קודמת (התחברות).
 *   2. אם אין — נרשמים פעם אחת ושומרים לקובץ זמני לשימוש חוזר.
 * כך הבדיקות לא צורכות מכסת הרשמה ולא מדלגות סתם.
 */
let cachedFreeClient = null;

async function freshFreeUser() {
  // לקוח שמור — התחברות אחת לכל הרצה (מכסת "התחברות" היא 8 ל-5 דקות לכל IP)
  if (cachedFreeClient) return cachedFreeClient;

  try {
    const saved = JSON.parse(readFileSync(FREE_ACCOUNT_FILE, "utf8"));
    if (saved?.email) {
      const existing = new Client();
      const login = await existing.login(saved.email, saved.password ?? FREE_PASSWORD);
      if (login.body?.ok === true) {
        cachedFreeClient = existing;
        return existing;
      }
    }
  } catch {
    // אין חשבון שמור — ממשיכים להרשמה
  }

  const c = new Client();
  await c.raw("/register");
  const email = `r2-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}@example.com`;
  const res = await c.post("/api/auth/register", {
    name: "בודק סבב שני",
    email,
    password: FREE_PASSWORD,
    acceptTerms: true,
  });
  if (res.body?.ok !== true) return null;

  if (!c.cookies.get("lt_session")) {
    const login = await c.login(email, FREE_PASSWORD);
    if (login.body?.ok !== true) return null;
  }
  try {
    writeFileSync(FREE_ACCOUNT_FILE, JSON.stringify({ email, password: FREE_PASSWORD }));
  } catch {
    // לא קריטי אם אי אפשר לשמור
  }
  cachedFreeClient = c;
  return c;
}

const R2_MARK = "בדיקת-סבב2";

/** מוחק פרופילי בדיקה שנשארו מהרצות קודמות — כדי שהמכסה (2 בחינם / 5 בפלוס) לא תתמלא */
async function cleanupTestProfiles(client) {
  const res = await client.get("/api/profiles");
  const items = res.body?.data?.items ?? [];
  for (const profile of items) {
    const name = String(profile.name ?? "");
    // הבדיקות יוצרות פרופילים בסימון קבוע; בנוסף מנקים שמות מהרצות קודמות
    // (למשל "פרופיל בדיקה muhk7q02") — זיהוי לפי מילת בדיקה + חותמת באנגלית בסוף.
    const isTestProfile = name.includes(R2_MARK) || /(בדיקה|בדיקת-סבב2|ילדים|סינון)\s+[a-z0-9]{6,8}$/.test(name);
    if (isTestProfile) {
      await client.del("/api/profiles", { id: profile.id });
    }
  }
}

/**
 * סוגר בקשות בדיקה שנשארו מהרצות קודמות.
 * לכל משתמש יש מכסת בקשות פתוחות (20) — בלי ניקוי, בדיקות חוזרות ממלאות אותה.
 */
async function cleanupTestRequests(client) {
  const res = await client.get("/api/admin/requests?status=open");
  const items = res.body?.data?.requests ?? [];
  for (const row of items) {
    if (String(row.name ?? "").includes(R2_MARK) || /בדיקה|להתראה/.test(String(row.name ?? ""))) {
      await client.patch("/api/admin/requests", { id: row.id, status: "declined", admin_note: "נסגר על ידי בדיקה אוטומטית" });
    }
  }
}

/**
 * מוחק מכשירי בדיקה מההרצות הקודמות.
 * למנוי פלוס יש תקרה של 8 מכשירים — בלי ניקוי, בדיקות חוזרות ממלאות אותה
 * (וזה בדיוק מה שהמערכת אמורה לעשות למשתמש אמיתי).
 */
async function cleanupTestDevices(client) {
  const res = await client.get("/api/devices");
  const devices = res.body?.data?.devices ?? [];
  for (const device of devices) {
    const label = String(device.label ?? "");
    if (label.includes(R2_MARK) || /בדיקה|בדיקות|test/i.test(label)) {
      await client.del(`/api/devices/${device.id}`);
    }
  }
}

let ready = false;
let admin = null;
/** כותר בדיקה — נוצר כשהקטלוג ריק, ומוסר בסוף הריצה */
let testTitle = null;

before(async () => {
  ready = await serverReady();
  if (!ready) {
    console.error(`\n⚠️  אין שרת ב-${BASE} — בדיקות סבב 2 ידולגו. הרץ: npm run start\n`);
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
      console.error("\n⚠️  התחברות מנהל נכשלה — בדיקות סבב 2 ידולגו\n");
      admin = null;
      return;
    }
  }

  // אימות מחדש — נדרש לפעולות רגישות (מחיקות ניהוליות וכדומה)
  const stepped = await stepUp(admin, ADMIN_PASSWORD);
  if (!stepped.ok) console.error(`\n⚠️  אימות מחדש נכשל (${stepped.status})\n`);

  // הקטלוג ריק בכוונה — כותר בדיקה זמני לבדיקות תוכן/הורדות
  for (const leftover of await leftoverTestTitles(admin)) await removeTestTitle(admin, leftover.id);
  try {
    testTitle = await ensureTestTitle(admin);
    if (testTitle.created) console.log("ℹ️  נוצר כותר בדיקה זמני (הקטלוג היה ריק)");
  } catch (error) {
    console.error(`⚠️  לא ניתן ליצור כותר בדיקה: ${error?.message ?? error}`);
  }

  await cleanupTestProfiles(admin);
  await cleanupTestRequests(admin);
  await cleanupTestDevices(admin);
});

// ══════════════════════════════════════════════════════════════════════════
//  1. רשימות מותאמות אישית
// ══════════════════════════════════════════════════════════════════════════

describe("רשימות מותאמות אישית", () => {
  test("דורשות התחברות", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    const res = await anon.get("/api/lists");
    assert.ok(res.status === 401 || res.status === 403, `צפוי 401/403, התקבל ${res.status}`);
  });

  test("יצירה, הוספת כותר, ומניעת כפילות", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const created = await admin.post("/api/lists", { name: `רשימת בדיקה ${Date.now().toString(36)}`, description: "נבדק אוטומטית" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const listId = created.body.data.list.id;
    assert.ok(listId > 0);

    // כותר אמיתי מהקטלוג
    const catalog = await admin.get("/api/titles?limit=1");
    const titleId = catalog.body?.data?.items?.[0]?.id;
    if (!titleId) return t.skip("אין כותר בקטלוג");

    const first = await admin.post(`/api/lists/${listId}/items`, { action: "add", title_id: titleId, note: "לסופש" });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.added, true);

    const second = await admin.post(`/api/lists/${listId}/items`, { action: "add", title_id: titleId });
    assert.equal(second.body.data.added, false, "הוספה כפולה לא אמורה להוסיף פריט נוסף");

    const detail = await admin.get(`/api/lists/${listId}`);
    assert.equal(detail.body.data.items.length, 1);
    assert.equal(detail.body.data.items[0].note, "לסופש");

    // הסרה
    const removed = await admin.post(`/api/lists/${listId}/items`, { action: "remove", title_id: titleId });
    assert.equal(removed.body.data.removed, true);
    await admin.del(`/api/lists/${listId}`);
  });

  test("שם קצר מדי נדחה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");
    const res = await admin.post("/api/lists", { name: "א" });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.equal(res.body.error.code, "VALIDATION");
  });

  test("שיתוף: רשימה פרטית לא נגישה, ציבורית נגישה לאנונימי", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const created = await admin.post("/api/lists", { name: `משותפת ${Date.now().toString(36)}`, is_public: false });
    const listId = created.body.data.list.id;
    const code = created.body.data.list.share_code;
    assert.match(code, /^[a-f0-9]{12}$/, "קוד שיתוף לא בפורמט הצפוי");

    const anon = new Client();
    const privateRes = await anon.get(`/api/lists/shared/${code}`);
    assert.equal(privateRes.status, 404, "רשימה פרטית לא אמורה להיות נגישה בקישור");

    await admin.patch(`/api/lists/${listId}`, { is_public: true });
    const publicRes = await anon.get(`/api/lists/shared/${code}`);
    assert.equal(publicRes.status, 200, JSON.stringify(publicRes.body));
    assert.ok(typeof publicRes.body.data.list.name === "string");
    assert.equal(publicRes.body.data.items.length, 0);

    // עמוד ציבורי + קוד לא חוקי
    assert.equal((await anon.get(`/l/${code}`)).status, 200);
    assert.equal((await anon.get("/api/lists/shared/zzzzzzzzzzzz")).status, 404);

    await admin.del(`/api/lists/${listId}`);
  });

  test("רשימה של משתמש אחר אינה נגישה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");
    const other = await freshFreeUser();
    if (!other) return t.skip("הרשמה לא זמינה");

    const created = await admin.post("/api/lists", { name: `פרטית שלי ${Date.now().toString(36)}` });
    const listId = created.body.data.list.id;

    const peek = await other.get(`/api/lists/${listId}`);
    assert.equal(peek.status, 404, "משתמש אחר לא אמור לראות את הרשימה");
    const abuse = await other.del(`/api/lists/${listId}`);
    assert.equal(abuse.status, 404, "משתמש אחר לא אמור למחוק את הרשימה");

    await admin.del(`/api/lists/${listId}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  2. פרופילים, מצב ילדים ו-PIN
// ══════════════════════════════════════════════════════════════════════════

describe("פרופילים ומצב ילדים", () => {
  test("החלפת פרופיל משנה את הפרופיל הפעיל", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const before = await admin.get("/api/profiles/active");
    assert.equal(before.status, 200);

    const created = await admin.post("/api/profiles", { name: `פרופיל ${R2_MARK} ${Date.now().toString(36)}` });
    const profileId = created.body?.data?.id ?? created.body?.data?.profile?.id;
    if (!profileId) return t.skip("יצירת פרופיל לא החזירה מזהה");

    const switched = await admin.post("/api/profiles/switch", { profile_id: profileId });
    assert.equal(switched.status, 200, JSON.stringify(switched.body));

    const after = await admin.get("/api/profiles/active");
    assert.equal(after.body.data.profile.id, profileId, "הפרופיל הפעיל לא התעדכן");

    // חזרה לפרופיל הקודם + מחיקת פרופיל הבדיקה
    const restore = await admin.post("/api/profiles/switch", { profile_id: before.body.data.profile.id });
    assert.equal(restore.status, 200, JSON.stringify(restore.body));
    assert.equal((await admin.del("/api/profiles", { id: profileId })).status, 200);
  });

  test("פרופיל ילדים: יציאה דורשת קוד, וקוד שגוי נדחה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const start = await admin.get("/api/profiles/active");
    const adultId = start.body.data.profile.id;
    const stamp = Date.now().toString(36);

    const kid = await admin.post("/api/profiles", {
      name: `ילדים ${R2_MARK} ${stamp}`,
      is_kid: true,
      maturity_limit: "7+",
      pin: "4321",
    });
    const kidId = kid.body?.data?.id ?? kid.body?.data?.profile?.id;
    if (!kidId) return t.skip("יצירת פרופיל ילדים לא החזירה מזהה");

    // פרופיל ילדים עם קוד הוא פרופיל נעול — כניסה אליו דורשת את הקוד
    const enterWithoutPin = await admin.post("/api/profiles/switch", { profile_id: kidId });
    assert.equal(enterWithoutPin.status, 401, JSON.stringify(enterWithoutPin.body));
    assert.equal(enterWithoutPin.body.error.code, "PIN_REQUIRED");
    assert.equal(enterWithoutPin.body.error.details.reason, "target_locked");

    const enter = await admin.post("/api/profiles/switch", { profile_id: kidId, pin: "4321" });
    assert.equal(enter.status, 200, JSON.stringify(enter.body));

    // יציאה מפרופיל ילדים בלי קוד — חייבת להיכשל
    const blocked = await admin.post("/api/profiles/switch", { profile_id: adultId });
    assert.equal(blocked.status, 401, JSON.stringify(blocked.body));
    assert.equal(blocked.body.error.code, "PIN_REQUIRED");

    const wrong = await admin.post("/api/profiles/switch", { profile_id: adultId, pin: "0000" });
    assert.equal(wrong.status, 401, JSON.stringify(wrong.body));
    assert.equal(wrong.body.error.code, "PIN_INVALID");

    const allowed = await admin.post("/api/profiles/switch", { profile_id: adultId, pin: "4321" });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));

    const finalState = await admin.get("/api/profiles/active");
    assert.equal(finalState.body.data.profile.id, adultId);
    assert.equal((await admin.del("/api/profiles", { id: kidId })).status, 200);
  });

  test("מצב ילדים מסנן את הקטלוג לפי גיל", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const start = await admin.get("/api/profiles/active");
    const adultId = start.body.data.profile.id;
    const adultTitles = await admin.get("/api/titles?limit=1");

    const kid = await admin.post("/api/profiles", { name: `סינון ${R2_MARK} ${Date.now().toString(36)}`, is_kid: true, maturity_limit: "7+", pin: "1234" });
    const kidId = kid.body?.data?.id ?? kid.body?.data?.profile?.id;
    if (!kidId) return t.skip("יצירת פרופיל ילדים לא החזירה מזהה");
    await admin.post("/api/profiles/switch", { profile_id: kidId });

    const kidTitles = await admin.get("/api/titles?limit=1");
    assert.equal(kidTitles.status, 200);
    assert.ok(
      Number(kidTitles.body.data.total) <= Number(adultTitles.body.data.total),
      `סינון ילדים אמור להחזיר פחות או שווה כותרים (${kidTitles.body.data.total} מול ${adultTitles.body.data.total})`,
    );
    for (const item of kidTitles.body.data.items) {
      assert.ok(Number(item.age_rating_age ?? 0) <= 7, `כותר לא מתאים לגיל חזר במצב ילדים: ${item.name_he}`);
    }

    await admin.post("/api/profiles/switch", { profile_id: adultId, pin: "1234" });
    const restored = await admin.get("/api/profiles/active");
    assert.equal(restored.body.data.profile.id, adultId);
    assert.equal((await admin.del("/api/profiles", { id: kidId })).status, 200);
  });

  test("ניסויי PIN מוגבלים בקצב (הגנת brute-force)", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const free = await freshFreeUser();
    if (!free) return t.skip("הרשמה לא זמינה");

    // פרופיל ילדים נעול — כל ניסיון מעבר אליו/ממנו דורש קוד
    const kid = await free.post("/api/profiles", { name: `ילדים ${R2_MARK}`, is_kid: true, maturity_limit: "7+", pin: "2468" });
    if (kid.status === 402) return t.skip("המכסה כבר מוצתה בחשבון הבדיקה");
    const kidId = kid.body?.data?.id;
    assert.ok(kidId, JSON.stringify(kid.body));

    const list = await free.get("/api/profiles");
    const adultId = list.body.data.items.find((profile) => profile.id !== kidId)?.id ?? 1;

    await free.post("/api/profiles/switch", { profile_id: kidId, pin: "2468" });

    // 5 כישלונות מותרים, ומהשישי ואילך המערכת חייבת להתחיל להגביל
    let limited = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const res = await free.post("/api/profiles/switch", { profile_id: adultId, pin: "0000" });
      if (res.status === 429) {
        assert.equal(res.body.error.code, "PIN_RATE_LIMITED");
        assert.ok(attempt >= 5, `ההגבלה הופעלה מוקדם מדי (ניסיון ${attempt + 1})`);
        limited = true;
        break;
      }
      assert.equal(res.status, 401, JSON.stringify(res.body));
    }
    assert.ok(limited, "אחרי 5 ניסיונות PIN שגויים המערכת חייבת להתחיל להגביל קצב");

    // הקוד הנכון עדיין חסום בזמן החסימה — זה בדיוק הרצוי
    const during = await free.post("/api/profiles/switch", { profile_id: adultId, pin: "2468" });
    assert.equal(during.status, 429);

    await free.del("/api/profiles", { id: kidId });
  });

  test("מסלול חינם מוגבל לשני פרופילים", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const free = await freshFreeUser();
    if (!free) return t.skip("הרשמה לא זמינה");

    const first = await free.post("/api/profiles", { name: `נוסף ${R2_MARK}` });
    if (first.status === 402) return t.skip("המכסה כבר מוצתה בחשבון הבדיקה");

    const second = await free.post("/api/profiles", { name: `נוסף2 ${R2_MARK}` });
    assert.equal(second.status, 402, "בחינם אמורים להיות שני פרופילים בלבד");
    assert.equal(second.body.error.code, "PLAN_REQUIRED");

    if (first.body?.data?.id) await free.del("/api/profiles", { id: first.body.data.id });
  });

  test("החלפה לפרופיל שלא קיים נדחית", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");
    const res = await admin.post("/api/profiles/switch", { profile_id: 999999 });
    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(res.body.error.code, "NOT_FOUND");

    // חסר מזהה בכלל
    const missing = await admin.post("/api/profiles/switch", {});
    assert.ok([400, 422].includes(missing.status), `צפוי 400/422, התקבל ${missing.status}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  3. הורדות ומכשירים
// ══════════════════════════════════════════════════════════════════════════

describe("הורדות ומכשירים", () => {
  test("מסלול חינם לא יכול להוריד", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const free = await freshFreeUser();
    if (!free) return t.skip("הרשמה לא זמינה");

    const catalog = await free.get("/api/titles?limit=1");
    const titleId = catalog.body?.data?.items?.[0]?.id;
    if (!titleId) return t.skip("אין כותר בקטלוג");

    const res = await free.post("/api/downloads", { title_id: titleId, device_fingerprint: "test-free-device" });
    assert.equal(res.status, 402, JSON.stringify(res.body));
    assert.equal(res.body.error.code, "PLAN_REQUIRED");
  });

  test("מדיניות ההורדה נבדקת לפני דרישת המכשיר", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const catalog = await admin.get("/api/titles?limit=1");
    const titleId = catalog.body?.data?.items?.[0]?.id;
    if (!titleId) return t.skip("אין כותר בקטלוג");

    const policy = await admin.get(`/api/downloads?title_id=${titleId}`);
    const res = await admin.post("/api/downloads", { title_id: titleId });
    if (policy.body.data.allowed) {
      // הכותר מותר — חסר מזהה מכשיר
      assert.equal(res.status, 400, JSON.stringify(res.body));
    } else {
      // הכותר חסום — חשוב יותר לומר למשתמש למה, לפני שמבקשים ממנו מכשיר
      assert.equal(res.status, 402, JSON.stringify(res.body));
      assert.equal(res.body.error.code, "PLAN_REQUIRED");
    }

    const missing = await admin.post("/api/downloads", { title_id: 999999, device_fingerprint: "test-missing" });
    assert.equal(missing.status, 404, JSON.stringify(missing.body));
  });

  test("הורדה אמיתית: טוקן עם תוקף, ומחיקה מהמרכז", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const catalog = await admin.get("/api/titles?limit=1");
    const titleId = catalog.body?.data?.items?.[0]?.id;
    if (!titleId) return t.skip("אין כותר בקטלוג");

    // מדליקים הורדה לכותר אחד כמו שאדמין עושה בפאנל
    const enable = await admin.patch(`/api/titles/${titleId}`, { is_downloadable: true });
    assert.equal(enable.status, 200, JSON.stringify(enable.body));

    const fingerprint = "test-download-device-fp";
    const created = await admin.post("/api/downloads", {
      title_id: titleId,
      device_fingerprint: fingerprint,
      device_label: `בדיקה ${R2_MARK}`,
      quality: "1080p",
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const download = created.body.data.download;
    assert.match(created.body.data.token, /^[a-f0-9]{48}$/, "טוקן ההורדה לא בפורמט הצפוי");
    assert.ok(download.expires_at && Date.parse(download.expires_at) > Date.now(), "להורדה חייב להיות תוקף עתידי");

    const mine = await admin.get("/api/downloads");
    const row = mine.body.data.downloads.find((item) => item.id === download.id);
    assert.ok(row, "ההורדה לא הופיעה במרכז ההורדות");
    assert.equal(row.expired, 0, "הורדה חדשה לא אמורה להיות פגת תוקף");
    assert.equal(row.title_id, titleId);

    assert.equal((await admin.del("/api/downloads", { id: download.id })).status, 200);
    const after = await admin.get("/api/downloads");
    assert.ok(!after.body.data.downloads.some((item) => item.id === download.id), "ההורדה לא נמחקה");

    // מחזירים את הכותר למצבו (הבדיקות לא משנות את הקטלוג של המשתמש)
    const disable = await admin.patch(`/api/titles/${titleId}`, { is_downloadable: false });
    assert.equal(disable.status, 200);
    await cleanupTestDevices(admin);
  });

  test("רישום מכשיר הוא אידמפוטנטי, ומכשיר שהוסר נעלם", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const fingerprint = `test-device-${Date.now().toString(36)}`;
    const first = await admin.post("/api/devices", { fingerprint, label: `מחשב ${R2_MARK}`, platform: "test" });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const deviceId = first.body.data.device_id;

    const second = await admin.post("/api/devices", { fingerprint, label: `מחשב ${R2_MARK}`, platform: "test" });
    assert.equal(second.body.data.device_id, deviceId, "רישום כפול אמור להחזיר את אותו מכשיר");

    const listed = await admin.get("/api/devices");
    assert.ok(listed.body.data.devices.some((device) => device.id === deviceId));

    const untrust = await admin.patch(`/api/devices/${deviceId}`, { trusted: true });
    assert.equal(untrust.status, 200);
    const afterTrust = await admin.get("/api/devices");
    assert.equal(afterTrust.body.data.devices.find((device) => device.id === deviceId).trusted, 1);

    const removed = await admin.del(`/api/devices/${deviceId}`);
    assert.equal(removed.status, 200);
    const afterRemove = await admin.get("/api/devices");
    assert.ok(!afterRemove.body.data.devices.some((device) => device.id === deviceId), "המכשיר לא הוסר");
  });

  test("מדיניות הורדה מדווחת בבירור לכותר חסום", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");
    // כותר בדיקה במקום id קשיח — הקטלוג יכול להיות ריק
    const titleId = testTitle?.id ?? 1;
    const res = await admin.get(`/api/downloads?title_id=${titleId}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(typeof res.body.data.allowed, "boolean");
    assert.ok("reason" in res.body.data);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  4. בקשות תוכן
// ══════════════════════════════════════════════════════════════════════════

describe("בקשות תוכן", () => {
  test("בקשה חדשה, כפילות, והצבעה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const name = `סרט ${R2_MARK} ${Date.now().toString(36)}`;
    const created = await admin.post("/api/requests", { name, kind: "movie", year: 2025, note: "בדיקה" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const requestId = created.body.data.request.id;

    const dupe = await admin.post("/api/requests", { name: `  ${name.toUpperCase()}  `, kind: "movie" });
    assert.equal(dupe.status, 201);
    assert.equal(dupe.body.data.request.id, requestId, "בקשה כפולה מאותו משתמש לא אמורה לפתוח שורה חדשה");

    const vote = await admin.post(`/api/requests/${requestId}`);
    assert.equal(vote.status, 200, JSON.stringify(vote.body));
    assert.equal(vote.body.data.voted, true);
    assert.equal(vote.body.data.votes, 1);

    const unvote = await admin.post(`/api/requests/${requestId}`);
    assert.equal(unvote.body.data.voted, false);
    assert.equal(unvote.body.data.votes, 0);

    const list = await admin.get("/api/requests?status=open");
    assert.ok(list.body.data.requests.some((row) => row.id === requestId));

    // סגירה — כדי לא למלא את מכסת הבקשות הפתוחות בהרצות חוזרות
    const closed = await admin.patch("/api/admin/requests", { id: requestId, status: "declined" });
    assert.equal(closed.status, 200);
  });

  test("בקשה לכותר שכבר קיים נדחית ב-409", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");
    const catalog = await admin.get("/api/titles?limit=1");
    const existing = catalog.body?.data?.items?.[0]?.name_he;
    if (!existing) return t.skip("אין כותר בקטלוג");
    const res = await admin.post("/api/requests", { name: existing });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.error.code, "ALREADY_EXISTS");
  });

  test("אנונימי יכול לראות בקשות אך לא לבקש", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    assert.equal((await anon.get("/api/requests")).status, 200);
    const res = await anon.post("/api/requests", { name: "בקשה אנונימית" });
    assert.ok(res.status === 401 || res.status === 403, `צפוי 401/403, התקבל ${res.status}`);
  });

  test("קונסולת אדמין: סימון 'נוסף' יוצר התראה למצביע", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const voter = await freshFreeUser();
    if (!voter) return t.skip("הרשמה לא זמינה");

    const name = `כותר להתראה ${R2_MARK} ${Date.now().toString(36)}`;
    const created = await voter.post("/api/requests", { name });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const requestId = created.body.data.request.id;

    const vote = await voter.post(`/api/requests/${requestId}`);
    assert.equal(vote.body.data.voted, true);

    const resolved = await admin.patch("/api/admin/requests", { id: requestId, status: "added", admin_note: "נוסף לספרייה" });
    assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
    assert.equal(resolved.body.data.request.status, "added");

    const notifications = await voter.get("/api/notifications");
    const list = notifications.body?.data?.notifications ?? notifications.body?.data?.items ?? [];
    assert.ok(
      list.some((row) => String(row.body ?? "").includes(name) || String(row.title ?? "").includes("בקשה")),
      `לא נמצאה התראה על הבקשה שאושרה (${notifications.status})`,
    );

    // בקשה שטופלה לא ניתנת להצבעה נוספת
    const late = await voter.post(`/api/requests/${requestId}`);
    assert.equal(late.status, 400);
  });

  test("ניהול בקשות דורש הרשאת צוות", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    assert.ok([401, 403].includes((await anon.get("/api/admin/requests")).status));
    const free = await freshFreeUser();
    if (!free) return t.skip("הרשמה לא זמינה");
    assert.ok([401, 403].includes((await free.get("/api/admin/requests")).status), "משתמש רגיל לא אמור לראות את הקונסולה");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  5. "השנה שלי" ותובנות
// ══════════════════════════════════════════════════════════════════════════

describe("השנה שלי ותובנות", () => {
  test("השנה שלי מחזירה סיכום מחושב", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const res = await admin.get("/api/wrapped");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const wrap = res.body.data.wrap;
    assert.equal(typeof wrap.totalMinutes, "number");
    assert.equal(typeof wrap.titlesWatched, "number");
    assert.equal(typeof wrap.personality, "string");
    assert.ok(Array.isArray(wrap.topTitles));
    assert.ok(Array.isArray(res.body.data.years) && res.body.data.years.length >= 1);
  });

  test("השנה שלי דורשת התחברות", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    assert.ok([401, 403].includes((await anon.get("/api/wrapped")).status));
  });

  test("תובנות אדמין: הכנסות, מעורבות ובריאות", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const res = await admin.get("/api/admin/insights");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { revenue, engagement, health } = res.body.data;

    assert.equal(typeof revenue.mrr, "number");
    assert.equal(typeof revenue.arpu, "number");
    assert.ok(Array.isArray(revenue.byPlan) && revenue.byPlan.length >= 2, "צפויים לפחות שני מסלולים");
    assert.ok(Array.isArray(revenue.monthly));
    assert.equal(typeof engagement.dau, "number");
    assert.equal(engagement.trend.length, 14, "מגמה אמורה למלא 14 ימים גם בלי נתונים");
    assert.equal(typeof health.completeness, "number");
    assert.ok(Array.isArray(health.issues));
  });

  test("ייצוא CSV תקין עם BOM וסוג תוכן", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const res = await admin.raw("/api/admin/insights?format=csv&report=plans");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(res.headers.get("content-disposition") ?? "", /attachment/);

    // Response.text() מסיר BOM לפי התקן — בודקים בייטים גולמיים
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "CSV חייב להתחיל ב-BOM כדי שאקסל יציג עברית");

    const header = new TextDecoder().decode(bytes.slice(0, 120)).replace("\uFEFF", "");
    assert.match(header.split("\n")[0], /plan_code/);

    const bad = await admin.get("/api/admin/insights?format=csv&report=nope");
    assert.equal(bad.status, 400);
  });

  test("תובנות דורשות הרשאת אנליטיקה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    assert.ok([401, 403].includes((await anon.get("/api/admin/insights")).status));
  });
});

after(async () => {
  if (!ready || !admin || !testTitle?.created) return;
  const removed = await removeTestTitle(admin, testTitle.id);
  if (!removed) console.error(`ℹ️  כותר הבדיקה #${testTitle.id} לא הוסר — אפשר למחוק ידנית מ-/admin/titles`);
});
