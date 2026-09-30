/**
 * שכבת הרשת של מערכת האבטחה — ניתוח כתובות IP, CIDR וזיהוי כתובות "פנימיות".
 *
 * הקובץ כתוב ב-JavaScript נקי (ללא TypeScript) כדי שייטען גם משרת ה-proxy
 * החיצוני (server.mjs) — לפני ש-Next.js בכלל נטען — וגם מסקריפטים.
 */

/* ───────────────────────────── נרמול וזיהוי IP ───────────────────────────── */

/** מנרמל כתובת IP גולמית: מסיר פורטים, סוגריים, מיפוי IPv4, zone-id ורווחים */
export function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim().toLowerCase();
  if (!ip) return null;

  // [2001:db8::1]:443  →  2001:db8::1
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    ip = end > 0 ? ip.slice(1, end) : ip.slice(1);
  }
  // הסרת zone id (fe80::1%eth0)
  const pct = ip.indexOf("%");
  if (pct > 0) ip = ip.slice(0, pct);
  // 1.2.3.4:5678 (IPv4 עם פורט) — אבל לא IPv6
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.split(":")[0];
  // ::ffff:1.2.3.4  →  1.2.3.4   (כתובת IPv4 ממופה)
  if (ip.startsWith("::ffff:")) {
    const tail = ip.slice(7);
    if (tail.includes(".")) ip = tail;
    else {
      // ::ffff:102:304 → hex
      const parts = tail.split(":");
      if (parts.length === 2) {
        const n = parts.map((p) => parseInt(p, 16));
        if (n.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff)) {
          ip = `${n[0] >> 8}.${n[0] & 255}.${n[1] >> 8}.${n[1] & 255}`;
        }
      }
    }
  }
  // הסרת נקודה בסוף (FQDN תוקפני)
  if (ip.endsWith(".")) ip = ip.slice(0, -1);

  return /^[0-9a-f:.]{2,45}$/.test(ip) ? ip : null;
}

/** ממיר IP למערך בתים (4 או 16) — או null אם אינו חוקי */
export function ipToBytes(ip) {
  const norm = normalizeIp(ip);
  if (!norm) return null;

  if (norm.includes(":")) {
    const halves = norm.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const groups = [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail];
    if (groups.length !== 8) return null;
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
      if (!/^[0-9a-f]{1,4}$/.test(groups[i])) return null;
      const v = parseInt(groups[i], 16);
      bytes[i * 2] = v >> 8;
      bytes[i * 2 + 1] = v & 255;
    }
    return bytes;
  }

  const parts = norm.split(".");
  if (parts.length !== 4) return null;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i])) return null;
    const v = Number(parts[i]);
    if (v > 255) return null;
    bytes[i] = v;
  }
  return bytes;
}

export const isIp = (value) => ipToBytes(value) !== null;

/** האם הכתובת שייכת ל-CIDR (למשל "10.0.0.0/8" או "2001:db8::/32") */
export function inCidr(ip, cidr) {
  const [net, bitsRaw] = String(cidr).split("/");
  const bytes = ipToBytes(ip);
  const netBytes = ipToBytes(net);
  if (!bytes || !netBytes || bytes.length !== netBytes.length) return false;
  const bits = bitsRaw === undefined ? bytes.length * 8 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > bytes.length * 8) return false;

  const fullBytes = bits >> 3;
  for (let i = 0; i < fullBytes; i++) if (bytes[i] !== netBytes[i]) return false;
  const restBits = bits & 7;
  if (restBits) {
    const mask = 0xff << (8 - restBits);
    if ((bytes[fullBytes] & mask) !== (netBytes[fullBytes] & mask)) return false;
  }
  return true;
}

export const inAnyCidr = (ip, list) => {
  if (!ip || !Array.isArray(list)) return false;
  return list.some((cidr) => {
    try {
      return inCidr(ip, cidr);
    } catch {
      return false;
    }
  });
};

