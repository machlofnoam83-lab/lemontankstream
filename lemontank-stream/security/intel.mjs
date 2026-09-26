/**
 * מודיעין איומים (Threat Intelligence) מקומי:
 *  • זיהוי כתובות של ספקי ענן/אירוח (datacenter) — סימן מובהק לשרתים סורקים,
 *    פרוקסי מסחרי או VPN שעובדים ממרכז נתונים.
 *  • רשימת יציאות TOR — נטענת אוטומטית לסקריפט כשיש אינטרנט.
 *  • רשימת חסימה ידנית (blocklist) של המדריך/האדמין.
 *  • זיהוי סורקים מוכרים לפי User-Agent.
 *
 * הקובץ scripts/update-threat-intel.mjs מוריד בזמן אמת את רשימת יציאות ה-TOR
 * ואת טווחי הענן ושומר ל-data/threat-intel.json. בלעדיו עובדים עם הרשימות
 * המובנות כאן — אין תלות באינטרנט כדי שהאתר יעבוד.
 */

import fs from "node:fs";
import path from "node:path";
import { inAnyCidr, isInternal, normalizeIp } from "./net.mjs";

/* ─────────────── רשימות מובנות: ענן/אירוח (לצורכי ניקוד/חסימה) ───────────── */
const BUILTIN_DATACENTER = [
  "3.0.0.0/8", "13.32.0.0/15", "13.224.0.0/14", "15.177.0.0/18", "18.0.0.0/8", "34.192.0.0/10",
  "35.176.0.0/13", "44.192.0.0/10", "50.16.0.0/14", "52.0.0.0/8", "54.0.0.0/8", "63.32.0.0/14",
  "99.77.0.0/16", "99.78.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "108.138.0.0/15",
  "130.176.0.0/16", "143.204.0.0/16", "151.101.0.0/16", "185.199.108.0/22", "199.232.0.0/16",
  "20.0.0.0/8", "40.64.0.0/10", "51.104.0.0/13", "52.96.0.0/12", "104.40.0.0/13",
  "8.8.4.0/24", "8.8.8.0/24", "4.2.2.0/24", "1.1.1.0/24", "9.9.9.9/32", "208.67.222.0/24",
  "64.233.160.0/19", "66.102.0.0/20", "72.14.192.0/18", "142.250.0.0/15", "172.217.0.0/16",
  "209.85.128.0/17", "216.58.192.0/19", "34.64.0.0/10", "35.184.0.0/13", "35.208.0.0/12",
  "146.148.0.0/17", "162.222.176.0/21", "173.255.112.0/20", "199.192.112.0/22",
  "5.9.0.0/16", "88.99.0.0/16", "116.203.0.0/16", "128.140.0.0/17", "135.181.0.0/16",
  "138.201.0.0/16", "142.132.0.0/16", "144.76.0.0/16", "148.251.0.0/16", "159.69.0.0/16",
  "167.235.0.0/16", "168.119.0.0/16", "176.9.0.0/16", "178.63.0.0/16", "188.40.0.0/16",
  "195.201.0.0/16", "213.239.192.0/18", "49.12.0.0/16", "65.108.0.0/16", "95.216.0.0/16",
  "135.148.0.0/16", "141.94.0.0/16", "144.217.0.0/16", "147.135.0.0/16", "149.56.0.0/16",
  "151.80.0.0/16", "158.69.0.0/16", "167.114.0.0/16", "192.95.0.0/16", "198.27.64.0/18",
  "45.33.0.0/17", "45.56.0.0/14", "50.116.0.0/18", "66.175.208.0/20", "72.14.176.0/20",
  "96.126.96.0/19", "139.144.0.0/16", "143.42.0.0/16", "172.104.0.0/15", "173.230.128.0/19",
  "192.155.80.0/20", "198.58.96.0/19", "23.20.0.0/14", "63.32.0.0/14",
  "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "104.16.0.0/12", "108.162.192.0/18",
  "131.0.72.0/22", "141.101.64.0/18", "162.158.0.0/15", "172.64.0.0/13", "173.245.48.0/20",
  "188.114.96.0/20", "190.93.240.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "5.61.0.0/16", "77.88.0.0/18", "87.250.224.0/19", "93.158.128.0/18", "95.108.128.0/17",
  "100.43.64.0/18", "178.154.128.0/17", "213.180.192.0/19", "37.9.64.0/18",
  "40.77.0.0/16", "65.52.0.0/14", "65.55.0.0/16", "131.253.0.0/16", "157.55.0.0/16",
  "204.79.197.0/24", "207.46.0.0/16", "13.64.0.0/11", "20.0.0.0/11",
  // IPv6 מובחר
  "2600:1f00::/24", "2600:9000::/28", "2a03:2880::/32", "2a00:1450::/32", "2400:cb00::/32",
  "2606:4700::/32", "2803:f800::/32", "2a02:26f0::/32", "2a04:4e40::/32",
];

/** טווחי סורקים/מנועי חיפוש לגיטימיים — כדי לא לחסום אותם בטעות (אבל גם לא לשרת להם תוכן פרימיום) */
const BUILTIN_CRAWLER = [
  "66.249.64.0/19", "34.100.182.0/23", "35.247.243.0/24", "72.14.199.0/24", "209.85.238.0/24",
  "40.77.167.0/24", "52.167.144.0/24", "13.66.139.0/24", "157.55.39.0/24", "207.46.13.0/24",
  "5.255.253.0/24", "77.88.55.0/24", "87.250.231.0/24", "100.43.65.0/24", "178.154.131.0/24",
  "17.0.0.0/8", "17.58.0.0/16", "2620:119:35::/48",
];

