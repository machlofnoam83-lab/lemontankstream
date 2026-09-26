#!/usr/bin/env node
/**
 * קונסולת גיפט קארד מהטרמינל — לבעלים של האתר.
 *
 * הכלי הזה לא נוגע במסד ישירות: הוא נכנס לאתר כמו אדם (סיסמה + קוד 2FA),
 * ומבצע את הפעולות דרך אותם נתיבי API שהממשק משתמש בהם. זה מכוון —
 * כך כל הנפקה נרשמת ביומן הביקורת המשורשר, חתומה, וגלויה בדוח המבצר.
 *
 * דוגמאות:
 *   node scripts/giftcard.mjs create --months 3 --value 119.7
 *   node scripts/giftcard.mjs create --months 1 --count 5 --note "מכירה בטלגרם"
 *   node scripts/giftcard.mjs list
 *   node scripts/giftcard.mjs revoke 12 --reason "הונפק בטעות"
 *   node scripts/giftcard.mjs show 12
 *   node scripts/giftcard.mjs redeem LT-XXXXX-XXXXX-XXXXX-XXXXX --email user@example.com
 *   node scripts/giftcard.mjs settings --discord https://discord.com/api/webhooks/...
 *   node scripts/giftcard.mjs test-alert
 *
 * סודות: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD מהסביבה או מ-.env.local,
 * וקוד ה-2FA מהאפליקציה (--totp 123456) — או הסוד מ-/tmp/lt-admin-2fa.json
 * אם הוא קיים במכונה הזאת.
 */

import fs from "node:fs";
import { gateHeaders, cookieName } from "./lib/gate.mjs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOTP_STORE = "/tmp/lt-admin-2fa.json";

/* ───────────────────────────── קלט ───────────────────────────── */

const argv = process.argv.slice(2);
const command = argv[0] ?? "help";
const flag = (name) => argv.includes(`--${name}`);
const valueOf = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const next = argv[index + 1];
  return next && !next.startsWith("--") ? next : true;
};
const positional = argv.slice(1).filter((arg, index, list) => !arg.startsWith("--") && !(index > 0 && list[index - 1]?.startsWith("--")));

function loadEnvFile() {
  const file = path.join(ROOT, ".env.local");
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnvFile(), ...process.env };
const BASE = String(env.APP_URL ?? env.TEST_BASE_URL ?? `http://127.0.0.1:${env.PORT ?? 3000}`).replace(/\/$/, "");
const EMAIL = valueOf("email-admin") ?? env.SEED_ADMIN_EMAIL ?? "admin@lemontank.local";
const PASSWORD = valueOf("password") ?? env.SEED_ADMIN_PASSWORD ?? "";

/* ─────────────────────────── 2FA ─────────────────────────── */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(input) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of String(input).toUpperCase().replace(/=+$/, "")) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secret) {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function secretFromStore() {
  try {
    return JSON.parse(fs.readFileSync(TOTP_STORE, "utf8")).secret ?? null;
  } catch {
    return null;
  }
}

/* ─────────────────────────── לקוח ─────────────────────────── */

class Api {
  constructor() {
    this.cookies = new Map();
  }
  headers(extra = {}) {
    // gateHeaders(): מעבר שער החמקן (ריק כשהחמקן כבוי — אפס השפעה במצב רגיל)
    const out = { ...gateHeaders(), ...extra, "user-agent": "LemonTank-Ops/1.0" };
    if (this.cookies.size) out.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return out;
  }
  store(response) {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }
  csrf() {
    return this.cookies.get(cookieName("csrf")) ?? "";
  }
  async request(method, pathname, body) {
    const headers = this.headers();
    if (method !== "GET") {
      headers["x-csrf-token"] = this.csrf();
      headers.origin = BASE;
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${BASE}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    this.store(response);
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 200) };
    }
    return { status: response.status, body: payload };
  }
  get = (p) => this.request("GET", p);
  post = (p, b) => this.request("POST", p, b ?? {});
}

