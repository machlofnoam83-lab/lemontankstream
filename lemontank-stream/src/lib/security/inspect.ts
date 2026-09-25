/**
 * סריקת עומס זדוני בשכבת ה-API — שכבת הגנה שנייה מעבר לשער (server.mjs).
 *
 * השער בודק כתובת, כותרות ומתודה. כאן בודקים את **גוף הבקשה** (JSON) ואת
 * הפרמטרים — בדיוק במקום שבו תוקף מנסה להזריק SQL או סקריפט לטופס.
 *
 * כללים שמרניים בכוונה: רק דפוסים בעלי ודאות גבוהה, כדי לא לחסום משתמש
 * שהקליד טקסט תמים עם גרש או סוגריים.
 */

export type InspectionHit = {
  category: string;
  rule: string;
  severity: "warning" | "critical";
  ban: boolean;
  sample: string;
};

const RULES: { rule: string; category: string; severity: "warning" | "critical"; ban: boolean; re: RegExp }[] = [
  { rule: "sqli_union", category: "sqli", severity: "critical", ban: true, re: /\bunion\b[\s/*]+(\ball\b[\s/*]+)?\bselect\b/i },
  { rule: "sqli_tautology", category: "sqli", severity: "critical", ban: true, re: /('|")\s*(or|and)\s*('|")?\s*\d+\s*=\s*\d+|or\s+1\s*=\s*1\b/i },
  { rule: "sqli_stacked", category: "sqli", severity: "critical", ban: true, re: /;\s*(drop|alter|truncate|delete|update|insert|grant)\s+/i },
  { rule: "sqli_time", category: "sqli", severity: "critical", ban: true, re: /\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(/i },
  { rule: "sqli_meta", category: "sqli", severity: "critical", ban: true, re: /\b(information_schema|sqlite_master|pg_catalog|sysobjects|xp_cmdshell|load_file|into\s+outfile)\b/i },
  { rule: "xss_tag", category: "xss", severity: "critical", ban: true, re: /<\s*(script|iframe|svg|img|object|embed|body|meta|link)\b/i },
  { rule: "xss_handler", category: "xss", severity: "critical", ban: true, re: /\bon(error|load|click|mouseover|focus|submit)\s*=/i },
  { rule: "xss_protocol", category: "xss", severity: "critical", ban: true, re: /\b(javascript|vbscript|data\s*:\s*text\/html)\s*:/i },
  { rule: "traversal", category: "traversal", severity: "critical", ban: true, re: /(\.\.(\/|\\|%2f|%5c)|%2e%2e%2f|\/etc\/(passwd|shadow)|\/proc\/self\/)/i },
  { rule: "rce", category: "rce", severity: "critical", ban: true, re: /(\$\([\s\S]{1,60}\)|`[\s\S]{1,60}`|\$\{\s*jndi\s*:|\|\s*(whoami|id|cat\s+\/))/i },
  { rule: "xxe", category: "xxe", severity: "critical", ban: true, re: /<!DOCTYPE[^>]{0,120}(SYSTEM|PUBLIC)|<!ENTITY\s+%?\s*\w+\s+(SYSTEM|PUBLIC)/i },
  { rule: "prototype_pollution", category: "rce", severity: "critical", ban: true, re: /(__proto__|prototype\s*\]|constructor\s*\[)/i },
  { rule: "nosqli", category: "nosqli", severity: "warning", ban: true, re: /\$where\b|\$ne\b\s*[:=]|\{\s*"\$[a-z]+"\s*:/i },
  { rule: "null_byte", category: "malformed", severity: "warning", ban: true, re: /%00|\u0000/ },
  { rule: "scanner_path", category: "probe", severity: "warning", ban: true, re: /\/\.(env|git|aws|ssh)\b|\/(wp-login|phpmyadmin|xmlrpc)\.php/i },
  { rule: "crlf", category: "crlf", severity: "warning", ban: false, re: /%0d%0a/i },
  { rule: "ssti", category: "ssti", severity: "warning", ban: false, re: /\{\{\s*\d+\s*[*+]\s*\d+\s*\}\}/ },
];

const MAX_DEPTH = 6;
const MAX_STRINGS = 200;

/** סורק מחרוזת בודדת */
export function inspectString(value: string): InspectionHit | null {
  if (!value || value.length < 4) return null;
  const target = value.length > 4096 ? value.slice(0, 4096) : value;
  let decoded = target;
  try {
    decoded = decodeURIComponent(target.replace(/\+/g, " "));
  } catch {
    /* מחרוזת לא מקודדת — בודקים כפי שהיא */
  }
  for (const rule of RULES) {
    if (rule.re.test(target) || (decoded !== target && rule.re.test(decoded))) {
      return { category: rule.category, rule: rule.rule, severity: rule.severity, ban: rule.ban, sample: target.slice(0, 200) };
    }
  }
  return null;
}

/** סורק כל מחרוזת בתוך אובייקט (גוף JSON) עד עומק מוגבל */
export function inspectValue(value: unknown, depth = 0, counter = { n: 0 }): InspectionHit | null {
  if (depth > MAX_DEPTH || counter.n > MAX_STRINGS) return null;
  if (typeof value === "string") {
    counter.n++;
    return inspectString(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = inspectValue(item, depth + 1, counter);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      counter.n++;
      const keyHit = inspectString(key);
      if (keyHit) return keyHit;
      const hit = inspectValue(item, depth + 1, counter);
      if (hit) return hit;
    }
  }
  return null;
}

/** סורק כתובת ופרמטרים */
export function inspectUrl(url: string): InspectionHit | null {
  const { pathname, search } = new URL(url);
  return inspectString(pathname) ?? inspectString(search);
}