/** חתימות User-Agent של סורקי פגיעויות וכלי פריצה — חוסמים תמיד */
const SCANNER_UA = [
  /sqlmap/i, /nikto/i, /nmap\s*scripting/i, /masscan/i, /zgrab/i, /nuclei/i, /wpscan/i,
  /dirbuster/i, /gobuster/i, /dirb\b/i, /wfuzz/i, /ffuf/i, /feroxbuster/i, /xray/i,
  /acunetix/i, /nessus/i, /openvas/i, /qualys/i, /netsparker/i, /burpsuite/i, /burp\s*collaborator/i,
  /hydra/i, /medusa\s+scanner/i, /jaeles/i, /arachni/i, /skipfish/i, /commix/i, /w3af/i,
  /havij/i, /sqliv/i, /paradox\s*scanner/i, /immunity/i, /shodan/i, /censys/i, /internetmeasurement/i,
  /nuclei-templates/i, /vulnerability[-_ ]?scanner/i, /penetration[-_ ]?test/i,
];

/* ─────────────────────────────── טעינת הקובץ ─────────────────────────────── */

const EMPTY = { tor: [], datacenter: [], blocked: [], allow: [], updatedAt: null, source: "builtin" };

let cache = { ...EMPTY, file: null, mtimeMs: 0 };

function dataFile(explicit) {
  if (explicit) return explicit;
  const root = process.env.APP_ROOT || process.cwd();
  return path.join(root, "data", "threat-intel.json");
}

/**
 * טוען (ומטמן מחדש לפי חתימת זמן) את רשימות האיומים.
 * לעולם לא זורק — אם הקובץ פגום, חוזרים לרשימות המובנות.
 */
export function loadIntel(file) {
  const target = dataFile(file);
  try {
    if (!fs.existsSync(target)) return { ...cache, builtinDatacenter: BUILTIN_DATACENTER, builtinCrawler: BUILTIN_CRAWLER };
    const stat = fs.statSync(target);
    if (cache.file === target && cache.mtimeMs === stat.mtimeMs) return cache;

    const raw = JSON.parse(fs.readFileSync(target, "utf8"));
    const list = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.includes("/")) : []);

    cache = {
      ...EMPTY,
      tor: list(raw.tor),
      datacenter: list(raw.datacenter),
      blocked: list(raw.blocked),
      allow: list(raw.allow),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
      source: typeof raw.source === "string" ? raw.source : "file",
      file: target,
      mtimeMs: stat.mtimeMs,
    };
    return { ...cache, builtinDatacenter: BUILTIN_DATACENTER, builtinCrawler: BUILTIN_CRAWLER };
  } catch {
    return { ...cache, builtinDatacenter: BUILTIN_DATACENTER, builtinCrawler: BUILTIN_CRAWLER };
  }
}

/** האם ה-UA של סורק פגיעויות מוכר */
export function isScannerAgent(userAgent) {
  if (!userAgent) return false;
  return SCANNER_UA.some((re) => re.test(userAgent));
}

/** האם UA ריק/חריג לחלוטין (בוטים גנריים מנסים להסתתר) */
export function isMissingAgent(userAgent) {
  if (!userAgent) return true;
  const ua = userAgent.trim();
  if (ua.length < 8) return true;
  return /^(curl|wget|python-requests|python-urllib|go-http-client|java|libwww|httpclient|okhttp|axios|node-fetch|undici|fasthttp|postmanruntime|insomnia|httpie)\b/i.test(ua);
}

/**
 * סיווג כתובת: פנימית / TOR / מרכז נתונים / סורק מוכר / חסומה ידנית.
 * משתמש גם ברשימה המובנית וגם בקובץ המעודכן.
 */
export function classifyIp(ip, file) {
  const norm = normalizeIp(ip);
  if (!norm) return { ip: null, internal: false, tor: false, datacenter: false, crawler: false, blocked: false };

  const intel = loadIntel(file);
  const datacenterList = [...BUILTIN_DATACENTER, ...intel.datacenter];
  const internal = isInternal(norm);

  return {
    ip: norm,
    internal,
    tor: !internal && inAnyCidr(norm, intel.tor),
    datacenter: !internal && inAnyCidr(norm, datacenterList),
    crawler: !internal && inAnyCidr(norm, [...BUILTIN_CRAWLER, ...intel.allow]),
    blocked: !internal && inAnyCidr(norm, intel.blocked),
    intelUpdatedAt: intel.updatedAt,
    intelSource: intel.source,
  };
}

/** תקציר מצב המודיעין (לפאנל האדמין) */
export function intelStatus(file) {
  const intel = loadIntel(file);
  return {
    updatedAt: intel.updatedAt,
    source: intel.source,
    torCount: intel.tor.length,
    datacenterCount: intel.datacenter.length,
    blockedCount: intel.blocked.length,
    builtinDatacenter: BUILTIN_DATACENTER.length,
    builtinCrawler: BUILTIN_CRAWLER.length,
    scannerSignatures: SCANNER_UA.length,
  };
}
