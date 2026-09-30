/**
 * מעבר דרך שער החמקן מהסקריפטים התפעוליים.
 *
 * כשמצב חמקן דלוק, השרת משרת **רק** בקשות שנושאות את הסימן הסודי — בדיוק
 * כמו ש-Cloudflare מזריק אותו בשדה אמיתי. סקריפטים תפעוליים (giftcard,
 * preflight, בדיקות אבטחה) פונים ישירות ל-127.0.0.1, ובלי העזרה הזו כולם
 * היו מקבלים התעלמות — וזה נראה כמו "האתר למטה" במקום "השער עובד".
 *
 * הסקריפטים רצים על אותה מכונה שליד השרת, ולכן שני המסלולים פתוחים להם:
 * הסימן הסודי **וגם** מסלול הלולאה המקומי.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

let cache = null;

function readConfig() {
  if (cache !== null) return cache;
  cache = {};
  try {
    const file = process.env.STEALTH_FILE ?? path.join(ROOT, "data", "stealth.json");
    if (fs.existsSync(file)) {
      const config = JSON.parse(fs.readFileSync(file, "utf8"));
      if (config.enabled === "on") cache = config;
    }
  } catch { /* מצב רגיל */ }
  return cache;
}

/** כותרות שצריך להוסיף לכל בקשה כדי לעבור את השער (ריק כשהחמקן כבוי) */
export function gateHeaders() {
  const config = readConfig();
  const token = Array.isArray(config?.tokens) && config.tokens.length
    ? config.tokens[config.tokens.length - 1]
    : process.env.STEALTH_ORIGIN_TOKEN;
  if (!token) return {};
  return { [(config.originHeader || "x-lt-origin").toLowerCase()]: token };
}

/** שמות העוגיות בפועל — במצב חמקן הקידומת אקראית ולכן lt_* כבר לא נכון */
export function cookieName(kind = "csrf") {
  const config = readConfig();
  const prefix = process.env.COOKIE_PREFIX || config?.cookiePrefix || "lt";
  return `${prefix}_${kind}`;
}

/** האם מצב חמקן פעיל כרגע */
export function stealthActive() {
  return Object.keys(gateHeaders()).length > 0;
}
