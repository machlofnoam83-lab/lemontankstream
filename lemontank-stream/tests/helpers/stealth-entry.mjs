#!/usr/bin/env node
/**
 * מעבר דרך שער החמקן בבדיקות.
 *
 * כשמצב חמקן דלוק, השרת משרת **רק** בקשות שנושאות את הסימן הסודי — בדיוק
 * כמו ש-Cloudflare מזריק אותו בשדה אמיתי. חבילות הבדיקות פונות ישירות
 * ל-127.0.0.1 (אין להן CDN), ולכן בלי העזרה הזו כולן היו מקבלות התעלמות
 * ונראות כ"כשל" למרות שהאתר תקין לחלוטין.
 *
 * הקובץ קורא את הסימן מ-data/stealth.json אם הוא קיים. במצב חמקן כבוי
 * הוא מחזיר אובייקט ריק — כלומר אפס השפעה על ההרצה הרגילה.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let cached = null;

export function stealthHeaders() {
  if (cached) return cached;
  cached = {};
  try {
    const file = process.env.STEALTH_FILE ?? path.join(ROOT, "data", "stealth.json");
    if (!fs.existsSync(file)) return cached;
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    if (config.enabled !== "on") return cached;
    const token = Array.isArray(config.tokens) && config.tokens.length
      ? config.tokens[config.tokens.length - 1]
      : process.env.STEALTH_ORIGIN_TOKEN;
    if (!token) return cached;
    cached[[(config.originHeader || "x-lt-origin").toLowerCase()]] = token;
    return cached;
  } catch {
    return cached;
  }
}

/**
 * שמות העוגיות בפועל. במצב חמקן השרת מייצר קידומת אקראית (במקום lt_) כדי
 * שסורק לא יזהה את המערכת לפי שם עוגייה — ולכן גם הבדיקות חייבות לשאול
 * את השם האמיתי ולא להניח ‎lt_csrf.
 */
function resolvePrefix() {
  if (process.env.COOKIE_PREFIX) return process.env.COOKIE_PREFIX;
  try {
    const file = process.env.STEALTH_FILE ?? path.join(ROOT, "data", "stealth.json");
    if (fs.existsSync(file)) {
      const config = JSON.parse(fs.readFileSync(file, "utf8"));
      if (config.enabled === "on" && config.cookiePrefix) return config.cookiePrefix;
    }
  } catch { /* ברירת מחדל */ }
  return "lt";
}

export const COOKIE_PREFIX = resolvePrefix();
export const CSRF_COOKIE = `${COOKIE_PREFIX}_csrf`;
export const SESSION_COOKIE = `${COOKIE_PREFIX}_session`;

/** האם מצב חמקן פעיל כרגע — בדיקות שמצפות להתנהגות "רגילה" מתחשבות בזה */
export const STEALTH_ON = Object.keys(stealthHeaders()).length > 0;
