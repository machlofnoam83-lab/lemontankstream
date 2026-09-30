/**
 * שער פנימי — האם הבקשה עברה דרך שרת האבטחה (server.mjs)?
 *
 * שרת האבטחה חותם כל בקשה ב-HMAC ומעביר את כתובת הלקוח האמיתית ב-x-lt-ip.
 * כאן מאמתים את החתימה, כדי שאף אחד לא יוכל לזייף כותרות פנימיות
 * גם אם Next.js נחשף ישירות (למשל בטעות, בלי שכבת השער).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const IP_HEADER = "x-lt-ip";
const SIG_HEADER = "x-lt-sig";
const TS_HEADER = "x-lt-ts";
const FP_HEADER = "x-lt-fp";
const MAX_SKEW_MS = 120_000;

const secret = () => process.env.APP_SECRET ?? "dev-secret-not-for-production";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export type GatewayInfo = {
  /** כתובת הלקוח שקבע השער (אם החתימה תקפה) */
  ip: string | null;
  /** טביעת אצבע של הלקוח (אם קיימת) */
  fingerprint: string | null;
  /** האם הבקשה עברה דרך השער ואומתה בחתימה */
  verified: boolean;
};

/** מאמת את חתימת השער ומחזיר את זהות הלקוח שנקבעה בו */
export function gatewayInfo(req: Request): GatewayInfo {
  const ip = req.headers.get(IP_HEADER);
  const sig = req.headers.get(SIG_HEADER);
  const ts = req.headers.get(TS_HEADER);
  const fp = req.headers.get(FP_HEADER);
  if (!ip || !sig || !ts || !fp) return { ip: null, fingerprint: null, verified: false };

  const issued = parseInt(ts, 36);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > MAX_SKEW_MS) {
    return { ip: null, fingerprint: null, verified: false };
  }

  const expected = createHmac("sha256", secret()).update(`${ip}|${ts}|${fp}`).digest("hex").slice(0, 32);
  const ok = safeEqual(expected, sig);
  return { ip: ok ? ip : null, fingerprint: ok ? fp : null, verified: ok };
}

/**
 * האם לחייב מעבר דרך השער (REQUIRE_GATEWAY=1).
 * ברירת מחדל כבויה כדי ש-`next dev` יעבוד; בפרודקשן מאחורי server.mjs מומלץ להפעיל.
 */
export const requireGateway = (): boolean => process.env.REQUIRE_GATEWAY === "1";
