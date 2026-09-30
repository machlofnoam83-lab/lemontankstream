#!/usr/bin/env node
/**
 * חיבור הדומיין לאתר — כל מה שאפשר לעשות אוטומטית, בפקודה אחת.
 *
 *   node scripts/setup-domain.mjs stream.dpdns.org
 *   node scripts/setup-domain.mjs stream.dpdns.org --tunnel-id 4a2b...c9
 *   node scripts/setup-domain.mjs stream.dpdns.org --check     # בדיקה בלבד
 *
 * מה הסקריפט עושה:
 *   1. מאמת את שם הדומיין ומסביר מה עוד לא מוכן בו
 *   2. בודק ב-DNS אם הדומיין כבר מופנה לשרתי השמות של Cloudflare
 *      (זה השלב שבו כולם נתקעים — האזור ב-CF לא נכנס ל-Active)
 *   3. כותב את הערכים ל-.env.local:  APP_URL · COOKIE_SECURE · ALLOWED_HOSTS
 *   4. מייצר קובץ מנהרה מוכן: deploy/cloudflared-<domain>.yml
 *   5. מדפיס את המדריך המדויק לשלבים הידניים שנשארו
 *
 * הסקריפט **לא** נוגע ב-Cloudflare ולא בחשבון שלך — הוא מכין את הצד של השרת.
 */

import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check");
const tunnelIdx = args.indexOf("--tunnel-id");
const TUNNEL_ID = tunnelIdx >= 0 ? args[tunnelIdx + 1] : null;
const domain = (args.find((a) => !a.startsWith("--") && a !== TUNNEL_ID) ?? "").trim().toLowerCase();

