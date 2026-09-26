#!/usr/bin/env node
/**
 * בדיקות אינטגרציה לסבב 4 — תשלום בגיפט קארד והתראות חוץ-אתריות:
 *   1. הנפקת כרטיסים ע"י הבעלים (ודרישת אימות מחדש לפעולה בכסף).
 *   2. מימוש עצמי של כרטיס שהאתר הנפיק → מנוי מיידי + רשומת תשלום.
 *   3. כרטיס שכבר נוצל / בוטל / פג תוקף — נדחה.
 *   4. כרטיס חיצוני: בקשת תשלום ממתינה, אישור ידני של הבעלים, דחייה.
 *   5. הגנות: הגבלת קצב על ניחוש קודים, ואי-שמירה של הקוד בטקסט גלוי.
 *   6. התראות יוצאות: נרשמות ביומן ההתראות גם כשאין יעד מוגדר (skipped).
 *
 * הבדיקות יוצרות משתמשי בדיקה ישירות במסד (עם Hash סיסמה אמיתי) כדי לא
 * לשרוף את מכסת ההרשמה של אותו IP, ומנקות אותם בסוף.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { adminLogin, stepUp } from "./helpers/admin-login.mjs";

const BASE = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@lemontank.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-2026!";
const ROOT = path.resolve(import.meta.dirname, "..");
const DB_FILE = path.join(ROOT, "data", "lemontank.db");
const MARK = "paytest";
/** סימון לכל כרטיס שהבדיקות מייצרות — כדי שסינון יזהה אותם ולא ייגע בכרטיסים אמיתיים */
const TEST_CARD_NOTE = "🧪 כרטיס בדיקה אוטומטי";
const USER_PASSWORD = "Kartis-Matana#77-Lavan";

/* ────────────── יצירת משתמש בדיקה ישירות במסד ────────────── */

