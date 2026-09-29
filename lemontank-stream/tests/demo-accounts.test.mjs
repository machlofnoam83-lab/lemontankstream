#!/usr/bin/env node
/**
 * בדיקות למניית החשבונות לבדיקה (src/lib/demo-accounts.ts).
 *
 * הבדיקות נועדו להוכיח בעיקר את **גדר הביטחון**, לא רק את הפיצ'ר:
 *   1. אי אפשר ליצור חשבונות בדיקה על דומיין אמיתי (gmail.com) — הכתובות
 *      מוגבלות לדומיינים שמורים לבדיקות בלבד, כדי שלא יישלח מייל לאדם חי.
 *   2. כל חשבון שנוצר מסומן, ואין לו סיסמה שאפשר להשתמש בה (למנהל אין דרך
 *      להיכנס דרכו — בדיקה שההתחברות נכשלת).
 *   3. המחיקה מוחקת **רק** חשבונות מסומנים — חשבון אמיתי שנוצר לפני הבדיקה
 *      נשאר במקומו גם אחרי "מחק הכל".
 *   4. יצירה דורשת הרשאת מנהל; בלי סשן מקבלים 401.
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { stealthHeaders, CSRF_COOKIE } from "./helpers/stealth-entry.mjs";
import { adminLogin } from "./helpers/admin-login.mjs";

const BASE = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@lemontank.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-2026!";
const ROOT = path.resolve(import.meta.dirname, "..");
const DB_FILE = path.join(ROOT, "data", "lemontank.db");

/** משתמש "אמיתי" לבדיקת המחיקה הבטוחה — לא מסומן כדמו */
const REAL_EMAIL = "keepme-demo-suite@example.com";
const REAL_PASSWORD = "Shmor-Oti#2026-Bekarov";

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
  const derived = crypto.scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 32768 * 8 * 2 });
  return `scrypt$32768$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function seedRealUser() {
  return withDb((db) => {
    db.prepare("DELETE FROM users WHERE email_norm = ?").run(REAL_EMAIL);
    const result = db
      .prepare(
        `INSERT INTO users(email, email_norm, password_hash, password_algo, name, plan_code, email_verified)
         VALUES(?,?,?,'scrypt$32768$8$1',?,'free',1)`,
      )
      .run(REAL_EMAIL, REAL_EMAIL, scryptHash(REAL_PASSWORD), "משתמש אמיתי לבדיקה");
    const id = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO profiles(user_id, name, is_kid, sort_order) VALUES(?,?,0,0)").run(id, "ראשי");
    return id;
  });
}

function cleanupRealUser() {
  withDb((db) => {
    const row = db.prepare("SELECT id FROM users WHERE email_norm = ?").get(REAL_EMAIL);
    if (row?.id) {
      db.prepare("DELETE FROM profiles WHERE user_id = ?").run(row.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(row.id);
    }
  });
}

class Client {
  constructor(userAgent = "LemonTank-Demo-Test/1.0") {
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
    return this.cookies.get(CSRF_COOKIE) ?? "";
  }
  async prepare() {
    if (!this.cookies.has(CSRF_COOKIE)) await this.raw("/login");
  }
  async raw(pathname, options = {}) {
    const headers = { ...(options.headers ?? {}), ...stealthHeaders(), "user-agent": this.userAgent };
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
  del(pathname) {
    return this.json(pathname, { method: "DELETE", body: "{}" });
  }
}

const demosInDb = () =>
  withDb((db) =>
    db
      .prepare("SELECT id, email_norm, notes, email_verified FROM users WHERE notes LIKE 'DEMO-ACCOUNT%' AND deleted_at IS NULL")
      .all(),
  );

let ready = false;
let admin = null;

before(async () => {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
    ready = res.status < 500;
  } catch {
    ready = false;
  }
  if (!ready) {
    console.error(`\n⚠️  אין שרת ב-${BASE} — בדיקות החשבונות לבדיקה ידולגו. הרץ: npm run start\n`);
    return;
  }
  seedRealUser();
  const login = await adminLogin(Client, BASE, ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!login.ok) {
    console.error(`\n⚠️  התחברות מנהל נכשלה (${login.reason ?? "?"}) — בדיקות החשבונות לבדיקה ידולגו\n`);
    admin = null;
  } else {
    admin = login.client;
  }
});

after(() => {
  cleanupRealUser();
  // ניקוי כל חשבונות הבדיקה שהסוויטה יצרה (בדרך של האפליקציה עצמה)
  withDb((db) => {
    const rows = db.prepare("SELECT id FROM users WHERE notes LIKE 'DEMO-ACCOUNT%'").all();
    for (const row of rows) {
      db.prepare("DELETE FROM profiles WHERE user_id = ?").run(row.id);
      db.prepare("DELETE FROM subscriptions WHERE user_id = ?").run(row.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(row.id);
    }
  });
});

describe("מניית חשבונות לבדיקה — גדר בטיחות", () => {
  test("בלי התחברות — אין גישה (401)", async (t) => {
    if (!ready) return t.skip("אין שרת");
    const anon = new Client();
    await anon.prepare();
    const res = await anon.get("/api/admin/demo-accounts");
    assert.equal(res.status, 401, JSON.stringify(res.body));
  });

  test("דומיין אמיתי נדחה — אי אפשר לייצר כתובות לזרים", async (t) => {
    if (!admin) return t.skip("אין מנהל");
    const res = await admin.post("/api/admin/demo-accounts", { count: 3, domain: "gmail.com" });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(String(res.body?.error?.message ?? ""), /דומיין/);
    assert.equal(demosInDb().length, 0, "לא נוצר כלום מניסיון עם דומיין אמיתי");
  });

  test("יצירה בדומיין בדיקה — מסומנת, לא מאומתת, ובלי סיסמה שמישהו מכיר", async (t) => {
    if (!admin) return t.skip("אין מנהל");
    const res = await admin.post("/api/admin/demo-accounts", { count: 5, plusPercent: 40, domain: "example.com" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const created = res.body?.data?.created;
    assert.equal(created, 5, JSON.stringify(res.body));

    const rows = demosInDb();
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.ok(row.email_norm.endsWith("@example.com"), row.email_norm);
      assert.ok(String(row.notes).startsWith("DEMO-ACCOUNT"), String(row.notes));
      assert.equal(Number(row.email_verified), 0, "חשבון בדיקה אינו נחשב מאומת");
    }
  });

  test("אי אפשר להתחבר עם חשבון בדיקה", async (t) => {
    if (!admin) return t.skip("אין מנהל");
    const row = demosInDb()[0];
    if (!row) return t.skip("אין חשבונות בדיקה");
    const attempt = new Client("LemonTank-Demo-Login/1.0");
    await attempt.prepare();
    // הסיסמה אקראית ואינה מוחזרת למנהל — כל ניסיון חייב להיכשל
    for (const guess of ["Demo-1234", "demo", "password", "Demo-Account-2026!"]) {
      const res = await attempt.post("/api/auth/login", { email: row.email_norm, password: guess });
      assert.ok(res.status >= 400, `התחברות עם "${guess}" לא הייתה אמורה לעבור`);
    }
  });

  test("מחיקה מוחקת רק חשבונות מסומנים — משתמש אמיתי נשאר", async (t) => {
    if (!admin) return t.skip("אין מנהל");
    const before = demosInDb().length;
    assert.ok(before >= 1, "צריך לפחות חשבון בדיקה אחד לפני המחיקה");

    const res = await admin.del("/api/admin/demo-accounts");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(demosInDb().length, 0, "כל חשבונות הבדיקה נמחקו");

    const realStillThere = withDb((db) =>
      db.prepare("SELECT id, deleted_at FROM users WHERE email_norm = ?").get(REAL_EMAIL),
    );
    assert.ok(realStillThere, "המשתמש האמיתי לא נמחק");
    assert.equal(realStillThere.deleted_at, null, "המשתמש האמיתי לא סומן כמחוק");
  });

  test("האירועים נרשמו ביומן הביקורת", async (t) => {
    if (!admin) return t.skip("אין מנהל");
    const kinds = withDb((db) =>
      db
        .prepare("SELECT DISTINCT kind FROM security_events WHERE kind IN ('demo_accounts_created','demo_accounts_deleted')")
        .all()
        .map((row) => row.kind),
    );
    assert.ok(kinds.includes("demo_accounts_created"), JSON.stringify(kinds));
    assert.ok(kinds.includes("demo_accounts_deleted"), JSON.stringify(kinds));
  });
});
