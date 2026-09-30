#!/usr/bin/env node
/**
 * כלי שליטה במערכת האבטחה — מהטרמינל, בלי להיכנס לפאנל.
 *
 *   node scripts/security.mjs status              מצב המערכת, חסימות ומדיניות
 *   node scripts/security.mjs bans                חסימות פעילות
 *   node scripts/security.mjs ban <ip> [שעות]     חסימה ידנית (ברירת מחדל 24 שעות)
 *   node scripts/security.mjs unban <ip>          שחרור כתובת
 *   node scripts/security.mjs unban --all         שחרור כל החסימות (מנעול חירום)
 *   node scripts/security.mjs mode monitor|enforce
 *   node scripts/security.mjs set <key> <value>   שינוי מדיניות (למשל proxy_policy block-all)
 *   node scripts/security.mjs purge [ימים]        ניקוי חסימות ישנות
 *   node scripts/security.mjs verify              בדיקה עצמית של המנוע (בלי לפגוע בנתונים)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "../security/engine.mjs";
import { banTtlSeconds, DEFAULT_SETTINGS } from "../security/store.mjs";
import { intelStatus } from "../security/intel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.APP_ROOT = ROOT;

/* טעינת .env.local כדי לעבוד על אותו מסד נתונים של האתר */
const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const command = args[0] ?? "status";
const dbFile = process.env.DATABASE_FILE ?? path.join(ROOT, "data", "lemontank.db");

if (command === "verify") {
  const { runSelfTest } = await import("../security/self-test.mjs");
  const results = runSelfTest();
  let failed = 0;
  for (const row of results) {
    console.log(`${row.pass ? "✅" : "❌"} ${row.name.padEnd(34)} ${row.detail}`);
    if (!row.pass) failed++;
  }
  console.log(failed === 0 ? "\n✅ כל הבדיקות עברו" : `\n❌ ${failed} בדיקות נכשלו`);
  process.exit(failed === 0 ? 0 : 1);
}

const engine = createEngine({ dbFile, appRoot: ROOT, quiet: true });
const settings = engine.settings();
const C = { dim: "\x1b[2m", bold: "\x1b[1m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", off: "\x1b[0m" };