/* ────────────────────────── טווחים "לא ניתנים לחסימה" ────────────────────── */

/** טווחים פנימיים: loopback, רשתות פרטיות, link-local, CGNAT, ULA וכו' */
export const INTERNAL_CIDRS = [
  // IPv4
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
  "172.16.0.0/12", "192.168.0.0/16", "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4",
  // IPv6
  "::1/128", "::/128", "100::/64", "fc00::/7", "fe80::/10", "ff00::/8",
];

export const isLoopback = (ip) => inAnyCidr(ip, ["127.0.0.0/8", "::1/128"]);
export const isInternal = (ip) => {
  if (!ip) return false;
  if (inAnyCidr(ip, INTERNAL_CIDRS)) return true;
  // NAT64 ‎64:ff9b::/96 — בודקים את כתובת ה-IPv4 המוטמעת
  if (inCidr(ip, "64:ff9b::/96")) {
    const bytes = ipToBytes(ip);
    if (bytes) {
      const embedded = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
      return isInternal(embedded);
    }
  }
  return false;
};

/* ───────────────────────── חילוץ IP אמיתי מהבקשה ─────────────────────────── */

const HEADER_IP = /^[0-9a-fA-F:.]{2,45}$/;

/** מפרק שרשרת X-Forwarded-For לרשימת כתובות חוקיות בלבד */
export function parseForwardedChain(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((part) => normalizeIp(part))
    .filter((ip) => ip && HEADER_IP.test(ip) && ipToBytes(ip));
}

/**
 * קובע את כתובת הלקוח האמיתית.
 *
 *  trustProxy=false  → רק כתובת ה-socket (בטוח כשהאפליקציה חשופה ישירות)
 *  trustProxy=strict → הולכים מימין לשמאל ומדלגים על proxyים מוכרים;
 *                      הכתובת הראשונה שאינה proxy מהימן היא הלקוח (מונע זיוף XFF)
 *  trustProxy=true   → לוקחים את הערך הראשון ב-XFF (מצב פלטפורמות ענן/PaaS)
 */
export function resolveClientIp({ socketIp, headers, trustProxy = "true", trustedProxyCidrs = [] } = {}) {
  const get = (name) => headers?.get?.(name) ?? null;
  const socket = normalizeIp(socketIp) ?? "0.0.0.0";
  if (trustProxy === "false") return { ip: socket, via: "socket", chain: [] };

  const chain = parseForwardedChain(get("x-forwarded-for"));
  if (!chain.length) {
    const real = normalizeIp(get("x-real-ip"));
    if (real && HEADER_IP.test(real)) return { ip: real, via: "x-real-ip", chain: [] };
    return { ip: socket, via: "socket", chain: [] };
  }

  if (trustProxy === "strict") {
    for (let i = chain.length - 1; i >= 0; i--) {
      const candidate = chain[i];
      const trusted = isInternal(candidate) || inAnyCidr(candidate, trustedProxyCidrs);
      if (!trusted) return { ip: candidate, via: "xff-strict", chain };
    }
    return { ip: chain[0], via: "xff-all-trusted", chain };
  }

  return { ip: chain[0], via: "xff-first", chain };
}

/* ───────────────────────────── פרטיות בלוגים ─────────────────────────────── */

/** מסווה IP לתצוגה (84.1.2.3 → 84.1.x.x) */
export function maskIp(ip) {
  const norm = normalizeIp(ip);
  if (!norm) return "unknown";
  if (norm.includes(":")) {
    const groups = norm.split(":");
    return `${groups.slice(0, 2).join(":")}:…`;
  }
  const parts = norm.split(".");
  return `${parts[0]}.${parts[1]}.x.x`;
}

/** האשמה חד-כיוונית עם מלח — לשיוך אירועים בלי לשמור IP גלוי */
export function hashIp(ip, secret = "") {
  const norm = normalizeIp(ip) ?? "unknown";
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  const input = `${secret}|${norm}`;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}
