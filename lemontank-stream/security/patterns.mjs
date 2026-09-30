/**
 * חתימות התקיפה של המערכת — "המוח" שמזהה ניסיונות פריצה.
 *
 * כל כלל מחזיר:
 *   category — סוג התקיפה (נשמר בלוג וקובע את זמן החסימה)
 *   severity — info | warning | critical
 *   score    — ניקוד מצטבר לפני חסימה (מאפשר חסימה של דפוסים חוזרים בלבד)
 *   action   — none (רק ניקוד) | block (חסימת בקשה) | ban (חסימת בקשה + IP)
 */

/* ───────────────────────── נתיבי מלכודת (Honeypot) ───────────────────────── */
/**
 * נתיבים שאין בהם שום תוכן אמיתי — כל פנייה אליהם היא סריקה אוטומטית.
 * חשיפה שלהם = ריח של CMS/פאנל ניהול — בדיוק מה שסורקים מחפשים.
 */
export const HONEYPOT_PATHS = [
  /^\/wp-(login|admin|content|includes|json|config)/i,
  /^\/xmlrpc\.php/i,
  /^\/phpmyadmin/i,
  /^\/pma\b/i,
  /^\/myadmin/i,
  /^\/\.env/i,
  /^\/\.git(\/|$)/i,
  /^\/\.svn(\/|$)/i,
  /^\/\.hg(\/|$)/i,
  /^\/\.DS_Store$/i,
  /^\/\.aws\//i,
  /^\/\.ssh\//i,
  /^\/\.vscode\//i,
  /^\/\.docker/i,
  /^\/\.dockerenv$/i,
  /^\/\.well-known\/(acme-challenge\/\.\.|security\.txt\.bak)/i,
  /^\/config\.(php|json|yml|yaml)\.(bak|old|save|swp|orig|txt)/i,
  /^\/wp-config\.php/i,
  /^\/server-status/i,
  /^\/server-info/i,
  /^\/balancer-manager/i,
  /^\/actuator(\/|$)/i,
  /^\/_ignition\//i,
  /^\/_profiler\//i,
  /^\/telescope\//i,
  /^\/debug\/default/i,
  /^\/console(\/|$)/i,
  /^\/HNAP1\//i,
  /^\/cgi-bin\/.*(sh|pl|cgi)$/i,
  /^\/owa\/auth\//i,
  /^\/autodiscover\//i,
  /^\/shell(\.php|\.jsp|\.asp)?$/i,
  /^\/cmd(\.php|\.jsp|\.exe)?$/i,
  /^\/admin\.php$/i,
  /^\/administrator(\/|$)/i,
  /^\/manager\/html(\/|$)/i,
  /^\/solr\//i,
  /^\/jenkins(\/|$)/i,
  /^\/grafana(\/|$)/i,
  /^\/kibana(\/|$)/i,
  /^\/elasticsearch(\/|$)/i,
  /^\/vendor\/phpunit\//i,
  /^\/vendor\/\.git\//i,
  /^\/telescope\/requests/i,
  /^\/storage\/logs\//i,
  /^\/backup(s)?(\/|\.|$)/i,
  /^\/db\.(sql|sqlite|bak)$/i,
  /^\/dump\.sql$/i,
  /^\/database\.sql$/i,
  /^\/api\/v1\/(keys|config|users\/admin)/i,
  /^\/graphql\/?$/i,
  /^\/%2e%2e(\/|$)/i,
];

/* ─────────────────────── חתימות זיהוי דפוסי תקיפה ────────────────────────── */

