#!/usr/bin/env node
/**
 * עדכון מודיעין האיומים — מוריד רשימות אמת מהאינטרנט אל data/threat-intel.json
 *
 *   node scripts/update-threat-intel.mjs                # עדכון מלא
 *   node scripts/update-threat-intel.mjs --tor-only     # רק יציאות TOR (מהיר)
 *   node scripts/update-threat-intel.mjs --dry-run      # כמה רשומות היו נכתבות
 *
 * מקורות (כולם חינמיים, בלי מפתח):
 *   • TOR     — check.torproject.org/torbulkexitlist
 *   • AWS     — ip-ranges.amazonaws.com/ip-ranges.json
 *   • Google  — www.gstatic.com/ipranges/cloud.json
 *   • Cloudflare — api.cloudflare.com/client/v4/ips
 *
 * הסקריפט שומר רשימות קיימות (blocklist ידנית ו-allowlist) ולא מוחק אותן.
 * מומלץ להריץ מדי יום מ-cron — ראו DEPLOY.md.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "threat-intel.json");
const TIMEOUT_MS = Number(process.env.INTEL_TIMEOUT_MS ?? 20_000);

const args = new Set(process.argv.slice(2));
const TOR_ONLY = args.has("--tor-only");
const DRY_RUN = args.has("--dry-run");

const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const keepBlocked = Array.isArray(existing.blocked) ? existing.blocked : [];
const keepAllow = Array.isArray(existing.allow) ? existing.allow : [];
const keepManualDatacenter = Array.isArray(existing.manualDatacenter) ? existing.manualDatacenter : [];

async function get(url, asJson = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "LemonTankStream/1.0 (threat-intel updater)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return asJson ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** ממיר רשימת כתובות בודדות ל-/32 או /128 */
function toCidr(value) {
  const item = String(value).trim();
  if (!item) return null;
  if (item.includes("/")) return item;
  return item.includes(":") ? `${item}/128` : `${item}/32`;
}

const results = { tor: [], datacenter: [] };
const errors = [];

/* ── TOR ──────────────────────────────────────────────────────────────────── */
try {
  const text = await get("https://check.torproject.org/torbulkexitlist");
  results.tor = text.split(/\r?\n/).map(toCidr).filter(Boolean);
  console.log(`🧅 TOR: ${results.tor.length} יציאות`);
} catch (err) {
  errors.push(`TOR: ${err.message}`);
  console.log(`⚠️  TOR: לא ניתן להוריד (${err.message})`);
}

/* ── ספקי ענן ─────────────────────────────────────────────────────────────── */
if (!TOR_ONLY) {
  try {
    const data = await get("https://ip-ranges.amazonaws.com/ip-ranges.json", true);
    const prefixes = [...(data.prefixes ?? []), ...(data.ipv6_prefixes ?? [])]
      .map((p) => p.ip_prefix)
      .filter(Boolean);
    results.datacenter.push(...prefixes);
    console.log(`☁️  AWS: ${prefixes.length} טווחים`);
  } catch (err) {
    errors.push(`AWS: ${err.message}`);
    console.log(`⚠️  AWS: ${err.message}`);
  }

  try {
    const data = await get("https://www.gstatic.com/ipranges/cloud.json", true);
    const prefixes = (data.prefixes ?? []).map((p) => p.ipv4Prefix ?? p.ipv6Prefix).filter(Boolean);
    results.datacenter.push(...prefixes);
    console.log(`☁️  Google Cloud: ${prefixes.length} טווחים`);
  } catch (err) {
    errors.push(`GCP: ${err.message}`);
    console.log(`⚠️  GCP: ${err.message}`);
  }

  try {
    const data = await get("https://api.cloudflare.com/client/v4/ips", true);
    const prefixes = [...(data.result?.ipv4_cidrs ?? []), ...(data.result?.ipv6_cidrs ?? [])];
    results.datacenter.push(...prefixes);
    console.log(`☁️  Cloudflare: ${prefixes.length} טווחים`);
  } catch (err) {
    errors.push(`Cloudflare: ${err.message}`);
    console.log(`⚠️  Cloudflare: ${err.message}`);
  }
}

/* ── כתיבה ────────────────────────────────────────────────────────────────── */
const dedupe = (list) => [...new Set(list.filter((x) => typeof x === "string" && x.includes("/")))];

const payload = {
  updatedAt: new Date().toISOString(),
  source: "lemon-tank-updater",
  tor: dedupe(results.tor),
  datacenter: dedupe(results.datacenter),
  blocked: dedupe(keepBlocked),
  allow: dedupe(keepAllow),
  manualDatacenter: dedupe(keepManualDatacenter),
  errors,
};

console.log("");
console.log(`📊 סיכום: ${payload.tor.length} טווחי TOR · ${payload.datacenter.length} טווחי ענן · ${payload.blocked.length} ברשימת חסימה`);

if (DRY_RUN) {
  console.log("ℹ️  הרצת בדיקה — לא נכתב קובץ.");
  process.exit(errors.length && !payload.tor.length ? 1 : 0);
}

if (!payload.tor.length && !payload.datacenter.length) {
  console.log("❌ לא התקבלו רשימות חדשות — הקובץ הקיים לא שונה (האתר ממשיך לעבוד עם הרשימות המובנות).");
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`✅ נשמר: ${path.relative(ROOT, OUT)}`);
console.log("   הטעינה אוטומטית — המנוע קורא את הקובץ בכל בקשה (עם מטמון קצר).");
