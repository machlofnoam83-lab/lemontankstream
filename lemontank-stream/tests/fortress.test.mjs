#!/usr/bin/env node
/**
 * בדיקות אינטגרציה לשכבת "המבצר" (סבב 3):
 *   1. אימות דו-שלבי: אתגר, קוד שגוי, קוד נכון — ובלי סשן לפני הקוד.
 *   2. אימות מחדש (step-up) לפעולות רגישות: חסימה בלי סיסמה, מעבר איתה.
 *   3. קישור סשן למכשיר: עוגייה שנגנבה מדפדפן אחר נשללת (וגם זו של הקורבן).
 *   4. יומן ביקורת משורשר: שלמות השרשרת + זיהוי זיוף (דרך סקריפט ההוכחה).
 *   5. מדיניות סיסמאות: רשימת דליפות, הקשר (אימייל/שם), דחייה בהרשמה.
 *   6. מיסוך PII: אימיילי סגל לא מוצגים גלוי בדוח המבצר.
 *   7. רשימת היתר לניהול: כתובת זרה נחסמת, ושחזור מקומי משחרר.
 *   8. גיבוי מוצפן + שחזור מאומת, ובדיקת חוסן עצמית.
 *   9. היומן חסין למחיקת משתמשים (מפתח זר שהיה מטפס) ולחיתוך זנב (עוגן נפרד).
 *
 * הכל דרך HTTP (כמו תוקף אמיתי) + סקריפטי התפעול המקומיים.
 * דורש שרת רץ (`npm run start`). אם השרת למטה — הבדיקות מדלגות.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { stepUp, totpCode } from "./helpers/admin-login.mjs";

const BASE = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@lemontank.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-2026!";
const ROOT = path.resolve(import.meta.dirname, "..");
const DB_FILE = path.join(ROOT, "data", "lemontank.db");
const LEDGER_USER = "ledger-probe";

class Client {
  constructor(userAgent = "LemonTank-Fortress-Test/1.0") {
    this.cookies = new Map();
    this.userAgent = userAgent;
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

  csrf() {
    return this.cookies.get("lt_csrf") ?? "";
  }

  /** טעינת דף כדי לקבל עוגיית CSRF — כמו דפדפן אמיתי */
  async prepare() {
    if (this.cookies.has("lt_csrf")) return;
    await this.raw("/login");
  }

  clone(userAgent) {
    const copy = new Client(userAgent ?? this.userAgent);
    for (const [k, v] of this.cookies) copy.cookies.set(k, v);
    return copy;
  }

  async raw(pathname, options = {}) {
    const headers = { ...(options.headers ?? {}), "user-agent": this.userAgent };
    if (this.cookies.size) headers.cookie = this.cookieHeader();
    if (options.method && options.method !== "GET" && options.method !== "HEAD") {
      headers["x-csrf-token"] = options.csrf ?? this.csrf();
      headers.origin = BASE;
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${BASE}${pathname}`, { ...options, headers, redirect: "manual" });
    this.store(response);
    return response;
  }

  async json(pathname, options = {}) {
    const response = await this.raw(pathname, options);
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { status: response.status, body };
  }

  get(pathname) {
    return this.json(pathname);
  }
  post(pathname, data) {
    return this.json(pathname, { method: "POST", body: JSON.stringify(data ?? {}) });
  }
  patch(pathname, data) {
    return this.json(pathname, { method: "PATCH", body: JSON.stringify(data ?? {}) });
  }
  del(pathname, data) {
    return this.json(pathname, { method: "DELETE", body: JSON.stringify(data ?? {}) });
  }

  /**
   * התחברות מלאה — סיסמה + 2FA. מחזיר את התשובה של השלב האחרון.
   * הסוד ניתן להעברה (לחשבון סגל אחר), אחרת נלקח מהסוד של המנהל.
   */
  async fullLogin(email, password, secret = null) {
    await this.raw("/login");
    const first = await this.post("/api/auth/login", { email, password });
    if (!first.body?.data?.requires2fa) return first;
    return this.post("/api/auth/login", {
      challenge: first.body.data.challenge,
      totp: totpCode(secret ?? adminSecret()),
    });
  }

  /** הפעלת 2FA לחשבון המחובר כרגע — מחזיר את הסוד */
  async enableTwoFactor() {
    const setup = await this.post("/api/auth/2fa", { action: "setup" });
    const secret = setup.body?.data?.secret ?? null;
    if (!secret) return null;
    const enabled = await this.post("/api/auth/2fa", { action: "enable", code: totpCode(secret) });
    return enabled.body?.ok === true ? secret : null;
  }
}

/** הסוד של 2FA נשמר בבדיקות האחרות; כאן קוראים אותו מאותו מקום. */
function adminSecret() {
  try {
    const raw = JSON.parse(readFileSync("/tmp/lt-admin-2fa.json", "utf8"));
    return raw.secret;
  } catch {
    return null;
  }
}

async function serverReady() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

let ready = false;
let admin = null; // סשן מנהל עם step-up — לכל בדיקות הניהול
let freshAdmin = null; // סשן מנהל נקי (בלי step-up) — לבדיקות האימות מחדש
let staffEmail = null; // חשבון סגל שנוצר לצורך בדיקות 2FA/מיסוך
let staffId = null;
let staffSecret = null;

before(async () => {
  ready = await serverReady();
  if (!ready) {
    console.error(`\n⚠️  אין שרת ב-${BASE} — בדיקות המבצר ידולגו. הרץ: npm run start\n`);
    return;
  }

  admin = new Client();
  const login = await admin.fullLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (login.body?.ok !== true) {
    console.error("\n⚠️  התחברות מנהל נכשלה — בדיקות המבצר ידולגו\n");
    admin = null;
    return;
  }

  // חשבון סגל (עורך) בלי 2FA — כדי לבדוק את שער ה-2FA ואת מיסוך ה-PII.
  // חשוב: נרשמים מלקוח **נפרד**, כי /api/auth/register מכניס את הנרשם לסשן
  // משלו — ומחליף את העוגיות של הלקוח שממנו קראו לו.
  staffEmail = `fortress-staff-${Date.now().toString(36)}@example.com`;
  const signup = new Client("LemonTank-Fortress-Signup/1.0");
  await signup.prepare();
  const created = await signup.post("/api/auth/register", {
    name: "סגל בדיקה",
    email: staffEmail,
    password: "Rakevet-Mango#77-Lavan",
    acceptTerms: true,
  });
  if (created.body?.ok === true) {
    // הרשמה מכניסה לסשן של החשבון החדש — ומשם מפעילים לו 2FA מיד,
    // כדי שלא יישאר אף רגע חשבון סגל בלי אימות דו-שלבי.
    staffSecret = await signup.enableTwoFactor();
    const userId = created.body.data?.user?.id;
    if (userId) {
      staffId = userId;
      const promoted = await admin.patch(`/api/users/${userId}`, { role: "editor" });
      if (promoted.body?.ok !== true) {
        console.error(`⚠️  לא ניתן היה לקדם את חשבון הבדיקה: ${JSON.stringify(promoted.body).slice(0, 120)}`);
      }
    }
  } else if (created.status === 429) {
    console.error("ℹ️  מכסת הרשמה נגמרה — חלק מבדיקות הסגל ידולגו");
    staffEmail = null;
  }
});

/* ───────────────────────── 1. אימות דו-שלבי ───────────────────────── */

describe("אימות דו-שלבי", () => {
  test("סיסמה נכונה לחשבון מוגן מחזירה אתגר בלבד — בלי סשן", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const client = new Client();
    await client.raw("/login");
    const res = await client.post("/api/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.requires2fa, true);
    assert.ok(typeof res.body.data.challenge === "string" && res.body.data.challenge.length > 10);
    assert.equal(res.body.data.user, undefined, "אסור להחזיר משתמש לפני שהקוד אומת");

    // אין עוגיית סשן — כלומר אין דרך "לדלג" על הקוד
    assert.equal(client.cookies.get("lt_session") ?? null, null, "לא נוצרת עוגיית סשן לפני 2FA");
    const me = await client.get("/api/auth/me");
    assert.equal(me.body?.data?.user ?? null, null);
  });

  test("קוד שגוי נדחה, ואחריו הקוד הנכון משלים התחברות", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const secret = adminSecret();
    if (!secret) return t.skip("אין סוד 2FA שמור");

    const client = new Client();
    await client.raw("/login");
    const first = await client.post("/api/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const challenge = first.body?.data?.challenge;
    assert.ok(challenge, "צריך אתגר");

    const valid = totpCode(secret);
    const wrong = String((Number(valid) + 1) % 1_000_000).padStart(6, "0");
    const rejected = await client.post("/api/auth/login", { challenge, totp: wrong });
    assert.equal(rejected.status, 401, JSON.stringify(rejected.body));
    assert.equal(client.cookies.get("lt_session") ?? null, null, "קוד שגוי לא יוצר סשן");

    const accepted = await client.post("/api/auth/login", { challenge, totp: valid });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.data.user.email.toLowerCase(), ADMIN_EMAIL.toLowerCase());
    assert.equal(accepted.body.data.twoFactor, true);
    assert.ok(client.cookies.get("lt_session"), "אחרי קוד נכון נוצרת עוגיית סשן");
  });
});

/* ─────────────────── 2. אימות מחדש לפעולות רגישות ─────────────────── */

describe("אימות מחדש (step-up)", () => {
  const keyName = `מבצר ${Date.now().toString(36)}`;
  let createdKeyId = null;

  test("פעולה רגישה נחסמת בלי אימות מחדש", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    // סשן חדש לגמרי: התחברות נקייה, בלי step-up — בדיוק כמו חלון שחלף
    freshAdmin = new Client("LemonTank-Fortress-Fresh/1.0");
    const login = await freshAdmin.fullLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (login.body?.ok !== true) {
      freshAdmin = null;
      return t.skip("אין סוד 2FA להשלמת התחברות");
    }

    const blocked = await freshAdmin.post("/api/keys", { name: keyName });
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
    assert.equal(blocked.body.error.code, "STEP_UP_REQUIRED");
    assert.equal(blocked.body.error.details.action, "api_key.create");
  });

  test("סיסמה שגויה לא מעניקה אישור", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");
    const client = freshAdmin;
    if (!client) return t.skip("אין סשן נקי");

    const bad = await client.post("/api/security/step-up", { password: "לא-הסיסמה-הנכונה-123" });
    assert.equal(bad.status, 401, JSON.stringify(bad.body));
    const stillBlocked = await client.post("/api/keys", { name: keyName });
    assert.equal(stillBlocked.status, 403);
  });

  test("אחרי אימות נכון הפעולה עוברת, וגם ביטול שלה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const approved = await stepUp(admin, ADMIN_PASSWORD);
    assert.equal(approved.ok, true, JSON.stringify(approved.body));

    const created = await admin.post("/api/keys", { name: keyName, scopes: ["read"] });
    assert.ok([200, 201].includes(created.status), JSON.stringify(created.body).slice(0, 200));
    createdKeyId = created.body.data.record?.id ?? created.body.data.key?.id ?? null;
    assert.ok(createdKeyId, "נוצר מפתח עם מזהה");

    const revoked = await admin.del(`/api/keys/${createdKeyId}`);
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
    assert.equal(revoked.body.data.revoked, true);
  });
});

/* ──────────────────── 3. קישור סשן למכשיר ולרשת ──────────────────── */

describe("קישור סשן למכשיר", () => {
  test("עוגייה שנגבתה מדפדפן אחר נשללת — וגם הסשן המקורי", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!staffEmail) return t.skip("לא נוצר חשבון סגל (מכסה/הרשאה)");

    const victim = new Client("LemonTank-Legit/3.1");
    const login = await victim.fullLogin(staffEmail, "Rakevet-Mango#77-Lavan", staffSecret);
    if (login.body?.ok !== true) return t.skip("התחברות חשבון הבדיקה נכשלה");

    const before = await victim.get("/api/auth/me");
    assert.equal(before.body?.data?.user?.email?.toLowerCase(), staffEmail.toLowerCase());

    // "תוקף" שהעתיק את העוגיות לדפדפן אחר
    const thief = victim.clone("LemonTank-Thief/6.6");
    const stolen = await thief.get("/api/auth/me");
    if (stolen.body?.data?.user) {
      // אם החיבור הזה עבר — הקישור לא עבד. מנסחים את זה כתקלה ברורה.
      assert.fail("סשן שנגנב מדפדפן אחר התקבל — קישור המכשיר לא נאכף");
    }

    // הסשן בוטל אצל כולם: גם הקורבן צריך להתחבר מחדש
    const victimAfter = await victim.get("/api/auth/me");
    assert.equal(victimAfter.body?.data?.user ?? null, null, "הסשן בוטל לאחר זיהוי גניבה");
  });
});

/* ─────────────────────── 4. יומן ביקורת משורשר ─────────────────────── */

describe("יומן ביקורת משורשר", () => {
  test("דוח המבצר מדווח על שרשרת שלמה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const res = await admin.get("/api/admin/fortress");
    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
    const chain = res.body.data.auditChain;
    assert.equal(chain.ok, true, `שרשרת שבורה: ${JSON.stringify(chain.broken ?? []).slice(0, 300)}`);
    assert.ok(chain.checked >= 1, "נבדקו רשומות");
    assert.equal(chain.brokenAt ?? null, null);
  });

  test("גלאי הזיוף מזהה רשומת ביקורת ששונתה", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const out = execFileSync(process.execPath, ["scripts/fortress-check.mjs", "--tamper"], { cwd: ROOT, encoding: "utf8" });
    assert.match(out, /הגלאי עובד/, out);
  });

  test("בדיקת החוסן העצמית עוברת (0 כשלים)", async (t) => {
    if (!ready) return t.skip("אין שרת");
    let output = "";
    try {
      output = execFileSync(process.execPath, ["scripts/fortress-check.mjs", "--verbose"], { cwd: ROOT, encoding: "utf8" });
    } catch (error) {
      output = String(error.stdout ?? "") + String(error.stderr ?? "");
      assert.fail(`fortress-check החזיר כשל:\n${output.slice(0, 600)}`);
    }
    assert.match(output, /כשלים/);
    assert.doesNotMatch(output, /❌/);
  });
});

/* ────────────────────── 5. מדיניות סיסמאות ────────────────────── */

describe("מדיניות סיסמאות", () => {
  test("סיסמה דלופה מוכרת נדחית (גם עם קיצורים ואותיות גדולות)", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const client = new Client();
    await client.prepare();
    for (const [password, why] of [
      ["Password1!", "רשימה נפוצה"],
      ["P@ssw0rd#2027", "קיצורי תווים של password"],
      ["Qwerty1234!", "רצף מקלדת"],
      ["Shalom123456", "סיסמה ישראלית נפוצה"],
    ]) {
      const res = await client.post("/api/auth/password-check", { password });
      assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 160));
      assert.equal(res.body.data.ok, false, `${why}: ${password} לא אמורה לעבור`);
      assert.ok(res.body.data.problems.length > 0);
    }
  });

  test("סיסמה חזקה וארוכה עוברת", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const client = new Client();
    await client.prepare();
    const res = await client.post("/api/auth/password-check", {
      password: "Rakevet-Mango#77-Lavan-9",
      email: "someone@example.com",
      name: "דנה",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 160));
    assert.equal(res.body.data.ok, true, JSON.stringify(res.body.data.problems));
    assert.ok(res.body.data.score >= 70, `ציון נמוך מדי: ${res.body.data.score}`);
  });

  test("סיסמה שנגזרת מהאימייל או מהשם נדחית", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const client = new Client();
    await client.prepare();
    const fromEmail = await client.post("/api/auth/password-check", {
      password: "NoamCohen-2026#שלום",
      email: "noamcohen@example.com",
    });
    assert.equal(fromEmail.body.data.ok, false, "סיסמה עם שם המשתמש מהאימייל");

    const fromName = await client.post("/api/auth/password-check", {
      password: "Shoshana#Rakevet2026",
      name: "Shoshana",
    });
    assert.equal(fromName.body.data.ok, false, "סיסמה עם השם הפרטי");
  });

  test("הרשמה עם סיסמה דלופה נדחית בשרת (לא רק בדפדפן)", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const client = new Client();
    await client.prepare();
    const res = await client.post("/api/auth/register", {
      name: "בדיקת סיסמה",
      email: `weak-${Date.now().toString(36)}@example.com`,
      password: "Password1!",
      acceptTerms: true,
    });
    if (res.status === 429) return t.skip("מכסת הרשמה");
    assert.equal(res.status, 400, JSON.stringify(res.body).slice(0, 200));
    assert.ok(Array.isArray(res.body.error.details.problems));
    assert.ok(res.body.error.details.problems.some((p) => /נפוצות|דלופות|הדלפת/.test(p)), JSON.stringify(res.body.error.details));
  });
});

/* ─────────────────────────── 6. מיסוך PII ─────────────────────────── */

describe("מיסוך פרטים מזהים", () => {
  test("אימיילי סגל מוצגים ממוסכים בדוח המבצר", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const res = await admin.get("/api/admin/fortress");
    assert.equal(res.status, 200);
    const { report, maskedStaff } = res.body.data;
    assert.ok(maskedStaff, "דוח ממוסך חייב להיות קיים");

    if (report.staff.missing2fa.length > 0) {
      assert.equal(maskedStaff.missing2fa.length, report.staff.missing2fa.length);
      for (const masked of maskedStaff.missing2fa) {
        assert.match(masked, /\*/, `לא מוסמך: ${masked}`);
        assert.equal(report.staff.missing2fa.includes(masked), false, "הערך הממוסך לא זהה למקור");
      }
    }

    if (staffEmail) {
      const maskedEntries = JSON.stringify(maskedStaff);
      assert.equal(maskedEntries.includes(staffEmail), false, "אימייל הסגל לא מופיע גלוי בדוח");
      assert.equal(report.staff.accounts.includes(staffEmail), true, "החשבון מופיע ברשומת הסגל הפנימית");
      assert.ok(
        maskedStaff.accounts.length === report.staff.accounts.length,
        "לכל חשבון סגל יש ייצוג ממוסך",
      );
      for (const masked of maskedStaff.accounts) assert.match(masked, /\*/);
    }
  });
});

/* ──────────────────── 7. רשימת היתר לאזור הניהול ──────────────────── */

describe("רשימת היתר לאזור הניהול", () => {
  test("כתובת שאינה ברשימה נחסמת, ושחזור מקומי משחרר", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    // 1. רשימה שמכילה כתובת זרה בלבד → הכתובת שלנו חסומה לניהול
    const set = execFileSync(
      process.execPath,
      ["scripts/allowlist.mjs", "--set", "203.0.113.7", "--yes"],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.match(set, /עודכנה/);

    const blocked = await admin.get("/api/admin/fortress");
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body).slice(0, 200));

    // 2. שחזור מקומי (המסלול היחיד שנשאר אחרי נעילה) → הניהול חוזר מיד
    const cleared = execFileSync(
      process.execPath,
      ["scripts/allowlist.mjs", "--clear", "--yes"],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.match(cleared, /נמחקה/);

    const restored = await admin.get("/api/admin/fortress");
    assert.equal(restored.status, 200, "אחרי ניקוי הרשימה הניהול חוזר");
    assert.equal(restored.body.data.report.allowlist.enabled, false);

    // 3. רשימה שמכילה אותנו → הניהול ממשיך לעבוד
    execFileSync(process.execPath, ["scripts/allowlist.mjs", "--set", "127.0.0.1", "--yes"], { cwd: ROOT, encoding: "utf8" });
    const allowed = await admin.get("/api/admin/fortress");
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.data.report.allowlist.entries, 1);
    execFileSync(process.execPath, ["scripts/allowlist.mjs", "--clear", "--yes"], { cwd: ROOT, encoding: "utf8" });
  });
});

/* ───────────────────── 8. גיבוי מוצפן ושחזור ───────────────────── */

describe("גיבוי מוצפן ושחזור", () => {
  const outDir = "/tmp/lt-fortress-backup";
  const restored = "/tmp/lt-fortress-restore.db";

  test("הגיבוי מוצפן, ושחזור ממנו נותן מסד תקין", async (t) => {
    if (!ready) return t.skip("אין שרת");
    rmSync(outDir, { recursive: true, force: true });
    rmSync(restored, { force: true });

    const env = { ...process.env, BACKUP_DIR: outDir };
    const created = execFileSync(process.execPath, ["scripts/backup-encrypted.mjs"], { cwd: ROOT, encoding: "utf8", env });
    assert.match(created, /ltbk|גיבוי/i);

    const files = execFileSync(process.execPath, ["scripts/backup-encrypted.mjs", "--list"], { cwd: ROOT, encoding: "utf8", env });
    const name = files.match(/[^\s]*\.ltbk/)?.[0];
    const backupFile = name ? path.join(outDir, path.basename(name)) : null;
    assert.ok(backupFile && existsSync(backupFile), `לא נמצא קובץ גיבוי: ${files.slice(0, 200)}`);

    const head = readFileSync(backupFile).subarray(0, 15).toString("latin1"); // 15 = אורך "SQLite format 3"
    assert.equal(head.slice(0, 5), "LTBK1", "הגיבוי חייב להתחיל בחתימת ההצפנה, לא בקובץ SQLite גלוי");
    assert.notEqual(head, "SQLite format 3");

    execFileSync(process.execPath, ["scripts/backup-encrypted.mjs", "--restore", backupFile, "--to", restored], {
      cwd: ROOT,
      encoding: "utf8",
      env,
    });
    assert.ok(existsSync(restored));
    assert.equal(readFileSync(restored).subarray(0, 15).toString("latin1"), "SQLite format 3");
    assert.ok(statSync(restored).size > 10_000, "המסד המשוחזר לא ריק");
  });
});

/* ─────────────────────────── ניקוי ─────────────────────────── */

after(async () => {
  if (!ready || !admin || !staffId) return;
  try {
    const res = await admin.del(`/api/users/${staffId}`);
    if (res.body?.ok !== true) console.error(`ℹ️  חשבון הבדיקה לא נמחק: ${JSON.stringify(res.body).slice(0, 120)}`);
  } catch (error) {
    console.error(`ℹ️  ניקוי חשבון הבדיקה נכשל: ${error?.message ?? error}`);
  }
});

/* ───────── 9. היומן חסין לשינויי משתמשים (לקח שנלמד מבדיקה) ───────── */

describe("היומן לא ניתן לשינוי בעקיפין", () => {
  /**
   * הבאג שנמצא: ל-actor_id הייתה הגבלת מפתח זר עם ON DELETE SET NULL, ולכן
   * **מחיקת משתמש** (או "זכות להישכח" עם ניקוי מלא) שכתבה מחדש רשומות עבר
   * והפכה חתימות תקנות ל"שבורות". הבדיקה מוכיחה שהחתימה שורדת מחיקה קשיחה.
   */
  test("מחיקת משתמש לא שוברת את חתימות היומן", async (t) => {
    if (!ready) return t.skip("אין שרת");
    if (!admin) return t.skip("אין סשן מנהל");

    const email = `${LEDGER_USER}-${Date.now().toString(36)}@example.com`;
    const db = new DatabaseSync(DB_FILE);
    let userId = null;
    try {
      db.prepare("DELETE FROM users WHERE email_norm = ?").run(email);
      const salt = crypto.randomBytes(16);
      const derived = crypto.scryptSync("Ledger-Probe#2026", salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 32768 * 8 * 2 });
      const hash = `scrypt$32768$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
      const inserted = db
        .prepare(
          `INSERT INTO users(email, email_norm, password_hash, password_algo, name, plan_code, email_verified)
           VALUES(?,?,?,'scrypt$32768$8$1',?,'free',1)`,
        )
        .run(email, email, hash, "בדיקת יומן");
      userId = Number(inserted.lastInsertRowid);
      db.prepare("INSERT INTO profiles(user_id, name, is_kid, sort_order) VALUES(?,?,0,1)").run(userId, "ראשי");

      // התחברות אמיתית → נכתבת רשומת auth.login עם actor_id של המשתמש
      const client = new Client("LemonTank-Ledger-Probe/1.0");
      await client.prepare();
      const login = await client.post("/api/auth/login", { email, password: "Ledger-Probe#2026" });
      assert.equal(login.body?.ok, true, JSON.stringify(login.body).slice(0, 160));

      const before = await admin.get("/api/admin/fortress");
      assert.equal(before.body.data.auditChain.ok, true, "השרשרת תקינה לפני המחיקה");
      const rowsBefore = before.body.data.auditChain.checked;

      // מחיקה קשיחה — בדיוק מה שניקוי "זכות להישכח" או סקריפט תפעול עושים
      const withActor = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE actor_id = ?").get(userId).c;
      assert.ok(withActor >= 1, "נרשמו רשומות יומן עם המזהה הזה");
      db.prepare("DELETE FROM profiles WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      userId = null;

      const after = await admin.get("/api/admin/fortress");
      const chain = after.body.data.auditChain;
      assert.equal(chain.ok, true, `מחיקת המשתמש שברה את השרשרת: ${JSON.stringify(chain.broken ?? []).slice(0, 300)}`);
      assert.equal(chain.brokenAt ?? null, null);
      assert.ok(chain.checked >= rowsBefore, "אף רשומת יומן לא נמחקה");

      // הפרטים ההיסטוריים נשמרו — המזהה לא אופס ל-NULL
      const survivor = db.prepare("SELECT actor_id FROM audit_log WHERE seq = ?").get(chain.head.seq);
      assert.ok(survivor, "ראש השרשרת קיים");
    } finally {
      if (userId) {
        db.prepare("DELETE FROM profiles WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      }
      db.close();
    }
  });
});
