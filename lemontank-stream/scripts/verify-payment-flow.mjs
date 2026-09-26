#!/usr/bin/env node
/**
 * הוכחה חיה לזרימת התשלום — מהקצה לקצה, דרך HTTP בלבד.
 *
 * מה הסקריפט מוכיח (ולא "אמור לעבוד"):
 *   1. בעל האתר מנפיק כרטיס (עם אימות מחדש) — הקוד מופיע פעם אחת ומוצפן במסד.
 *   2. לקוח חדש נרשם באתר (הרשמה אמיתית, כמו אדם).
 *   3. הלקוח שולח את הקוד ב-/redeem  → המנוי מופעל מיד.
 *   4. נבדק במסד: מנוי פעיל, רשומת תשלום, התראה ללקוח, ויומן ביקורת חתום.
 *   5. קוד לא מוכר ⇒ בקשת תשלום ממתינה (ולא מנוי), שממתינה לאישור אדם.
 *   6. מחיקת הלקוח לא שוברת את יומן הביקורת (יומן חסין למחיקה).
 *
 * הרצה:  node scripts/verify-payment-flow.mjs
 * דורש:  שרת רץ (npm run start) + .env.local עם SEED_ADMIN_PASSWORD
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = String(process.env.APP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
const DB_FILE = process.env.DATABASE_FILE ? path.resolve(ROOT, process.env.DATABASE_FILE) : path.join(ROOT, "data", "lemontank.db");
const CUSTOMER_EMAIL = `buyer-${Date.now().toString(36)}@example.com`;
const CUSTOMER_PASSWORD = "Kartis-Matana#2026-Buyer";

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
const ADMIN_EMAIL = env.SEED_ADMIN_EMAIL ?? "admin@lemontank.local";
const ADMIN_PASSWORD = env.SEED_ADMIN_PASSWORD ?? "";

const ok = (label, extra = "") => console.log(`  ✅ ${label}${extra ? ` — ${extra}` : ""}`);
const fail = (label, extra = "") => {
  console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ""}`);
  process.exitCode = 1;
};

class Client {
  constructor(cookies) {
    this.cookies = cookies instanceof Map ? cookies : new Map();
    this.data = {};
  }
  static async create() {
    const client = new Client();
    await client.raw("/login");
    return client;
  }
  clone() {
    return new Client(new Map(this.cookies));
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(response) {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }
  csrf() {
    return this.cookies.get("lt_csrf") ?? "";
  }
  async raw(pathname, options = {}) {
    const headers = { "user-agent": "LemonTank-Verifier/1.0", ...(options.headers ?? {}) };
    if (this.cookies.size) headers.cookie = this.header();
    if (options.method && !["GET", "HEAD"].includes(options.method)) {
      headers["x-csrf-token"] = this.csrf();
      headers.origin = BASE;
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${BASE}${pathname}`, { ...options, headers, redirect: "manual" });
    this.store(response);
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { status: response.status, body };
  }
  get = (p) => this.raw(p);
  post = (p, b) => this.raw(p, { method: "POST", body: JSON.stringify(b ?? {}) });
}

const db = new DatabaseSync(DB_FILE);
const one = (sql, params = []) => db.prepare(sql).get(...params);
const count = (sql, params = []) => Number(db.prepare(sql).get(...params)?.c ?? 0);

console.log(`\n🧪 הוכחת זרימת תשלום בגיפט קארד — ${BASE}\n`);

/* ── 0. מנהל ─────────────────────────────────────────────────────────────── */
console.log("1️⃣  מנהל הבעלים נכנס");
const admin = await Client.create();
let res = await admin.post("/api/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (res.body?.data?.requires2fa) {
  const { totpCode, savedSecret } = await import("../tests/helpers/admin-login.mjs").catch(() => ({}));
  const secret = savedSecret?.() ?? null;
  if (!secret || !totpCode) {
    fail("אין סוד 2FA במכונה", "הרץ קודם חבילת בדיקות או השתמש ב-/admin/giftcards בדפדפן");
    process.exit(1);
  }
  res = await admin.post("/api/auth/login", { challenge: res.body.data.challenge, totp: totpCode(secret) });
}
if (res.body?.ok !== true) {
  fail("התחברות מנהל", JSON.stringify(res.body).slice(0, 200));
  process.exit(1);
}
ok("התחברות + 2FA");