const RULES = [
  /* ── SQL Injection ─────────────────────────────────────────────────────── */
  {
    name: "sqli_union",
    category: "sqli",
    severity: "critical",
    score: 100,
    action: "ban",
    re: /\bunion\b[\s/*]+(\b(all|distinct)\b[\s/*]+)?\bselect\b/i,
  },
  {
    name: "sqli_boolean",
    category: "sqli",
    severity: "critical",
    score: 100,
    action: "ban",
    re: /('|\"|%27|%22)\s*(or|and)\s*('|\"|%27|%22)?\s*\d+\s*=\s*\d+/i,
  },
  {
    name: "sqli_tautology",
    category: "sqli",
    severity: "critical",
    score: 100,
    action: "ban",
    re: /\bor\s+1\s*=\s*1\b|\b'1'\s*=\s*'1\b|\bor\s+true\b|[\s('"]or\s+['"]?[a-z0-9]+['"]?\s*=\s*['"]?[a-z0-9]+/i,
  },
  {
    name: "sqli_stacked",
    category: "sqli",
    severity: "critical",
    score: 100,
    action: "ban",
    re: /;\s*(drop|alter|truncate|create|grant|revoke|update|delete|insert)\s+/i,
  },
  {
    name: "sqli_time_based",
    category: "sqli",
    severity: "critical",
    score: 100,
    action: "ban",
    re: /\b(sleep|benchmark|pg_sleep|waitfor\s+delay|dbms_pipe\.receive_message)\s*\(/i,
  },
  {
    name: "sqli_meta",
    category: "sqli",
    severity: "critical",
    score: 90,
    action: "ban",
    re: /\b(information_schema|sysobjects|syscolumns|pg_catalog|sqlite_master|load_file|into\s+outfile|into\s+dumpfile|xp_cmdshell|sp_executesql)\b/i,
  },
  {
    name: "sqli_comment",
    category: "sqli",
    severity: "warning",
    score: 40,
    action: "block",
    re: /(\/\*\!\d|\*\/\s*$|\bselect\b[\s\S]{0,60}\bfrom\b|--\s*$|#\s*$|\/\*[\s\S]{0,40}\*\/)/i,
  },
  {
    name: "sqli_quotes",
    category: "sqli",
    severity: "warning",
    score: 30,
    action: "none",
    re: /(\bor\b|\band\b)\s*['"]?\s*['"]\s*=/i,
  },

  /* ── Cross-Site Scripting ──────────────────────────────────────────────── */
  {
    name: "xss_tag",
    category: "xss",
    severity: "critical",
    score: 90,
    action: "ban",
    re: /(<|%3c|&lt;|\\x3c)\s*(script|iframe|object|embed|svg|math|img|video|body|link|meta|base|form)\b/i,
  },
  {
    name: "xss_handler",
    category: "xss",
    severity: "critical",
    score: 90,
    action: "ban",
    re: /\bon(error|load|click|mouseover|focus|submit|animationstart|toggle|start|begin)\s*=/i,
  },
  {
    name: "xss_protocol",
    category: "xss",
    severity: "critical",
    score: 80,
    action: "ban",
    re: /\b(javascript|vbscript|data\s*:\s*text\/html|data\s*:\s*application\/xhtml)\s*:/i,
  },
  {
    name: "xss_escape",
    category: "xss",
    severity: "warning",
    score: 35,
    action: "none",
    re: /(document\.(cookie|domain|write)|window\.location|eval\s*\(|alert\s*\(|prompt\s*\(|String\.fromCharCode)/i,
  },
  {
    name: "xss_template",
    category: "ssti",
    severity: "critical",
    score: 90,
    action: "ban",
    re: /(\{\{\s*[\w.'"[\]]*\s*(\*|\+|\|)\s*[\w.'"[\]]*\s*\}\}|\$\{\s*(jndi|env|7\*7|[\w.]+\s*[:.]\s*[\w.]+)\s*\}|\{%\s*(if|for|include|extends)\b|<%[=@]|#\{[\s\S]{1,60}\})/i,
  },

  /* ── Log4Shell / JNDI ──────────────────────────────────────────────────── */
  {
    name: "log4shell",
    category: "rce",
    severity: "critical",
    score: 100,
    action: "ban",
    re: /\$\{\s*(jndi|lower|upper|env|sys|date|ctx|java|main|script|::-)\s*:?\s*[a-z0-9_-]*\s*:?\s*\/\//i,
  },

  /* ── Path Traversal ────────────────────────────────────────────────────── */
  {
    name: "traversal",
    category: "traversal",
    severity: "critical",
    score: 95,
    action: "ban",
    re: /(\.\.(\/|\\|%2f|%5c)|%2e%2e(%2f|%5c|%252f|\/|\\)|\.\.%255c|%c0%ae%c0%ae)/i,
  },
  {
    name: "sensitive_file",
    category: "probe",
    severity: "critical",
    score: 95,
    action: "ban",
    re: /\/(etc\/(passwd|shadow|hosts)|proc\/self\/(environ|cmdline)|windows\/(win\.ini|system32)|boot\.ini)\b/i,
  },

  /* ── הרצת פקודות ──────────────────────────────────────────────────────── */
  {
    name: "cmd_injection",
    category: "rce",
    severity: "critical",
    score: 95,
    action: "ban",
    re: /([;&|`]\s*(cat|ls|whoami|id|uname|curl|wget|nc|netcat|bash|sh|powershell|python|perl|chmod)\b|\$\([\s\S]{1,80}\)|`[\s\S]{1,80}`|\|\|\s*(id|whoami)\b)/i,
  },
  {
    name: "shellshock",
    category: "rce",
    severity: "critical",
    score: 100,
    action: "ban",
    re: /\(\s*\)\s*\{\s*:?\s*;?\s*\}/,
  },

  /* ── SSRF / הפניית שרת פנימה ───────────────────────────────────────────── */
  {
    name: "ssrf",
    category: "ssrf",
    severity: "critical",
    score: 85,
    action: "ban",
    re: /(gopher|dict|ldap|tftp|jar|netdoc|file):\/\/|https?:\/\/(169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200|0\.0\.0\.0|localhost|127\.0\.0\.1|\[::1\])/i,
  },

  /* ── XXE ───────────────────────────────────────────────────────────────── */
  {
    name: "xxe",
    category: "xxe",
    severity: "critical",
    score: 95,
    action: "ban",
    re: /<!DOCTYPE[^>]{0,120}(SYSTEM|PUBLIC)[^>]{0,120}>|<!ENTITY\s+%?\s*\w+\s+(SYSTEM|PUBLIC)/i,
  },

  /* ── NoSQL / LDAP Injection ────────────────────────────────────────────── */
  {
    name: "nosql_injection",
    category: "nosqli",
    severity: "critical",
    score: 85,
    action: "ban",
    re: /(\$where|\$ne\b|\$gt\b|\$regex\b|\$exists\b|\{\s*"\$[a-z]+"\s*:)/i,
  },
  {
    name: "ldap_injection",
    category: "ldapi",
    severity: "warning",
    score: 45,
    action: "block",
    re: /(\*\)\(|\)\(|\(\||\(&|\*\)\s*\(|cn=.*\*\))/,
  },

  /* ── CRLF / Header Injection ───────────────────────────────────────────── */
  {
    name: "crlf_injection",
    category: "crlf",
    severity: "critical",
    score: 85,
    action: "ban",
    re: /(%0d%0a|%0a%0d|\r\n|\n\r)([a-z-]{3,30}:|\s*<html)/i,
  },
  {
    name: "null_byte",
    category: "malformed",
    severity: "critical",
    score: 85,
    action: "ban",
    re: /(%00|\\x00|\\u0000|\0)/,
  },

  /* ── דפוסים חשודים אחרים ──────────────────────────────────────────────── */
  {
    name: "scanner_path",
    category: "probe",
    severity: "warning",
    score: 60,
    action: "ban",
    re: /(\.php|\.asp|\.aspx|\.jsp|\.cgi|\.pl|\.sql|\.bak|\.old|\.swp|\.orig|\.save|~)$|\/(wp-|phpmyadmin|xmlrpc|adminer|shell|backup|dump|\.git|\.env|\.aws|\.ssh)/i,
  },
  {
    name: "prototype_pollution",
    category: "rce",
    severity: "critical",
    score: 90,
    action: "ban",
    re: /(__proto__|constructor\[|prototype\]|\[\s*["']?__proto__)/i,
  },
  {
    name: "ssti_angular",
    category: "ssti",
    severity: "warning",
    score: 50,
    action: "block",
    re: /\{\{\s*\d+\s*[*+]\s*\d+\s*\}\}/,
  },
];

/** כל הכללים, כולל שם נוח לשימוש חוזר */
export const ATTACK_RULES = RULES;

/* ───────────── סימנים של כלי אינטראקציה (Burp / ZAP / Postman) ──────────── */

/** כותרות שאף דפדפן אמיתי לא שולח — נוכחותן מעידה על פרוקסי/כלי יירוט */
export const PROXY_HEADERS = [
  { name: "proxy-connection", severity: "critical", score: 90, note: "כותרת פרוקסי (Burp/כלי יירוט)" },
  { name: "x-burp", severity: "critical", score: 100, note: "חתימת Burp Suite" },
  { name: "x-collaborator", severity: "critical", score: 100, note: "Burp Collaborator" },
  { name: "x-originating-ip", severity: "warning", score: 55, note: "כותרת זיוף IP" },
  { name: "x-remote-addr", severity: "warning", score: 55, note: "כותרת זיוף IP" },
  { name: "x-client-ip", severity: "warning", score: 45, note: "כותרת זיוף IP" },
  { name: "x-proxy-id", severity: "warning", score: 60, note: "כותרת פרוקסי" },
  { name: "x-forwarded-server", severity: "warning", score: 50, note: "כותרת פרוקסי" },
  { name: "x-http-method-override", severity: "warning", score: 70, note: "עקיפת מתודה" },
  { name: "x-method-override", severity: "warning", score: 70, note: "עקיפת מתודה" },
  { name: "x-rewrite-url", severity: "warning", score: 70, note: "עקיפת URL (IIS)" },
  { name: "x-original-url", severity: "warning", score: 60, note: "עקיפת URL" },
  { name: "zap", severity: "warning", score: 65, note: "כותרת OWASP ZAP" },
  { name: "x-scan-memo", severity: "critical", score: 90, note: "כותרת סורק" },
  { name: "x-requested-with", severity: "none", score: 0, note: "לגיטימי" },
];

/** חתימות בכל ערך כותרת (למשל User-Agent או Referer) */
export const TOOL_AGENTS = [
  { re: /burp\s*(suite|proxy|collaborator|intruder|repeater)/i, note: "Burp Suite", score: 100 },
  { re: /owasp\s*zap/i, note: "OWASP ZAP", score: 100 },
  { re: /postman\s*runtime|insomnia\//i, note: "לקוח API", score: 25 },
  { re: /(sqlmap|nikto|nuclei|acunetix|nessus|openvas|dirbuster|gobuster|ffuf|wfuzz|feroxbuster|masscan|zgrab|xray|hydra|skipfish|w3af|commix|havij)/i, note: "סורק פגיעויות", score: 100 },
  { re: /(metasploit|msfconsole|cobaltstrike|cobalt\s*strike|empire|sliver)/i, note: "כלי תקיפה", score: 100 },
  { re: /(curl|wget|python-requests|python-urllib|go-http-client|java\/|libwww|httpclient|okhttp|axios|node-fetch|undici|httpie)/i, note: "לקוח תכנותי", score: 20 },
];

/** מתודות מותרות (כל השאר נחסם) */
export const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/** מתודות שמעולם לא אמורות להגיע */
export const FORBIDDEN_METHODS = new Set(["TRACE", "TRACK", "CONNECT", "DEBUG", "PROPFIND", "PROPPATCH", "MKCOL", "COPY", "MOVE", "LOCK", "UNLOCK", "SEARCH", "NOTIFY", "SUBSCRIBE", "UNSUBSCRIBE", "PURGE", "ACL", "BIND", "REBIND", "LINK", "UNLINK", "PRI"]);

/** נתיבים שאליהם מותר רק GET/HEAD */
export const GET_ONLY_PREFIXES = ["/_next/", "/posters/", "/static/", "/media/", "/icons/"];

/** סיומות סטטיות — מתודות שינוי אסורות בהן */
export const STATIC_EXT = /\.(svg|png|jpe?g|webp|avif|gif|ico|css|js|mjs|map|woff2?|ttf|otf|mp4|webm|mkv|mp3|m4a|vtt|srt|json|txt|xml|webmanifest)$/i;

/** גבולות בקשה סבירים */
export const LIMITS = {
  urlLength: 2048,
  pathLength: 512,
  queryLength: 1024,
  headerCount: 80,
  headerSize: 16384,
  cookieSize: 8192,
  userAgentLength: 1024,
  refererLength: 2048,
};