const C = { off: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", g: "\x1b[32m", y: "\x1b[33m", r: "\x1b[31m", c: "\x1b[36m" };
const ok = (m) => console.log(`  ${C.g}✓${C.off} ${m}`);
const warn = (m) => console.log(`  ${C.y}!${C.off} ${m}`);
const bad = (m) => console.log(`  ${C.r}✗${C.off} ${m}`);
const info = (m) => console.log(`  ${C.dim}${m}${C.off}`);

if (!domain) {
  console.log(`
${C.bold}🔗 חיבור דומיין לאתר${C.off}

  שימוש:  node scripts/setup-domain.mjs <domain> [--tunnel-id <id>] [--check]

  דוגמאות:
    node scripts/setup-domain.mjs stream.dpdns.org
    node scripts/setup-domain.mjs stream.dpdns.org --tunnel-id 6c9b6f1e-1234-4abc-9def-0123456789ab

  לאיזה דומיין כדאי? דומיין שמאפשר ${C.bold}האצלת שרתי שמות ל-Cloudflare${C.off} —
  זה תנאי הכרחי למנהרה ולשכבת החמקן. מומלץ: ${C.c}DigitalPlat FreeDomain${C.off}
  (‎.dpdns.org / .qzz.io). ראו FREE-HOSTING.md סעיף 3.
`);
  process.exit(1);
}

console.log(`\n${C.bold}🔗 חיבור הדומיין: ${C.c}${domain}${C.off}\n`);

// ─────────────────────────── 1. ולידציית השם ─────────────────────────────────
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
if (!DOMAIN_RE.test(domain)) {
  bad(`"${domain}" אינו שם דומיין תקין`);
  info("צריך להיראות כך: stream.dpdns.org  ·  my-movies.qzz.io  ·  lemontank.co.il");
  process.exit(1);
}
ok(`שם הדומיין תקין: ${domain}`);

const labels = domain.split(".");
if (labels.length < 3) {
  warn("דומיין שני-רמות (example.com) — ודא שהוא רשום על שמך, לא תת-דומיין של מישהו אחר");
} else {
  info(`דומיין בן ${labels.length} רמות — בסדר לדומיין חינם (למשל dpdns.org)`);
}

if (domain.endsWith(".dedyn.io") || domain.endsWith(".duckdns.org") || domain.endsWith(".is-a.dev")) {
  warn("הסיומת הזו **לא מאפשרת** האצלת NS ל-Cloudflare → המנהרה לא תעבוד");
  info("המלצה: דומיין מ-DigitalPlat (‎.dpdns.org / .qzz.io). ראו FREE-HOSTING.md סעיף 3א.");
}

// ───────────────────── 2. בדיקת שרתי השמות (השלב הקריטי) ─────────────────────
console.log(`\n${C.bold}1️⃣  בדיקת הפניית שרתי השמות ל-Cloudflare${C.off}`);
let nsOk = false;
try {
  const records = await dns.resolveNs(domain).catch(() => null);
  if (!records || !records.length) {
    warn("לא נמצאו רשומות NS — הדומיין עדיין לא פעיל ב-DNS");
    info("אם הרגע הגדרת — המתן עד שעה. אחרת: השלם את שלב ההאצלה (סעיף 3 למטה).");
  } else {
    const cf = records.filter((r) => /ns\.cloudflare\.com$/i.test(r));
    if (cf.length >= 2) {
      nsOk = true;
      ok(`הדומיין מופנה ל-Cloudflare: ${records.join(" · ")}`);
      info("מצוין — האזור אמור להיות Active ב-Cloudflare, ואפשר ליצור מנהרה");
    } else if (cf.length === 1) {
      warn(`רק שרת שמות אחד של Cloudflare (${cf[0]}) — Cloudflare דורשת שניים`);
      info(`הנוכחיים: ${records.join(" · ")}`);
    } else {
      warn(`הדומיין עדיין לא על Cloudflare: ${records.join(" · ")}`);
      info(" זה השלב שבו רוב האנשים נתקעים — Cloudflare לא תאשר את האזור");
      info(" עד ששני שרתי השמות שלה יהיו מוגדרים אצל רשם הדומיין.");
    }
  }
} catch (err) {
  warn(`בדיקת DNS לא הצליחה: ${err?.code ?? err?.message ?? err}`);
  info("זה לא חוסם — פשוט אי אפשר לאמת את שלב ה-NS מכאן");
}

// בדיקת A/CNAME — האם הדומיין כבר מפנה לשרת
try {
  const a = await dns.resolve4(domain).catch(() => []);
  if (a.length) {
    const isCf = a.every((ip) => /^(104\.|172\.6[4-9]\.|172\.7[01]\.|188\.114\.|162\.15[89]\.|173\.245\.|103\.2[12]\.|141\.101\.)/.test(ip));
    if (isCf) ok(`הדומיין מוגש דרך Cloudflare (${a.slice(0, 2).join(", ")}) — הפרוקסי פעיל`);
    else warn(`הדומיין מצביע ל-${a.slice(0, 2).join(", ")} — אם זו כתובת השרת שלך, הפרוקסי של CF כבוי`);
  }
} catch { /* אין רשומת A — תקין לפני ההגדרה */ }

// ─────────────────────────── 3. עדכון .env.local ─────────────────────────────
console.log(`\n${C.bold}2️⃣  עדכון הגדרות האתר (.env.local)${C.off}`);
const envPath = path.join(ROOT, ".env.local");
const upstream = { APP_URL: `https://${domain}`, COOKIE_SECURE: "true", ALLOWED_HOSTS: `${domain},www.${domain}` };

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(path.join(ROOT, ".env.example"), envPath);
  info("נוצר .env.local מתוך .env.example");
}

if (CHECK_ONLY) {
  let current = fs.readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(upstream)) {
    const match = current.match(new RegExp(`^${key}=(.*)$`, "m"));
    const existing = match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
    if (existing === value.replace(/^["']|["']$/g, "")) ok(`${key} כבר מוגדר נכון`);
    else warn(`${key}: ${existing ?? "(חסר)"} → ${value}`);
  }
  console.log(`\n${C.dim}מצב בדיקה — לא נכתב שום שינוי. להחלה: הסר --check${C.off}\n`);
  printManual();
  process.exit(0);
}

let env = fs.readFileSync(envPath, "utf8");
for (const [key, value] of Object.entries(upstream)) {
  const line = `${key}="${value}"`;
  if (new RegExp(`^${key}=`, "m").test(env)) {
    env = env.replace(new RegExp(`^${key}=.*$`, "m"), line);
    ok(`${key} עודכן: ${value}`);
  } else {
    env += `${env.endsWith("\n") ? "" : "\n"}${line}\n`;
    ok(`${key} נוסף: ${value}`);
  }
}
fs.writeFileSync(envPath, env, { mode: 0o600 });
ok("ההגדרות נשמרו (הרשאות 600)");

// ─────────────────────── 4. קובץ מנהרה מוכן להעתקה ───────────────────────────
console.log(`\n${C.bold}3️⃣  קובץ מנהרה מוכן${C.off}`);
const templatePath = path.join(ROOT, "deploy", "cloudflared-config.yml");
const outPath = path.join(ROOT, "deploy", `cloudflared-${domain}.yml`);
if (!fs.existsSync(templatePath)) {
  warn("לא נמצא תבנית המנהרה — דלג על השלב הזה");
} else {
  const tunnel = TUNNEL_ID || "<TUNNEL-ID>";
  const rendered = fs.readFileSync(templatePath, "utf8")
    .replace(/^tunnel: .*$/m, `tunnel: ${tunnel}`)
    .replace(/^credentials-file: .*$/m, `credentials-file: /etc/cloudflared/${tunnel}.json`)
    .replace(/lemontank\.co\.il/g, domain)
    .replace(/^#.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(outPath, rendered);
  ok(`נוצר: deploy/cloudflared-${domain}.yml`);
  if (!TUNNEL_ID) info("החלף <TUNNEL-ID> אחרי cloudflared tunnel create (או הרץ שוב עם --tunnel-id)");
}

// ────────────────────────────── סיכום ────────────────────────────────────────
console.log(`\n${C.bold}📋 מה שנשאר לך — בסדר הזה${C.off}\n`);
if (!nsOk) {
  console.log(`  ${C.bold}א.${C.off} דומיין → Cloudflare (${C.y}חובה לפני הכל${C.off})`);
  console.log("     1. Cloudflare → Add a site → " + domain);
  console.log("     2. העתק את שני שרתי השמות ש-CF מציגה");
  console.log("     3. הדבק אותם אצל רשם הדומיין (ב-DigitalPlat: עדכן NS)");
  console.log(`     4. המתן ש-CF תסמן ${C.g}Active${C.off}, ואז הרץ שוב את הסקריפט הזה\n`);
}
console.log(`  ${C.bold}ב.${C.off} מנהרה בשרת:`);
console.log("     cloudflared tunnel login");
console.log("     cloudflared tunnel create lemontank        " + C.dim + "# ← ה-ID" + C.off);
console.log(`     node scripts/setup-domain.mjs ${domain} --tunnel-id <ה-ID>`);
console.log("     sudo cp deploy/cloudflared-" + domain + ".yml /etc/cloudflared/config.yml");
console.log("     sudo cloudflared service install && sudo systemctl enable --now cloudflared");
console.log(`\n  ${C.bold}ג.${C.off} חמקן והפעלה מחדש:`);
console.log("     node scripts/stealth.mjs on drop");
console.log("     node scripts/stealth.mjs token        " + C.dim + "# ← הסימן ל-Transform Rule ב-CF" + C.off);
console.log("     sudo systemctl restart lemontank");
console.log(`\n  ${C.bold}ד.${C.off} בדיקה:`);
console.log(`     curl -I https://${domain}                  ${C.dim}# 200`+"".padEnd(0) + C.off);
console.log(`     curl -I http://<IP-השרת>:3000               ${C.dim}# בלי סימן — לא אמור לענות` + C.off);
console.log("");

function printManual() {
  console.log(`${C.bold}השלבים הידניים (לסיכום):${C.off}`);
  console.log("  1. דומיין ב-Cloudflare (Active)  2. cloudflared tunnel create");
  console.log("  3. Transform Rule עם הסימן       4. systemctl restart lemontank\n");
}