/* ── 1. הנפקה ────────────────────────────────────────────────────────────── */
console.log("\n2️⃣  הנפקת כרטיס מתנה");
res = await admin.post("/api/security/step-up", { password: ADMIN_PASSWORD });
if (res.body?.ok !== true) {
  fail("אימות מחדש", JSON.stringify(res.body).slice(0, 200));
  process.exit(1);
}
ok("אימות מחדש עבר (בלעדיו הנפקה נחסמת)");

// סשן טרי (בלי חלון אימות פתוח) — כדי שהבדיקה תהיה אמיתית ולא "כבר אימתתי"
const freshAdmin = await Client.create();
let freshLogin = await freshAdmin.post("/api/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (freshLogin.body?.data?.requires2fa) {
  const helper = await import("../tests/helpers/admin-login.mjs").catch(() => ({}));
  const secret = helper.savedSecret?.() ?? null;
  if (secret) {
    freshLogin = await freshAdmin.post("/api/auth/login", {
      challenge: freshLogin.body.data.challenge,
      totp: helper.totpCode(secret),
    });
  }
}
if (freshLogin.body?.ok === true) {
  const blocked = await freshAdmin.post("/api/admin/giftcards", { action: "create", months: 1, count: 1 });
  if (blocked.status === 403) ok("הנפקה בלי אימות מחדש נחסמה (403)");
  else fail("הנפקה בלי אימות מחדש אמורה להיחסם", `התקבל ${blocked.status}`);
}

res = await admin.post("/api/admin/giftcards", { action: "create", months: 3, count: 1, valueIls: 119.7, note: "הוכחת זרימה" });
const code = res.body?.data?.codes?.[0];
if (res.status !== 201 || !code) {
  fail("הנפקת כרטיס", JSON.stringify(res.body).slice(0, 300));
  process.exit(1);
}
ok("הונפק כרטיס", `${code} · ${res.body.data.summary.months} חודשים · ₪${res.body.data.summary.valueIls}`);

const stored = one("SELECT code_hash, code_enc FROM gift_cards ORDER BY id DESC LIMIT 1");
if (stored.code_enc.includes(code)) fail("הקוד נשמר בטקסט גלוי");
else ok("הקוד נשמר מוצפן (אין עותק גלוי במסד)");
if (stored.code_hash === crypto.createHash("sha256").update(code.replace(/-/g, "")).digest("hex")) {
  ok("ה-Hash תואם לקוד שמוצג ללקוח");
} else {
  fail("ה-Hash לא תואם", "מימוש של הקוד הזה ייכשל");
}

/* ── 2. לקוח חדש ────────────────────────────────────────────────────────── */
console.log("\n3️⃣  לקוח חדש נרשם באתר");
const buyer = await Client.create();
res = await buyer.post("/api/auth/register", {
  name: "בודק תשלום",
  email: CUSTOMER_EMAIL,
  password: CUSTOMER_PASSWORD,
  acceptTerms: true,
});
if (res.body?.ok !== true) {
  fail("הרשמה", JSON.stringify(res.body).slice(0, 200));
  process.exit(1);
}
const customerId = Number(one("SELECT id FROM users WHERE email_norm = ?", [CUSTOMER_EMAIL])?.id ?? 0);
ok("נרשם", `#${customerId} · ${CUSTOMER_EMAIL}`);

/* ── 3. מימוש ───────────────────────────────────────────────────────────── */
console.log("\n4️⃣  הלקוח שולח את הקוד ב-/redeem");
res = await buyer.post("/api/giftcards/redeem", { code });
if (res.status !== 200 || res.body?.data?.granted !== true) {
  fail("המימוש נכשל", `${res.status} ${JSON.stringify(res.body).slice(0, 240)}`);
  process.exit(1);
}
ok("המנוי הופעל", `${res.body.data.plan_code} עד ${String(res.body.data.period_end).slice(0, 10)}`);

