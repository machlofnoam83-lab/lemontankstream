#!/usr/bin/env node
/**
 * גיבוי **מחוץ לשרת** — העלאה של קובץ הגיבוי המוצפן לאחסון אובייקטים
 * תואם-S3 (Cloudflare R2 · Backblaze B2 · AWS S3 · MinIO).
 *
 * למה זה חשוב: גיבוי שיושב על אותו דיסק כמו האתר לא מגן מפני הדבר שהכי
 * סביר לקרות — כיבוי, מחיקה בטעות, כופרה, או שרת שנשרף. הקובץ כאן מוצפן
 * לפני שהוא יוצא (AES-GCM עם BACKUP_KEY), כלומר גם אם מישהו ייגש לדלי —
 * בלי המפתח הוא לא יקרא בו כלום.
 *
 * הגדרה ב-.env.local:
 *   OFFSITE_S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
 *   OFFSITE_S3_BUCKET="lemontank-backups"
 *   OFFSITE_S3_ACCESS_KEY="…"
 *   OFFSITE_S3_SECRET_KEY="…"
 *   OFFSITE_S3_REGION="auto"          # R2: auto · B2: us-west-004 · AWS: eu-central-1
 *   OFFSITE_S3_PREFIX="lemontank"     # אופציונלי
 *   OFFSITE_KEEP="14"                 # כמה גיבויים לשמור בענן
 *
 * שימוש:
 *   node scripts/backup-offsite.mjs               # מעלה את הגיבוי האחרון
 *   node scripts/backup-offsite.mjs --file X.ltbk
 *   node scripts/backup-offsite.mjs --list
 *   node scripts/backup-offsite.mjs --prune       # מוחק גיבויים מעל המכסה
 *   node scripts/backup-offsite.mjs --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const valueOf = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const next = argv[index + 1];
  return next && !next.startsWith("--") ? next : true;
};

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
const ENDPOINT = String(env.OFFSITE_S3_ENDPOINT ?? "").replace(/\/$/, "");
const BUCKET = String(env.OFFSITE_S3_BUCKET ?? "");
const ACCESS_KEY = String(env.OFFSITE_S3_ACCESS_KEY ?? "");
const SECRET_KEY = String(env.OFFSITE_S3_SECRET_KEY ?? "");
const REGION = String(env.OFFSITE_S3_REGION ?? "auto");
const PREFIX = String(env.OFFSITE_S3_PREFIX ?? "lemontank").replace(/^\/|\/$/g, "");
const KEEP = Number(env.OFFSITE_KEEP ?? 14);
const BACKUP_DIR = path.resolve(ROOT, String(env.BACKUP_DIR ?? "backups").replace(/^\.\//, ""));

function die(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const missing = [
  ["OFFSITE_S3_ENDPOINT", ENDPOINT],
  ["OFFSITE_S3_BUCKET", BUCKET],
  ["OFFSITE_S3_ACCESS_KEY", ACCESS_KEY],
  ["OFFSITE_S3_SECRET_KEY", SECRET_KEY],
].filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  die(`חסרים פרטי אחסון ב-.env.local: ${missing.join(", ")}\n   (אפשר להתחיל מ-Cloudflare R2 — יש חבילה חינמית; ראה SECURITY.md §8.5.14)`);
}

/* ───────────────────────── SigV4 (AWS Signature Version 4) ───────────────────────── */

const sha256Hex = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

function signingKey(dateStamp) {
  let key = hmac(`AWS4${SECRET_KEY}`, dateStamp);
  key = hmac(key, REGION);
  key = hmac(key, "s3");
  return hmac(key, "aws4_request");
}