switch (command) {
  case "status": {
    const stats = engine.stats();
    const intel = intelStatus();
    const mode = settings.mode === "enforce" ? `${C.green}ENFORCE (חסימה פעילה)${C.off}` : `${C.yellow}MONITOR (לוג בלבד)${C.off}`;
    console.log(`\n${C.bold}🛡️  מערכת האבטחה — LemonTank Stream${C.off}`);
    console.log(`${C.dim}   מסד נתונים: ${dbFile}${C.off}\n`);
    console.log(`   מצב:                ${mode}`);
    console.log(`   חסימת IP אוטומטית:  ${settings.autoban === "on" ? "פעילה" : "כבויה"}`);
    console.log(`   מלכודות:            ${settings.honeypot_paths === "on" ? `פעילות (${settings.honeypot})` : "כבויות"}`);
    console.log(`   כלי יירוט (Burp):   ${settings.tool_block}`);
    console.log(`   מדיניות פרוקסי:     ${settings.proxy_policy}`);
    console.log(`   תקרת בקשות/דקה:    ${settings.rate_per_minute}`);
    console.log("");
    console.log(`   ${C.bold}חסימות:${C.off} ${C.red}${stats.bans.active}${C.off} פעילות · ${stats.bans.total} סה"כ · ${stats.bans.last24h} חדשות ביממה`);
    for (const row of stats.bans.byCategory) {
      console.log(`      • ${String(row.category).padEnd(12)} ${row.c}`);
    }
    console.log("");
    console.log(`   ${C.bold}מודיעין איומים:${C.off} ${intel.torCount} טווחי TOR · ${intel.datacenterCount} טווחי ענן · ${intel.blockedCount} ברשימת חסימה`);
    console.log(`   ${C.dim}עדכון אחרון: ${intel.updatedAt ?? "רשימות מובנות בלבד"} (node scripts/update-threat-intel.mjs)${C.off}`);

    const offenders = stats.topOffenders;
    if (offenders.length) {
      console.log(`\n   ${C.bold}תוקפנים ביממה האחרונה:${C.off}`);
      for (const o of offenders) {
        const flag = o.banned ? `${C.red}[חסום]${C.off}` : "";
        console.log(`      ${String(o.ip).padEnd(18)} ${String(o.hits).padStart(4)} אירועים ${flag}`);
      }
    }
    console.log("");
    break;
  }

  case "bans": {
    const all = args.includes("--all");
    const rows = all ? engine.banHistory(100) : engine.bannedList(100);
    if (!rows.length) {
      console.log("אין חסימות פעילות ✅");
      break;
    }
    console.log(`${C.bold}${all ? "היסטוריית חסימות" : "חסימות פעילות"} (${rows.length}):${C.off}\n`);
    for (const b of rows) {
      const until = b.permanent ? "קבוע" : b.expires_at ? `עד ${b.expires_at}` : "—";
      console.log(`  ${C.red}${String(b.ip).padEnd(17)}${C.off} ${String(b.category).padEnd(10)} ×${b.strikes}  ${until}`);
      console.log(`  ${C.dim}${String(b.reason).slice(0, 100)}${C.off}`);
      if (b.path) console.log(`  ${C.dim}${b.method ?? ""} ${b.path}${C.off}`);
      console.log("");
    }
    break;
  }

  case "ban": {
    const ip = args[1];
    const hours = Number(args[2] ?? 24) || 24;
    if (!ip) {
      console.error("שימוש: node scripts/security.mjs ban <ip> [שעות]");
      process.exit(1);
    }
    const row = engine.ban({ ip, category: "manual", reason: "חסימה ידנית מהטרמינל", severity: "critical", auto: false, ttlSec: hours * 3600 });
    console.log(row ? `⛔ ${ip} נחסמה ל-${hours} שעות` : "❌ החסימה נכשלה");
    break;
  }

  case "unban": {
    if (args.includes("--all")) {
      const n = engine.unbanAll("cli");
      console.log(`🔓 שוחררו ${n} חסימות`);
      break;
    }
    const ip = args[1];
    if (!ip) {
      console.error("שימוש: node scripts/security.mjs unban <ip|--all>");
      process.exit(1);
    }
    const n = engine.unban(ip, "cli");
    console.log(n ? `🔓 ${ip} שוחררה` : "ℹ️ לא נמצאה חסימה פעילה לכתובת הזו");
    break;
  }

  case "mode": {
    const value = args[1];
    if (!["monitor", "enforce"].includes(value)) {
      console.error("שימוש: node scripts/security.mjs mode monitor|enforce");
      process.exit(1);
    }
    engine.setSetting("mode", value);
    console.log(value === "enforce" ? "🛡️  מצב אכיפה הופעל" : "📝 מצב ניטור — אירועים נרשמים אבל לא נחסמים");
    break;
  }

  case "set": {
    const [, key, ...rest] = args;
    const value = rest.join(" ");
    if (!key || !value) {
      console.error(`שימוש: node scripts/security.mjs set <key> <value>\nמפתחות אפשריים:\n${Object.keys(DEFAULT_SETTINGS).map((k) => `  • ${k}`).join("\n")}`);
      process.exit(1);
    }
    if (!(key in DEFAULT_SETTINGS)) {
      console.error(`❌ מפתח לא מוכר: ${key}`);
      process.exit(1);
    }
    engine.setSetting(key, value);
    console.log(`✅ ${key} = ${value}`);
    break;
  }

  case "purge": {
    const days = Number(args[1] ?? 90) || 90;
    const result = engine.prune(days);
    console.log(`🧹 נוקו: ${result.bans} חסימות ישנות, ${result.events} אירועים מעל ${days} ימים, ${result.counters} מונים פגי תוקף`);
    break;
  }

  case "ttl": {
    for (const [category, base] of Object.entries({ honeypot: "honeypot", sqli: "sqli", probe: "probe", tool: "tool", flood: "flood" })) {
      console.log(`${category.padEnd(10)} סטרייק 1: ${banTtlSeconds(base, 1)}s · 2: ${banTtlSeconds(base, 2)}s · 5: ${banTtlSeconds(base, 5)}s`);
    }
    break;
  }

  default:
    console.log(`שימוש: node scripts/security.mjs <status|bans|ban|unban|mode|set|purge|verify|ttl>`);
}

engine.close();