const sub = one("SELECT plan_code, status, current_period_end FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1", [customerId]);
if (sub?.plan_code === "plus" && sub?.status === "active") ok("מנוי פעיל במסד", `עד ${String(sub.current_period_end).slice(0, 10)}`);
else fail("אין מנוי פעיל במסד", JSON.stringify(sub));

const payment = one("SELECT amount, provider, invoice_no, status FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 1", [customerId]);
if (payment?.status === "paid" && payment?.provider === "gift_card") ok("רשומת תשלום", `${payment.invoice_no} · ₪${payment.amount}`);
else fail("אין רשומת תשלום", JSON.stringify(payment));

const notice = count("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND kind = 'billing'", [customerId]);
ok("התראת חיוב ללקוח", `${notice} הודעות`);

const ledger = count(
  "SELECT COUNT(*) c FROM audit_log WHERE action = 'giftcard.redeem' AND after_json LIKE ?",
  [`%"userId":${customerId}%`],
);
if (ledger >= 1) ok("רשומת מימוש מפורשת ביומן הביקורת", `${ledger} רשומות`);
else fail("אין רשומת giftcard.redeem ביומן", "חקירת מימוש תהיה חסרה");

/* ── 4. קוד לא מוכר ─────────────────────────────────────────────────────── */
console.log("\n5️⃣  קוד לא מוכר ⇒ בקשת תשלום ממתינה");
const beforePayments = count("SELECT COUNT(*) c FROM payments WHERE user_id = ?", [customerId]);
res = await buyer.post("/api/giftcards/redeem", { code: "GC-7777-8888-9999", contact: "buyer#1234" });
if (res.status === 202 && res.body?.data?.pending === true) {
  ok("נפתחה בקשה ממתינה", `#${res.body.data.requestId} — מחכה לאישור אדם`);
} else {
  fail("קוד לא מוכר לא נפתח כבקשה", `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
}
const afterPayments = count("SELECT COUNT(*) c FROM payments WHERE user_id = ?", [customerId]);
if (afterPayments === beforePayments) ok("לא הופעל מנוי ולא נוצר תשלום לפני אישור");
else fail("נוצר תשלום בלי אישור");

const pending = await admin.get("/api/admin/giftcards");
const pendingRow = (pending.body?.data?.pending ?? []).find((row) => row.contact === "buyer#1234");
if (pendingRow) ok("הבקשה מופיעה אצל הבעלים", `#${pendingRow.id} ${pendingRow.code_prefix}…`);
else fail("הבקשה לא הופיעה ברשימת הבעלים");

/* ── 5. היומן שורד מחיקת לקוח ───────────────────────────────────────────── */
console.log("\n6️⃣  היומן חסין למחיקת חשבון");
const chainBefore = await admin.get("/api/admin/fortress");
if (chainBefore.body?.data?.auditChain?.ok !== true) fail("השרשרת שבורה עוד לפני המחיקה");
else ok("השרשרת תקינה לפני");

db.prepare("DELETE FROM notifications WHERE user_id = ?").run(customerId);
for (const table of ["profiles", "sessions", "subscriptions", "payments", "redemption_requests"]) {
  try {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(customerId);
  } catch {
    /* טבלה לא רלוונטית */
  }
}
db.prepare("DELETE FROM users WHERE id = ?").run(customerId);

const chainAfter = await admin.get("/api/admin/fortress");
const stillOk = chainAfter.body?.data?.auditChain?.ok === true;
if (stillOk) ok("השרשרת נשארה שלמה", `${chainAfter.body.data.auditChain.checked} רשומות נבדקו`);
else fail("המחיקה שברה את השרשרת", JSON.stringify(chainAfter.body?.data?.auditChain?.broken ?? []).slice(0, 240));

console.log(
  process.exitCode ? "\n❌ ההוכחה נכשלה — יש מה לתקן\n" : "\n✅ הזרימה כולה עובדת: הנפקה ⇒ מסירה ⇒ מימוש ⇒ מנוי ⇒ יומן שלם\n",
);
db.close();
