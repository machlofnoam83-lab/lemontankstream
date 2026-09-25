#!/usr/bin/env node
/**
 * שליטה במצב חמקן — מהטרמינל.
 *
 *   node scripts/stealth.mjs status                     מצב נוכחי
 *   node scripts/stealth.mjs on [drop|decoy|block]      הפעלה (ברירת מחדל drop)
 *   node scripts/stealth.mjs off                        כיבוי (מצב פיתוח)
 *   node scripts/stealth.mjs token [--rotate]           יצירת/החלפת סימן מקור סודי
 *   node scripts/stealth.mjs allow <cidr|--cloudflare>  הוספת כתובות מורשות
 *   node scripts/stealth.mjs canary [label]             יצירת מלכודת לאיתור דליפת שרת
 *   node scripts/stealth.mjs canaries                   מצב המלכודות (מי נגע)
 *   node scripts/stealth.mjs entry <url>                קישור כניסה עם סימן (לגלישה מכל מקום)
 *   node scripts/stealth.mjs set <key> <value>          שינוי הגדרה
 *   node scripts/stealth.mjs fingerprint [url]          מה האתר מסגיר החוצה (בדיקה עצמית)
 *
 * הקובץ: data/stealth.json (לא נכנס ל-Git, הרשאות 600).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  loadStealth, saveStealth, stealthStatus, makeCanary,
  CLOUDFLARE_CIDRS, OTHER_PROXY_CIDRS,
} from "../security/stealth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.APP_ROOT = ROOT;

const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[m[1]] = value;
  }
}

const C = { dim: "\x1b[2m", bold: "\x1b[1m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", off: "\x1b[0m" };
const args = process.argv.slice(2);
const command = args[0] ?? "status";
const config = loadStealth();

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

switch (command) {
  case "status": {
    const st = stealthStatus();
    const on = st.enabled === "on";
    console.log(`\n${C.bold}🥷 מצב חמקן — LemonTank Stream${C.off}\n`);
    console.log(`   מתג ראשי:            ${on ? `${C.green}פעיל${C.off}` : `${C.yellow}כבוי${C.off}`} ${on ? "" : C.dim + "(האתר מזוהה כ-Next.js)" + C.off}`);
    console.log(`   תגובה לזר:           ${st.mode} ${C.dim}(drop = התעלמות · decoy = עמוד nginx · block = 403)${C.off}`);
    console.log(`   נעילת מקור:          ${st.originLock === "on" ? "פעילה" : "כבויה"}`);
    console.log(`   סימנים סודיים:       ${st.tokens}`);
    console.log(`   טווחי CDN מהימנים:   ${st.trustedCidrs}`);
    console.log(`   כתובות מורשות נוספות: ${st.allowCidrs}`);
    console.log(`   /admin מוסתר כ-404:  ${st.adminHides404 === "on" ? "כן" : "לא"}`);
    console.log(`   כותרות מינימליות:    ${st.minimalHeaders === "on" ? "כן" : "לא"}`);
    console.log(`   חסימת אינדוקס:       ${st.noindex === "on" ? "כן" : "לא"}`);
    console.log(`   פיתיון ב-robots:     ${st.robotsBait === "on" ? "כן" : "לא"}`);
    console.log(`   מלכודות:            ${st.canaries.length}`);
    for (const c of st.canaries) {
      const hits = c.hits > 0 ? `${C.red}${c.hits} פגיעות${C.off} (אחרונה: ${c.lastHitIp ?? "—"})` : "לא נגעו";
      console.log(`      • ${c.path}  ${hits}`);
    }
    console.log(`\n   ${C.dim}הקובץ: data/stealth.json · מדריך: STEALTH.md${C.off}\n`);
    break;
  }

  case "on": {
    const mode = ["drop", "decoy", "block"].includes(args[1]) ? args[1] : config.mode;
    const tokens = config.tokens.length ? config.tokens : [crypto.randomBytes(24).toString("base64url")];
    saveStealth({ ...config, enabled: "on", mode, tokens });
    console.log(`\n${C.green}✅ מצב חמקן הופעל${C.off} — תגובה: ${C.bold}${mode}${C.off}\n`);
    console.log(`   סימן מקור: ${C.cyan}${tokens[tokens.length - 1]}${C.off}`);
    console.log(`\n${C.bold}חשוב — לפני שמפעילים באינטרנט:${C.off}`);
    console.log("   1. האתר חייב לשבת מאחורי Cloudflare (Proxy ON) או Tunnel.");
    console.log("   2. ב-Cloudflare → Rules → Transform Rules → הוספת כותרת:");
    console.log(`      ${C.cyan}x-lt-origin: ${tokens[tokens.length - 1]}${C.off}`);
    console.log("   3. ודא שכתובות הבדיקה שלך מורשות:");
    console.log(`      ${C.cyan}node scripts/stealth.mjs allow <הכתובת שלך/32>${C.off}`);
    console.log(`   4. בדיקה: ${C.cyan}node scripts/stealth.mjs entry https://your-domain.co.il${C.off}\n`);
    console.log(`   ${C.yellow}אזהרה:${C.off} בלי 1+2 השרת יעלים את עצמו מכולם — כולל ממך.`);
    console.log(`   חזרה מיידית: ${C.cyan}node scripts/stealth.mjs off${C.off}\n`);
    break;
  }

  case "off": {
    saveStealth({ ...config, enabled: "off" });
    console.log("🔓 מצב חמקן כבוי — האתר מגיש תוכן לכל מבקר (מצב פיתוח).");
    break;
  }

  case "token": {
    const rotate = args.includes("--rotate");
    const token = crypto.randomBytes(24).toString("base64url");
    const tokens = rotate ? [token] : [...config.tokens, token];
    saveStealth({ ...config, tokens });
    console.log(`\n🔑 סימן מקור ${rotate ? "הוחלף" : "נוסף"}:\n\n   ${C.cyan}${token}${C.off}\n`);
    console.log(`   הוסף ב-Cloudflare → Transform Rules → Set request header:`);
    console.log(`   ${C.bold}${config.originHeader || "x-lt-origin"}${C.off} = ${token}`);
    console.log(`   ${C.dim}(אפשר להחזיק כמה סימנים במקביל ולבטל אחד בכל פעם — בלי השבתה)${C.off}\n`);
    break;
  }

  case "allow": {
    const value = args[1];
    if (!value) {
      console.log(`שימוש: node scripts/stealth.mjs allow <cidr|ip|--cloudflare>`);
      console.log(`\nטווחים מהימנים מובנים: Cloudflare (${CLOUDFLARE_CIDRS.length}) · CDN נוספים (${OTHER_PROXY_CIDRS.length})`);
      break;
    }
    if (value === "--cloudflare") {
      saveStealth({ ...config, allowCidrs: [...new Set([...config.allowCidrs, ...CLOUDFLARE_CIDRS])] });
      console.log(`✅ נוספו ${CLOUDFLARE_CIDRS.length} טווחי Cloudflare (גיבוי לבדיקה בלי CDN)`);
      break;
    }
    const cidr = value.includes("/") ? value : `${value}/32`;
    saveStealth({ ...config, allowCidrs: [...new Set([...config.allowCidrs, cidr])] });
    console.log(`✅ ${cidr} מורשה לגשת לשרת ישירות`);
    break;
  }

  case "canary": {
    const label = args[1] ?? "host";
    const canary = makeCanary(label);
    saveStealth({ ...config, canaries: [...config.canaries, canary] });
    console.log(`\n🪤 מלכודת נוצרה:\n\n   ${C.cyan}${canary.path}${C.off}\n`);
    console.log("   הכתובת הזו לא מפנה לשום מקום ולא מופיעה באתר.");
    console.log("   כדי לבדוק דליפת IP אפשר לשתול אותה במקום שאמור להיות פרטי");
    console.log("   (למשל רשומת DNS פנימית, הערת שרת, או קובץ גיבוי) —");
    console.log("   כל פנייה אליה = השרת נחשף. הפגיעה תירשם ותחסום את התוקף לצמיתות.\n");
    break;
  }

  case "canaries": {
    const st = stealthStatus();
    if (!st.canaries.length) {
      console.log("אין מלכודות. ליצירה: node scripts/stealth.mjs canary");
      break;
    }
    console.log(`\n🪤 מלכודות (${st.canaries.length}):\n`);
    for (const c of st.canaries) {
      const hit = c.hits > 0 ? `${C.red}נפגעה ${c.hits} פעמים${C.off} · אחרונה ${c.lastHitAt} · ${c.lastHitIp}` : `${C.green}נקייה${C.off}`;
      console.log(`   ${c.path}\n      ${hit}\n`);
    }
    break;
  }

  case "entry": {
    const url = args[1] ?? process.env.APP_URL ?? "http://localhost:3000";
    const token = config.tokens[config.tokens.length - 1];
    if (!token) {
      console.log("אין סימן מקור. צור אחד: node scripts/stealth.mjs token");
      break;
    }
    let target;
    try {
      target = new URL(url);
    } catch {
      console.log("❌ כתובת לא תקינה");
      break;
    }
    const link = `${target.origin}/?lt_entry=${encodeURIComponent(token)}`;
    console.log(`\n🔗 קישור כניסה (מזהה אותך ומגדיר עוגיית מעבר):\n\n   ${C.cyan}${link}${C.off}\n`);
    console.log("   פתח אותו פעם אחת — מכאן והלאה הדפדפן שלך מורשה (עד שהעוגייה פגה).");
    console.log(`   ${C.dim}אפשר להוסיף lt_entry לחתימה במייל/וואטסאפ רק לעצמך — לא לפרסם.${C.off}\n`);
    break;
  }

  case "set": {
    const key = args[1];
    const value = args.slice(2).join(" ");
    if (!key || !value) {
      console.log(`שימוש: node scripts/stealth.mjs set <key> <value>

מפתחות: enabled(on|off) mode(drop|decoy|block) originLock(on|off) originHeader(שם כותרת)
         dropHoldMs(מספר) maxHeldDrops(מספר) adminHides404(on|off) minimalHeaders(on|off)
         noindex(on|off) robotsBait(on|off) decoyTitle(טקסט) requireForwardedBy(on|off)`);
      break;
    }
    const numeric = ["dropHoldMs", "maxHeldDrops"];
    saveStealth({ ...config, [key]: numeric.includes(key) ? num(value, config[key]) : value });
    console.log(`✅ ${key} = ${value}`);
    break;
  }

  case "fingerprint": {
    const url = args[1] ?? "http://127.0.0.1:3000";
    // סימן מותאם: אודיט פנימי חייב לעבור את נעילת המקור (אחרת לא תראה כלום)
    const auditToken = args[2] ?? process.env.STEALTH_ORIGIN_TOKEN ?? config.tokens[0] ?? "";
    console.log(`\n${C.bold}🔍 מה האתר מסגיר לרשת${C.off} — ${url}${auditToken ? C.dim + " (עם סימן לאודיט פנימי)" + C.off : ""}\n`);
    try {
      const res = await fetch(url, {
        redirect: "manual",
        headers: auditToken ? { "x-lt-origin": auditToken } : {},
        signal: AbortSignal.timeout(12_000),
      });
      const headers = [...res.headers.entries()];
      const leaks = [];
      for (const [name, value] of headers) {
        if (/^(server|x-powered-by|x-aspnet|x-runtime|x-generator|via|x-vercel|x-nextjs)/i.test(name)) {
          leaks.push(`כותרת מזהה: ${name}: ${value}`);
        }
        if (/next|react|node|express|e2b|arena|vercel/i.test(value) && !/content-type|date|etag/i.test(name)) {
          leaks.push(`ערך מזהה ב-${name}: ${value.slice(0, 90)}`);
        }
      }
      const setCookie = res.headers.getSetCookie?.() ?? [];
      for (const cookie of setCookie) {
        const name = cookie.split("=")[0];
        if (/lt_|lemontank/i.test(name)) leaks.push(`שם עוגייה מזהה: ${name}`);
      }
      const robotsTag = String(res.headers.get("x-robots-tag") ?? "").toLowerCase();
      if (!robotsTag) leaks.push("חסר X-Robots-Tag — מנועי חיפוש יאנדקסו את האתר");
      else if (robotsTag.split(/[,\s]+/).includes("index")) leaks.push("האתר מתיר אינדוקס (X-Robots-Tag: index)");
      if (!res.headers.get("x-content-type-options")) leaks.push("חסרה הגנת nosniff");

      // סריקת גוף התשובה — החלק שהסורקים באמת קוראים
      const body = (await res.text()).slice(0, 400_000);
      if (/\/_next\//.test(body)) leaks.push("הגוף מכיל נתיבי /_next/ — מזוהה כ-Next.js");
      if (/__NEXT_DATA__|next-router-state-tree|self.__next_f/i.test(body)) leaks.push("הגוף מכיל מבנה נתונים של Next.js");

      if (!leaks.length) {
        console.log(`${C.green}✅ לא נמצאו טביעות אצבע גלויות${C.off}\n`);
      } else {
        for (const leak of leaks) console.log(`   ${C.yellow}⚠${C.off}  ${leak}`);
        console.log(`\n${C.dim}תיקון: node scripts/stealth.mjs on  (מפעיל צמצום כותרות וניקוי טביעות)${C.off}\n`);
      }
      console.log(`${C.dim}כותרות שחזרו (${headers.length}): ${headers.map(([n]) => n).join(", ").slice(0, 300)}${C.off}\n`);
    } catch (err) {
      // אין תשובה = בדיוק מה שמצב חמקן אמור לעשות למי שאין לו סימן
      console.log(`${C.green}✅ אין תשובה בכלל${C.off} ${C.dim}(${err.name === "TimeoutError" ? "החיבור הושתק" : err.message})${C.off}`);
      console.log(`${C.dim}לסורק ישיר זה נראה כמו פורט סגור — זו המטרה. לאודיט פנימי: ` +
        `node scripts/stealth.mjs fingerprint ${url} <סימן> · רשימת המורשים: node scripts/stealth.mjs status${C.off}\n`);
    }
    break;
  }

  default:
    console.log("שימוש: node scripts/stealth.mjs <status|on|off|token|allow|canary|canaries|entry|set|fingerprint>");
}