/** בונה בקשה חתומה בדיוק לפי המפרט — בלי ספריות חיצוניות, בלי סודות בלוגים */
function signedRequest(method, key, { query = {}, body = Buffer.alloc(0), contentType = "application/octet-stream" } = {}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  const canonicalUri = `/${BUCKET}${key ? `/${key.split("/").map(encodeURIComponent).join("/")}` : ""}`;
  const queryEntries = Object.entries(query).map(([k, v]) => [k, String(v)]).sort(([a], [b]) => (a < b ? -1 : 1));
  const canonicalQuery = queryEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");

  const headers = {
    host: new URL(ENDPOINT).host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (method === "PUT") headers["content-type"] = contentType;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${String(headers[name]).trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = crypto.createHmac("sha256", signingKey(dateStamp)).update(stringToSign).digest("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  if (queryEntries.length) headers["x-amz-extra-query"] = canonicalQuery; // לא נשלח — נבנה ב-URL

  const url = `${ENDPOINT}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const sentHeaders = { ...headers, "content-length": String(body.length) };
  delete sentHeaders["x-amz-extra-query"];

  return { url, headers: sentHeaders, body, payloadHash };
}

/* ─────────────────────────── פעולות ─────────────────────────── */

async function upload(fileArg) {
  let file = typeof fileArg === "string" ? path.resolve(ROOT, fileArg) : null;
  if (!file) {
    if (!fs.existsSync(BACKUP_DIR)) die(`תיקיית הגיבויים לא קיימת: ${BACKUP_DIR}`);
    const candidates = fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith(".ltbk"))
      .map((name) => ({ name, mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (!candidates.length) die(`אין קובץ .ltbk ב-${BACKUP_DIR}. הרץ קודם: node scripts/backup-encrypted.mjs`);
    file = path.join(BACKUP_DIR, candidates[0].name);
  }
  if (!fs.existsSync(file)) die(`הקובץ לא נמצא: ${file}`);

  const body = fs.readFileSync(file);
  if (!body.subarray(0, 5).toString("latin1").startsWith("LTBK1")) {
    die("הקובץ לא נראה כמו גיבוי מוצפן של LemonTank (חתימה LTBK1 חסרה) — לא מעלים קובץ לא מוצפן לענן");
  }

  const name = path.basename(file);
  const key = `${PREFIX}/${name}`;
  const request = signedRequest("PUT", key, { body, contentType: "application/octet-stream" });

  if (flag("dry-run")) {
    console.log(`🧪 (dry-run) היה מועלה: ${name} → ${ENDPOINT}/${BUCKET}/${key}`);
    console.log(`   ${(body.length / 1024 / 1024).toFixed(2)}MB · sha256 ${sha256Hex(body).slice(0, 16)}…`);
    return;
  }

  const response = await fetch(request.url, { method: "PUT", headers: request.headers, body });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    die(`ההעלאה נכשלה (${response.status}): ${text.slice(0, 300)}`);
  }
  console.log(`☁️  הועלה בהצלחה: ${key}`);
  console.log(`   ${(body.length / 1024 / 1024).toFixed(2)}MB · מוצפן לפני שיצא מהשרת · sha256 ${sha256Hex(body).slice(0, 16)}…`);
}

async function list() {
  const request = signedRequest("GET", "", { query: { "list-type": "2", prefix: `${PREFIX}/`, "max-keys": "100" } });
  const response = await fetch(request.url, { headers: request.headers });
  if (!response.ok) die(`שליפת הרשימה נכשלה (${response.status})`);
  const xml = await response.text();
  const items = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => ({
    key: match[1].match(/<Key>([^<]*)<\/Key>/)?.[1] ?? "",
    size: Number(match[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0),
    modified: match[1].match(/<LastModified>([^<]*)<\/LastModified>/)?.[1] ?? "",
  }));
  if (!items.length) {
    console.log("☁️  אין עדיין גיבויים בענן");
    return [];
  }
  console.log(`☁️  ${items.length} גיבויים בענן:`);
  for (const item of items.sort((a, b) => (a.key < b.key ? 1 : -1))) {
    console.log(`   ${item.key} · ${(item.size / 1024 / 1024).toFixed(2)}MB · ${item.modified}`);
  }
  return items;
}

async function prune() {
  const items = await list();
  if (items.length <= KEEP) {
    console.log(`✅ יש ${items.length} גיבויים (מכסה ${KEEP}) — אין מה למחוק`);
    return;
  }
  // מיון לפי מועד השינוי האמיתי (S3 LastModified) ולא לפי שם — כך גם שמות
  // שאינם נושאים תאריך לא ישבשו את המכסה. שם הקובץ הוא רק שובר שוויון.
  const toDelete = items
    .slice()
    .sort((a, b) => {
      if (a.modified !== b.modified) return a.modified < b.modified ? 1 : -1;
      return a.key < b.key ? 1 : -1;
    })
    .slice(KEEP);
  for (const item of toDelete) {
    const request = signedRequest("DELETE", item.key);
    const response = await fetch(request.url, { method: "DELETE", headers: request.headers });
    console.log(response.ok ? `🗑️  נמחק: ${item.key}` : `⚠️  מחיקה נכשלה (${response.status}): ${item.key}`);
  }
}

/* ─────────────────────────── ריצה ─────────────────────────── */

if (flag("list")) {
  await list();
} else if (flag("prune")) {
  await prune();
} else {
  await upload(valueOf("file"));
}