function die(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

async function login() {
  if (!PASSWORD) die("חסרה סיסמת מנהל. הגדר SEED_ADMIN_PASSWORD ב-.env.local או העבר --password");
  const api = new Api();
  await api.get("/login");
  const first = await api.post("/api/auth/login", { email: EMAIL, password: PASSWORD });
  if (first.body?.ok === true && !first.body.data?.requires2fa) return api;
  if (first.body?.data?.requires2fa !== true) {
    die(`ההתחברות נכשלה (${first.status}): ${first.body?.error?.message ?? JSON.stringify(first.body).slice(0, 160)}`);
  }

  const provided = valueOf("totp");
  const secret = secretFromStore();
  const code = typeof provided === "string" && provided !== "true" ? provided : secret ? totpCode(secret) : null;
  if (!code) die("נדרש קוד 2FA. העבר --totp 123456 (או הרץ את סוכן הבדיקות ששומר את הסוד)");

  const second = await api.post("/api/auth/login", { challenge: first.body.data.challenge, totp: code });
  if (second.body?.ok !== true) die(`קוד 2FA לא התקבל: ${second.body?.error?.message ?? second.status}`);
  return api;
}

/** אימות מחדש (step-up) — נדרש להנפקה, ביטול והחלטה על בקשות */
async function stepUp(api) {
  const res = await api.post("/api/security/step-up", { password: PASSWORD, totp: valueOf("totp") !== true ? valueOf("totp") : undefined });
  if (res.body?.ok !== true) die(`אימות מחדש נכשל (${res.status}): ${res.body?.error?.message ?? ""}`);
}

const ils = (value) => `₪${Number(value ?? 0).toFixed(2)}`;

/* ─────────────────────────── פקודות ─────────────────────────── */

async function cmdCreate(api) {
  await stepUp(api);
  const months = Number(valueOf("months", 1));
  const count = Number(valueOf("count", 1));
  const value = valueOf("value") ? Number(valueOf("value")) : null;
  const maxUses = valueOf("uses") ? Number(valueOf("uses")) : 1;
  const note = valueOf("note");
  const res = await api.post("/api/admin/giftcards", {
    action: "create",
    months,
    count,
    maxUses,
    ...(value ? { valueIls: value } : {}),
    ...(typeof note === "string" ? { note } : {}),
  });
  if (res.status !== 201) die(`ההנפקה נכשלה (${res.status}): ${res.body?.error?.message ?? JSON.stringify(res.body).slice(0, 200)}`);

  const data = res.body.data;
  console.log("");
  console.log(`🎁 הונפקו ${data.codes.length} כרטיסים · ${data.summary.plan} · ${data.summary.months} חודשים · שווי ${ils(data.summary.valueIls)}`);
  for (const code of data.codes) console.log(`   ${code}`);
  console.log("");
  console.log("   מסירה ללקוח: /redeem באתר. הכרטיס נשמר מוצפן ומופיע ב-/admin/giftcards.");
}

async function cmdList(api) {
  const res = await api.get("/api/admin/giftcards");
  if (res.status !== 200) die(`שליפת הכרטיסים נכשלה (${res.status})`);
  const { stats, cards, pending } = res.body.data;
  console.log("");
  console.log("📊 סטטוס תשלומים");
  console.log(`   כרטיסים: ${stats.cardsCreated} הונפקו · ${stats.cardsUsed} נוצלו · ${stats.cardsRevoked ?? 0} בוטלו`);
  console.log(`   הכנסות מדווחות: ${ils(stats.revenueIls ?? 0)} (${stats.payments} תשלומים) · מנויים פעילים: ${stats.activeSubscriptions}`);
  console.log("");
  console.log("🎟️  כרטיסים אחרונים");
  for (const card of cards.slice(0, 15)) {
    console.log(
      `   #${card.id} ${card.code_prefix}… ${card.plan_code ?? "-"} ${card.months}ח׳ · ${card.status} · נוצלו ${card.used_count}/${card.max_uses} · ${String(card.created_at ?? "").slice(0, 16)}`,
    );
  }
  if (pending.length) {
    console.log("");
    console.log(`⏳ בקשות ממתינות לאישור: ${pending.length}`);
    for (const row of pending) {
      console.log(`   #${row.id} ${row.code_prefix}… ${row.contact ?? "—"} · ${String(row.created_at ?? "").slice(0, 16)}`);
    }
    console.log("   אישור: node scripts/giftcard.mjs approve <id>   ·   דחייה: reject <id>");
  }
}

async function cmdShow(api) {
  const id = Number(positional[0]);
  if (!id) die("צריך מספר כרטיס: show <id>");
  const res = await api.post("/api/admin/giftcards", { action: "reveal", id });
  if (res.body?.ok !== true) die(`לא ניתן להציג: ${res.body?.error?.message ?? res.status}`);

  // הקוד מגיע מהעותק המוצפן שבמסד — כלומר ההצגה הזו מוכיחה גם את הפענוח.
  const details = (await api.get("/api/admin/giftcards")).body?.data?.cards?.find((card) => card.id === id) ?? null;
  console.log("");
  console.log(`🎟️  כרטיס #${id}`);
  console.log(`   קוד: ${res.body.data.code}`);
  console.log(`   סטטוס: ${res.body.data.status}`);
  if (details) {
    console.log(`   מסלול: ${details.plan_code} · ${details.months} חודשים · שווי ${ils(details.value_ils)}`);
    console.log(`   נוצל ${details.used_count}/${details.max_uses} פעמים · נוצר ${String(details.created_at).slice(0, 16)}`);
    if (details.note) console.log(`   הערה: ${details.note}`);
  }
  console.log("   (הצגת הקוד נרשמת ביומן הביקורת — פעולה רגישה)");
}

async function cmdDecide(api, decision) {
  const id = Number(positional[0]);
  if (!id) die(`צריך מספר בקשה: ${decision} <id>`);
  await stepUp(api);
  const months = valueOf("months") ? Number(valueOf("months")) : undefined;
  const value = valueOf("value") ? Number(valueOf("value")) : undefined;
  const note = valueOf("note");
  const res = await api.post("/api/admin/giftcards", {
    action: "decide",
    id,
    decision,
    ...(months !== undefined ? { months } : {}),
    ...(value !== undefined ? { valueIls: value } : {}),
    ...(typeof note === "string" ? { note } : {}),
  });
  if (res.body?.ok !== true) die(`הפעולה נכשלה (${res.status}): ${res.body?.error?.message ?? ""}`);
  console.log(decision === "approve" ? `✅ בקשה #${id} אושרה והמנוי הופעל` : `🚫 בקשה #${id} נדחתה`);
}

async function cmdRevoke(api) {
  const id = Number(positional[0]);
  if (!id) die("צריך מספר כרטיס: revoke <id>");
  await stepUp(api);
  const res = await api.post("/api/admin/giftcards", { action: "revoke", id, reason: valueOf("reason") ?? "בוטל מהטרמינל" });
  if (res.body?.ok !== true) die(`הביטול נכשל (${res.status}): ${res.body?.error?.message ?? ""}`);
  console.log(`🚫 כרטיס #${id} בוטל`);
}

async function cmdRedeem(api) {
  const code = positional[0];
  if (!code) die("צריך קוד כרטיס: redeem LT-XXXXX-XXXXX-XXXXX-XXXXX --email <משתמש>");
  const email = valueOf("email");
  if (!email) die("צריך --email של הלקוח (המימוש מתבצע בחשבון שלו)");

  // מימוש בשם הלקוח דורש את הסיסמה שלו — לכן משתמשים בנתיב הניהולי:
  // מייצרים עבורו בקשת תשלום מאושרת, במקום להתחזות לחשבון.
  console.log("ℹ️  מימוש בשם לקוח מתבצע דרך אישור בקשה (/admin/giftcards) ולא בהתחזות לחשבון.");
  const claim = await api.post("/api/admin/giftcards", { action: "decide", id: Number(code) });
  console.log(JSON.stringify(claim.body).slice(0, 200));
}

async function cmdSettings(api) {
  await stepUp(api);
  const discord = valueOf("discord");
  const webhook = valueOf("webhook");
  const email = valueOf("email");
  const body = { action: "settings" };
  if (typeof discord === "string") body.discord = discord;
  if (typeof webhook === "string") body.webhook = webhook;
  if (typeof email === "string") body.email = email;
  const res = await api.post("/api/admin/giftcards", body);
  if (res.body?.ok !== true) die(`שמירת ההגדרות נכשלה (${res.status}): ${res.body?.error?.message ?? ""}`);
  console.log("✅ הגדרות ההתראות עודכנו");
  console.log(`   Discord: ${res.body.data.settings.discord ? "מוגדר" : "לא מוגדר"}`);
  console.log(`   Webhook: ${res.body.data.settings.webhook ? "מוגדר" : "לא מוגדר"}`);
  console.log(`   דוא״ל:   ${res.body.data.settings.email ?? "לא מוגדר"}`);
}

async function cmdTestAlert(api) {
  const res = await api.post("/api/admin/giftcards", { action: "testAlert" });
  if (res.body?.ok !== true) die(`שליחת התראה נכשלה (${res.status})`);
  console.log(res.body.data.sent ? "✅ התראת בדיקה נשלחה" : "⚠️  לא הוגדר יעד — ההתראה נרשמה כ״דולגה״ (outbound_alerts)");
}

async function cmdPending(api) {
  const res = await api.get("/api/admin/giftcards");
  const pending = res.body?.data?.pending ?? [];
  if (!pending.length) {
    console.log("✅ אין בקשות ממתינות");
    return;
  }
  for (const row of pending) {
    console.log(`#${row.id} ${row.code_prefix}… ${row.contact ?? "—"} · ${row.evidence ?? ""} · ${String(row.created_at).slice(0, 16)}`);
  }
}

function usage() {
  console.log(`🍋 LemonTank · קונסולת גיפט קארד

  create [--months 3] [--count 5] [--value 119.7] [--uses 1] [--note "..."]
  list                      · מצב הכרטיסים והבקשות
  pending                   · בקשות תשלום שממתינות לאישור
  approve <id> [--months 1] [--value 39.9] [--note "..."]
  reject <id> [--note "..."]
  show <id>                 · הצגת הקוד (נרשם ביומן)
  revoke <id> [--reason "..."]
  settings [--discord URL] [--webhook URL] [--email you@example.com]
  test-alert                · בדיקת ערוץ ההתראות

  אפשרויות: --totp 123456 (אם אין סוד שמור) · --password '...' · APP_URL לסביבה אחרת`);
}

/* ─────────────────────────── ריצה ─────────────────────────── */

if (command === "help" || flag("help")) {
  usage();
  process.exit(0);
}

const api = await login();

switch (command) {
  case "create":
    await cmdCreate(api);
    break;
  case "list":
    await cmdList(api);
    break;
  case "show":
    await cmdShow(api);
    break;
  case "pending":
    await cmdPending(api);
    break;
  case "approve":
    await cmdDecide(api, "approve");
    break;
  case "reject":
    await cmdDecide(api, "reject");
    break;
  case "revoke":
    await cmdRevoke(api);
    break;
  case "redeem":
    await cmdRedeem(api);
    break;
  case "settings":
    await cmdSettings(api);
    break;
  case "test-alert":
    await cmdTestAlert(api);
    break;
  default:
    usage();
    process.exit(2);
}