function withDb(fn) {
  const db = new DatabaseSync(DB_FILE);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  // אותם פרמטרים בדיוק כמו האפליקציה; maxmem מועלה כי scrypt עם N=32768
  // דורש ~128*N*r בייטים — ברירת המחדל של Node (32MB) נמוכה מדי.
  const derived = crypto.scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 32768 * 8 * 2 });
  return `scrypt$32768$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function createTestUser(suffix) {
  const email = `${MARK}-${suffix}@example.com`;
  return withDb((db) => {
    db.prepare("DELETE FROM users WHERE email_norm = ?").run(email);
    const result = db
      .prepare(
        `INSERT INTO users(email, email_norm, password_hash, password_algo, name, plan_code, email_verified)
         VALUES(?,?,?,'scrypt$32768$8$1',?,'free',1)`,
      )
      .run(email, email, scryptHash(USER_PASSWORD), `בדיקת תשלום ${suffix}`);
    const id = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO profiles(user_id, name, is_kid, sort_order) VALUES(?,?,0,1)").run(id, "ראשי");
    return { id, email };
  });
}

const cleanupUsers = () =>
  withDb((db) => {
    db.prepare("DELETE FROM users WHERE email_norm LIKE ?").run(`${MARK}-%@example.com`);
  });

/* ─────────────────────────── לקוח HTTP ─────────────────────────── */

class Client {
  constructor(userAgent = "LemonTank-Pay-Test/1.0") {
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

  async prepare() {
    if (!this.cookies.has("lt_csrf")) await this.raw("/login");
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

  /** התחברות משתמש בדיקה (בלי 2FA) */
  async loginAs(email) {
    await this.prepare();
    return this.post("/api/auth/login", { email, password: USER_PASSWORD });
  }

  /** התחברות מנהל מלאה (כולל 2FA) */
  async loginAdmin(email, password) {
    await this.prepare();
    const first = await this.post("/api/auth/login", { email, password });
    if (!first.body?.data?.requires2fa) return first;
    const { savedSecret, totpCode } = await import("./helpers/admin-login.mjs");
    const secret = savedSecret();
    if (!secret) return first;
    return this.post("/api/auth/login", { challenge: first.body.data.challenge, totp: totpCode(secret) });
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
let admin = null;
let payer = null; // משתמש בדיקה מחובר
let payerRow = null;

before(async () => {
  ready = await serverReady();
  if (!ready) {
    console.error(`\n⚠️  אין שרת ב-${BASE} — בדיקות התשלום ידולגו. הרץ: npm run start\n`);
    return;
  }

  admin = await adminLogin(Client, BASE, ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!admin.ok) {
    console.error(`\n⚠️  התחברות מנהל נכשלה (${admin.reason ?? "?"}) — בדיקות התשלום ידולגו\n`);
    admin = null;
    return;
  }
  admin = admin.client;

  payerRow = createTestUser(`payer-${Date.now().toString(36)}`);
  payer = new Client("LemonTank-Pay-Test-Payer/1.0");
  const login = await payer.loginAs(payerRow.email);
  if (login.body?.ok !== true) {
    console.error(`\n⚠️  התחברות משתמש הבדיקה נכשלה: ${JSON.stringify(login.body).slice(0, 160)}\n`);
    payer = null;
  }
});

after(() => {
  if (!ready) return;
  cleanupUsers();
});

/* ─────────────────────── 1. הנפקת כרטיסים ─────────────────────── */

describe("הנפקת כרטיסי מתנה", () => {
  const codeFormat = /^LT-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

  test("הנפקה דורשת אימות מחדש (step-up)", async (t) => {
    if (!ready || !admin) return t.skip("אין סשן מנהל");

    const fresh = new Client("LemonTank-Pay-Test-Fresh/1.0");
    const login = await fresh.loginAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (login.body?.ok !== true) return t.skip("אין סוד 2FA להשלמת התחברות");

    const blocked = await fresh.post("/api/admin/giftcards", { action: "create", months: 1, count: 1, note: TEST_CARD_NOTE });
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body).slice(0, 200));
    assert.equal(blocked.body.error.code, "STEP_UP_REQUIRED");
  });

  test("אחרי אימות — נוצר כרטיס עם קוד בפורמט צפוי", async (t) => {
    if (!ready || !admin) return t.skip("אין סשן מנהל");
    const stepped = await stepUp(admin, ADMIN_PASSWORD);
    assert.equal(stepped.ok, true, JSON.stringify(stepped.body).slice(0, 160));

    const res = await admin.post("/api/admin/giftcards", {
      action: "create",
      months: 3,
      count: 1,
      valueIls: 99.9,
      maxUses: 1,
      note: TEST_CARD_NOTE,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 240));
    const codes = res.body.data.codes;
    assert.equal(codes.length, 1);
    assert.match(codes[0], codeFormat, `קוד לא בפורמט: ${codes[0]}`);

    // הקוד לא נשמר בטקסט גלוי במסד — רק Hash וקידומת
    const stored = withDb((db) =>
      db.prepare("SELECT code_hash, code_prefix, code_enc FROM gift_cards ORDER BY id DESC LIMIT 1").get(),
    );
    assert.notEqual(stored.code_hash, codes[0], "הקוד עצמו לא נשמר כשדה");
    assert.equal(stored.code_hash, crypto.createHash("sha256").update(codes[0].replace(/-/g, "")).digest("hex"));
    assert.equal(stored.code_enc.startsWith("enc:v1:"), true, "העותק נשמר מוצפן");
    assert.equal(stored.code_enc.includes(codes[0]), false, "הקוד הגלוי לא מופיע בשדה המוצפן");

    const raw = withDb((db) =>
      JSON.stringify(db.prepare("SELECT * FROM gift_cards ORDER BY id DESC LIMIT 1").get()),
    );
    assert.equal(raw.includes(codes[0].replace(/-/g, "")), false, "הקוד הגלוי לא מופיע בשורה");
  });
});

/* ──────────────────── 2. מימוש עצמי של כרטיס ──────────────────── */

describe("מימוש כרטיס שהאתר הנפיק", () => {
  let code = null;

  test("מכין כרטיס למסלול פלוס", async (t) => {
    if (!ready || !admin) return t.skip("אין סשן מנהל");
    const res = await admin.post("/api/admin/giftcards", { action: "create", months: 2, count: 1, valueIls: 79.8, note: TEST_CARD_NOTE });
    if (res.status !== 201) return t.skip(`יצירת כרטיס נכשלה (${res.status})`);
    code = res.body.data.codes[0];
    assert.ok(code);
  });

  test("המימוש מפעיל מנוי פלוס מיד ומנפיק רשומת תשלום", async (t) => {
    if (!ready || !payer) return t.skip("אין משתמש בדיקה");
    if (!code) return t.skip("לא נוצר כרטיס");

    const res = await payer.post("/api/giftcards/redeem", { code });
    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 240));
    assert.equal(res.body.data.granted, true);
    assert.equal(res.body.data.plan_code, "plus");
    assert.ok(Date.parse(res.body.data.period_end) > Date.now(), "תוקף המנוי בעתיד");

    // המנוי במסד + רשומת תשלום + התראה למשתמש
    const state = withDb((db) => ({
      sub: db
        .prepare("SELECT plan_code, status, current_period_end, provider FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1")
        .get(payerRow.id),
      payment: db
        .prepare("SELECT amount, provider, invoice_no, status FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 1")
        .get(payerRow.id),
      notification: db
        .prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND kind = 'billing'")
        .get(payerRow.id).c,
    }));
    assert.equal(state.sub.plan_code, "plus");
    assert.equal(state.sub.status, "active");
    assert.equal(state.payment.provider, "gift_card");
    assert.equal(state.payment.status, "paid");
    assert.match(state.payment.invoice_no, /^LT-\d{4}-\d{5}$/);
    assert.ok(state.notification >= 1, "נשלחה התראת חיוב למשתמש");
  });

  test("מימוש חוזר של אותו כרטיס נדחה", async (t) => {
    if (!ready || !payer || !code) return t.skip("אין כרטיס/משתמש");
    const res = await payer.post("/api/giftcards/redeem", { code });
    assert.ok([409, 403].includes(res.status), `צפוי 409/403, התקבל ${res.status}: ${JSON.stringify(res.body).slice(0, 160)}`);
    assert.match(res.body.error.message, /כבר|נוצל|בוטל|תוקף/);
  });

  test("כרטיס מבוטל לא ניתן למימוש", async (t) => {
    if (!ready || !admin || !payer) return t.skip("אין סשן");
    const created = await admin.post("/api/admin/giftcards", { action: "create", months: 1, count: 1, note: TEST_CARD_NOTE });
    if (created.status !== 201) return t.skip("יצירת כרטיס נכשלה");
    const revokedCode = created.body.data.codes[0];

    const list = await admin.get("/api/admin/giftcards");
    const lastCard = list.body.data.cards[0];
    assert.ok(lastCard?.id > 0, "הכרטיס מופיע ברשימה");
    const revoked = await admin.post("/api/admin/giftcards", { action: "revoke", id: lastCard.id, reason: "בדיקה" });
    assert.equal(revoked.body?.ok, true, JSON.stringify(revoked.body).slice(0, 160));
    const res = await payer.post("/api/giftcards/redeem", { code: revokedCode });
    assert.equal(res.status, 403, JSON.stringify(res.body).slice(0, 200));
    assert.match(res.body.error.message, /בוטל/);
  });
});

/* ─────────────────── 3. כרטיס חיצוני: אישור ידני ─────────────────── */

describe("בקשת תשלום חיצונית", () => {
  const externalCode = "GC-9F2K-77QX-31MD";
  let requestId = null;

  test("קוד לא מוכר נפתח כבקשה ממתינה — בלי מנוי", async (t) => {
    if (!ready || !payer) return t.skip("אין משתמש בדיקה");
    const res = await payer.post("/api/giftcards/redeem", {
      code: externalCode,
      contact: "noam#1234",
      evidence: "הזמנה 99887 מרשת X",
    });
    assert.equal(res.status, 202, JSON.stringify(res.body).slice(0, 200));
    assert.equal(res.body.data.pending, true);
    requestId = res.body.data.requestId;
    assert.ok(requestId > 0);

    const state = withDb((db) => ({
      request: db.prepare("SELECT status, kind, contact, evidence FROM redemption_requests WHERE id = ?").get(requestId),
      pendingPayments: db.prepare("SELECT COUNT(*) c FROM payments WHERE user_id = ? AND provider = 'gift_card_manual'").get(payerRow.id).c,
    }));
    assert.equal(state.request.status, "pending");
    assert.equal(state.request.kind, "external");
    assert.equal(state.request.contact, "noam#1234");
    assert.equal(state.pendingPayments, 0, "לא נוצר תשלום לפני אישור");
  });

  test("הבעלים רואה את הבקשה ויכול לאשר אותה", async (t) => {
    if (!ready || !admin || !requestId) return t.skip("אין בקשה");
    const list = await admin.get("/api/admin/giftcards");
    const pending = list.body.data.pending.find((row) => row.id === requestId);
    assert.ok(pending, "הבקשה מופיעה ברשימת הממתינות");
    assert.match(pending.code_prefix, /^GC-9F2K/);

    const approved = await admin.post("/api/admin/giftcards", {
      action: "decide",
      id: requestId,
      decision: "approve",
      note: "אושר ידנית",
      months: 1,
      valueIls: 39.9,
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body).slice(0, 200));
    assert.equal(approved.body.data.decision, "approve");

    const state = withDb((db) => ({
      request: db.prepare("SELECT status, decided_by, months FROM redemption_requests WHERE id = ?").get(requestId),
      sub: db.prepare("SELECT plan_code, status FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(payerRow.id),
      manualPayment: db.prepare("SELECT amount, status FROM payments WHERE user_id = ? AND provider = 'gift_card_manual'").get(payerRow.id),
    }));
    assert.equal(state.request.status, "approved");
    assert.equal(state.request.months, 1);
    assert.equal(state.sub.plan_code, "plus");
    assert.equal(state.manualPayment.status, "paid");
    assert.equal(state.manualPayment.amount, 39.9);
  });

  test("בקשה שנדחתה לא מפעילה מנוי, והמשתמש מקבל הודעה", async (t) => {
    if (!ready || !admin || !payer) return t.skip("אין סשן");
    const claim = await payer.post("/api/giftcards/redeem", { code: "GC-1111-2222-3333", contact: "noam#1234" });
    assert.equal(claim.status, 202);
    const id = claim.body.data.requestId;

    const before = withDb((db) => db.prepare("SELECT COUNT(*) c FROM payments WHERE user_id = ?").get(payerRow.id).c);
    const rejected = await admin.post("/api/admin/giftcards", { action: "decide", id, decision: "reject", note: "הכרטיס כבר נוצל בחנות" });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body).slice(0, 160));

    const state = withDb((db) => ({
      request: db.prepare("SELECT status, decision_note FROM redemption_requests WHERE id = ?").get(id),
      after: db.prepare("SELECT COUNT(*) c FROM payments WHERE user_id = ?").get(payerRow.id).c,
      notice: db.prepare("SELECT body FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(payerRow.id),
    }));
    assert.equal(state.request.status, "rejected");
    assert.equal(state.after, before, "דחייה לא מוסיפה תשלום");
    assert.match(state.notice.body ?? "", /לא אושרה|כרטיס/);

    // גם אם תוקף ינסה לאשר את אותה בקשה שוב — 409
    const again = await admin.post("/api/admin/giftcards", { action: "decide", id, decision: "approve" });
    assert.equal(again.status, 409, JSON.stringify(again.body).slice(0, 160));
  });

  test("ההתראות נרשמו ביומן ההתראות (גם בלי יעד מוגדר)", async (t) => {
    if (!ready || !admin) return t.skip("אין סשן מנהל");
    const state = withDb((db) => ({
      payment: db.prepare("SELECT COUNT(*) c FROM outbound_alerts WHERE kind = 'payment_request'").get().c,
      statuses: db.prepare("SELECT DISTINCT status FROM outbound_alerts WHERE kind = 'payment_request'").all().map((r) => r.status),
    }));
    assert.ok(state.payment >= 1, "בקשת תשלום נרשמה להתראה חיצונית");
    // בסביבת בדיקות אין אינטרנט => failed, או skipped כשלא הוגדר יעד. שניהם תקינים.
    assert.ok(state.statuses.some((s) => ["failed", "skipped", "sent"].includes(s)), JSON.stringify(state.statuses));
  });
});

/* ─────────────────── 4. הגנות על ניחוש קודים ─────────────────── */

describe("הגנת מימוש", () => {
  test("הגבלת קצב על ניסיונות מימוש (ניחוש קודים)", async (t) => {
    if (!ready || !payer) return t.skip("אין משתמש בדיקה");
    let limited = false;
    let statuses = [];

    for (let i = 0; i < 10 && !limited; i += 1) {
      const guess = `GC-${String(1000 + i)}-${String(2000 + i)}-${String(3000 + i)}`;
      const res = await payer.post("/api/giftcards/redeem", { code: guess });
      statuses.push(res.status);
      if (res.status === 429) limited = true;
    }

    assert.ok(limited, `אחרי מספר ניסיונות צפויה חסימה זמנית. התקבלו: ${statuses.join(", ")}`);
    const events = withDb((db) => db.prepare("SELECT COUNT(*) c FROM security_events WHERE kind = 'rate_limit_exceeded'").get().c);
    assert.ok(events >= 1, "חריגת מכסה נרשמה כאירוע אבטחה");
  });
});
