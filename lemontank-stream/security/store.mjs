/**
 * מחסן האבטחה — חסימות IP, מונים, הגדרות ואירועים.
 *
 * עובד ישירות מול אותו קובץ SQLite של האתר (node:sqlite, אפס תלויות),
 * כדי שמנוע האבטחה יוכל לפעול **לפני** ש-Next.js נטען, ושה-API באתר יראה
 * את אותם נתונים בדיוק.
 *
 * כל הכתיבות עטופות ב-try/catch: תקלה בלוג לעולם לא תפיל בקשה של משתמש.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// node:sqlite הוא מודול מובנה — טוענים אותו דרך createRequire כדי שסקריפטים
// וכלים חיצוניים יוכלו להשתמש במחסן גם בלי build של TypeScript.
const require = createRequire(import.meta.url);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ip_bans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT    NOT NULL,
  ip_hash     TEXT,
  reason      TEXT    NOT NULL,
  category    TEXT    NOT NULL,
  severity    TEXT    NOT NULL DEFAULT 'warning',
  strikes     INTEGER NOT NULL DEFAULT 1,
  hits        INTEGER NOT NULL DEFAULT 0,
  path        TEXT,
  method      TEXT,
  user_agent  TEXT,
  action      TEXT,
  auto        INTEGER NOT NULL DEFAULT 1,
  permanent   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT,
  lifted_at   TEXT,
  lifted_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_ip_bans_ip      ON ip_bans(ip, expires_at);
CREATE INDEX IF NOT EXISTS idx_ip_bans_active  ON ip_bans(lifted_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_ip_bans_created ON ip_bans(created_at DESC);

CREATE TABLE IF NOT EXISTS security_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS security_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL,
  severity   TEXT    NOT NULL DEFAULT 'warning',
  ip         TEXT,
  user_id    INTEGER,
  detail     TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sec_events ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_ip ON security_events(ip, created_at DESC);

CREATE TABLE IF NOT EXISTS security_counters (
  key        TEXT PRIMARY KEY,
  value      INTEGER NOT NULL DEFAULT 0,
  window_end TEXT
) STRICT;
`;

/** זמני חסימה לפי סוג התקיפה (בשניות) — מקור האמת היחיד גם לצד TypeScript */
export const BAN_TTL = {
  honeypot: 86_400,   // 24 שעות — פנייה לנתיב מלכודת
  sqli: 7_200,        // שעתיים
  rce: 43_200,        // 12 שעות
  traversal: 21_600,  // 6 שעות
  xss: 3_600,
  ssti: 21_600,
  xxe: 21_600,
  ssrf: 10_800,
  crlf: 10_800,
  nosqli: 10_800,
  ldapi: 3_600,
  malformed: 3_600,
  probe: 43_200,      // סורקים — חצי יממה
  tool: 10_800,       // Burp/סורק פגיעויות
  spoof: 3_600,       // זיוף כותרות/פרוקסי
  brute: 3_600,       // brute-force להתחברות
  flood: 1_800,       // הצפת בקשות
  threat: 86_400,     // ניקוד איומים מצטבר
  manual: 86_400,
};
const MAX_TTL = 2_592_000; // 30 יום

/**
 * זמן החסימה האפקטיבי: כל "סטרייק" מכפיל את התקופה (עד 30 יום).
 * חשוב: הצד ה-TypeScript (src/lib/security/bans.ts) משכפל את הנוסחה הזו,
 * ובדיקת יחידה משווה בין השניים כדי שלא יתפצלו.
 */
export function banTtlSeconds(category, strikes = 1) {
  const base = BAN_TTL[category] ?? BAN_TTL.threat;
  const factor = 2 ** Math.max(0, Math.min(strikes - 1, 10));
  return Math.min(MAX_TTL, base * factor);
}

const nowIso = () => new Date().toISOString();
const plusSec = (sec) => new Date(Date.now() + sec * 1000).toISOString();

/* ────────────────────────────── הגדרות ברירת מחדל ────────────────────────── */

export const DEFAULT_SETTINGS = {
  mode: "enforce",              // enforce | monitor (monitor = לוג בלבד, בלי חסימה)
  autoban: "on",                // on | off — חסימת IP אוטומטית
  honeypot: "ban",              // ban | block | off
  tool_block: "ban",            // ban | block | off — כלי יירוט/סריקה
  proxy_policy: "score",        // off | score | block-writes | block-all — VPN/ענן/TOR
  datacenter_ban: "off",        // on = חסימה מלאה של כתובות מרכזי נתונים
  tor_ban: "on",                // on = חסימת TOR מלאה (אחרת: block-writes)
  empty_ua: "score",            // score | block
  internal_bypass: "on",        // כתובות פנימיות (loopback/LAN) פטורות מחסימה
  staff_bypass: "on",           // סשן של איש צוות עוקף חסימה (מנע נעילה עצמית)
  rate_per_minute: "600",       // תקרת בקשות לדקה ל-IP (0 = ללא הגבלה)
  flood_ban: "on",              // חסימה אחרי הצפה חוזרת
  retention_days: "90",         // כמה ימים לשמור אירועי אבטחה
  ip_mode: "full",              // full | hash — איך נשמר IP באירועים (full = נוח לזיהוי תוקף)
  honeypot_paths: "on",         // הפעלת נתיבי המלכודת
};

/* ───────────────────────────────── המחסן ─────────────────────────────────── */

export function openStore({ dbFile, appRoot = process.cwd(), quiet = false }) {
  const file = dbFile || process.env.DATABASE_FILE || path.join(appRoot, "data", "lemontank.db");
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let db;
  try {
    // טעינה דינמית: האתר ממשיך לעבוד גם אם node:sqlite אינו זמין (Node ישן)
    const { DatabaseSync } = require("node:sqlite");
    db = new DatabaseSync(file);
  } catch (err) {
    if (!quiet) console.warn("[security] מסד הנתונים אינו זמין — מנוע האבטחה ירוץ בזיכרון בלבד:", err?.message);
    db = null;
  }

  if (db) {
    try {
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA busy_timeout = 4000");
      db.exec("PRAGMA synchronous = NORMAL");
      db.exec(SCHEMA);
    } catch (err) {
      if (!quiet) console.warn("[security] לא ניתן לאתחל את טבלאות האבטחה:", err?.message);
    }
  }

  const stmts = new Map();
  const stmt = (sql) => {
    if (!db) return null;
    let s = stmts.get(sql);
    if (!s) {
      s = db.prepare(sql);
      stmts.set(sql, s);
    }
    return s;
  };
  const safe = (fn, fallback = null) => {
    try {
      return db ? fn() : fallback;
    } catch (err) {
      if (process.env.SECURITY_DEBUG === "1") console.warn("[security:store]", err?.message);
      return fallback;
    }
  };

  /* ── הגדרות ─────────────────────────────────────────────────────────────── */
  const settingsCache = new Map();
  let settingsLoadedAt = 0;

  function settings() {
    if (Date.now() - settingsLoadedAt < 5_000 && settingsCache.size) return Object.fromEntries(settingsCache);
    const merged = { ...DEFAULT_SETTINGS };
    safe(() => {
      for (const row of stmt("SELECT key, value FROM security_settings").all()) merged[row.key] = row.value;
    });
    settingsCache.clear();
    for (const [k, v] of Object.entries(merged)) settingsCache.set(k, String(v));
    settingsLoadedAt = Date.now();
    return merged;
  }

  function setting(key) {
    return settings()[key] ?? DEFAULT_SETTINGS[key];
  }

  function setSetting(key, value) {
    const clean = String(value).slice(0, 200);
    safe(() =>
      stmt(
        `INSERT INTO security_settings(key, value, updated_at) VALUES(?,?,?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(key, clean, nowIso()),
    );
    settingsCache.set(key, clean);
    settingsLoadedAt = Date.now();
    return clean;
  }

  function resetSettings() {
    safe(() => stmt("DELETE FROM security_settings").run());
    settingsCache.clear();
    settingsLoadedAt = 0;
    return settings();
  }

  /* ── חסימות ─────────────────────────────────────────────────────────────── */
  const isActive = "(lifted_at IS NULL AND (permanent = 1 OR expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))";

  /** האם ה-IP חסום כעת (כולל רישום "פגיעה" לצורכי דוח) */
  function isBanned(ip) {
    if (!ip) return null;
    return safe(() => {
      const row = stmt(`SELECT * FROM ip_bans WHERE ip = ? AND ${isActive} ORDER BY id DESC LIMIT 1`).get(ip);
      return row ?? null;
    }, null);
  }

  function bannedList(limit = 100) {
    return safe(
      () => stmt(`SELECT * FROM ip_bans WHERE ${isActive} ORDER BY id DESC LIMIT ?`).all(Math.min(500, limit)),
      [],
    );
  }

  function banHistory(limit = 100) {
    return safe(() => stmt("SELECT * FROM ip_bans ORDER BY id DESC LIMIT ?").all(Math.min(500, limit)), []);
  }

  /**
   * חסימת כתובת. אם קיימת חסימה פעילה לאותו IP — מחריפים (strikes++ → זמן כפול).
   * מחזיר את שורת החסימה ו-unbanAt לתצוגה.
   */
  function ban({ ip, category = "manual", reason = "פעילות חשודה", severity = "warning", path: reqPath = null, method = null, userAgent = null, action = null, auto = true, permanent = false, ttlSec = null }) {
    if (!ip) return null;
    return safe(() => {
      const current = stmt(`SELECT * FROM ip_bans WHERE ip = ? AND ${isActive} ORDER BY id DESC LIMIT 1`).get(ip);
      const strikes = current ? Number(current.strikes) + 1 : 1;
      const ttl = permanent ? null : (ttlSec ?? banTtlSeconds(category, strikes));

      if (current) {
        stmt("UPDATE ip_bans SET strikes = ?, expires_at = ?, reason = ?, category = ?, severity = ?, path = ?, method = ?, user_agent = ?, action = ?, hits = hits + 1 WHERE id = ?").run(
          strikes,
          ttl ? plusSec(ttl) : null,
          String(reason).slice(0, 300),
          category,
          severity,
          reqPath ? String(reqPath).slice(0, 400) : null,
          method ? String(method).slice(0, 12) : null,
          userAgent ? String(userAgent).slice(0, 400) : null,
          action ? String(action).slice(0, 40) : null,
          current.id,
        );
        return { ...current, strikes, expires_at: ttl ? plusSec(ttl) : null, ttl_sec: ttl, escalated: true };
      }

      const info = stmt(
        `INSERT INTO ip_bans(ip, reason, category, severity, strikes, path, method, user_agent, action, auto, permanent, expires_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        ip,
        String(reason).slice(0, 300),
        category,
        severity,
        strikes,
        reqPath ? String(reqPath).slice(0, 400) : null,
        method ? String(method).slice(0, 12) : null,
        userAgent ? String(userAgent).slice(0, 400) : null,
        action ? String(action).slice(0, 40) : null,
        auto ? 1 : 0,
        permanent ? 1 : 0,
        ttl ? plusSec(ttl) : null,
      );
      return { id: Number(info.lastInsertRowid), ip, category, reason, severity, strikes, ttl_sec: ttl, escalated: false };
    }, null);
  }

  /** שחרור חסימה. מחזיר מספר השורות שהוסרו מהמצב הפעיל. */
  function unban(ip, by = "admin") {
    return safe(
      () =>
        stmt(`UPDATE ip_bans SET lifted_at = ?, lifted_by = ? WHERE ip = ? AND lifted_at IS NULL`).run(nowIso(), String(by).slice(0, 120), ip)
          .changes,
      0,
    );
  }

  function unbanAll(by = "admin") {
    return safe(() => stmt("UPDATE ip_bans SET lifted_at = ?, lifted_by = ? WHERE lifted_at IS NULL").run(nowIso(), String(by).slice(0, 120)).changes, 0);
  }

  function purgeExpired(days = 90) {
    return safe(() => {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      return stmt("DELETE FROM ip_bans WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (lifted_at IS NOT NULL AND lifted_at < ?)").run(cutoff, cutoff).changes;
    }, 0);
  }

  function banStats() {
    return safe(() => {
      const active = stmt(`SELECT COUNT(*) c FROM ip_bans WHERE ${isActive}`).get()?.c ?? 0;
      const total = stmt("SELECT COUNT(*) c FROM ip_bans").get()?.c ?? 0;
      const day = stmt(`SELECT COUNT(*) c FROM ip_bans WHERE ${isActive} AND created_at > datetime('now','-1 day')`).get()?.c ?? 0;
      const byCategory = stmt(`SELECT category, COUNT(*) c FROM ip_bans WHERE ${isActive} GROUP BY category ORDER BY c DESC LIMIT 12`).all();
      return { active: Number(active), total: Number(total), last24h: Number(day), byCategory };
    }, { active: 0, total: 0, last24h: 0, byCategory: [] });
  }

  /* ── מונים (הגבלת קצב בשכבת הקצה) ───────────────────────────────────────── */

  /** מגדיל מונה בחלון זמן; מחזיר את הערך החדש. משמש להגבלת קצב ולספירת כשלים. */
  function incr(key, windowSec = 60) {
    return safe(() => {
      const row = stmt("SELECT value, window_end FROM security_counters WHERE key = ?").get(key);
      const now = Date.now();
      if (row && row.window_end && new Date(row.window_end).getTime() > now) {
        const next = Number(row.value) + 1;
        stmt("UPDATE security_counters SET value = ? WHERE key = ?").run(next, key);
        return next;
      }
      const end = new Date(now + windowSec * 1000).toISOString();
      stmt("INSERT INTO security_counters(key, value, window_end) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET value = 1, window_end = excluded.window_end").run(key, end);
      return 1;
    }, 1);
  }

  function getCounter(key) {
    return safe(() => Number(stmt("SELECT value FROM security_counters WHERE key = ?").get(key)?.value ?? 0), 0);
  }

  function resetCounter(key) {
    safe(() => stmt("DELETE FROM security_counters WHERE key = ?").run(key));
  }

  function pruneCounters() {
    return safe(() => stmt("DELETE FROM security_counters WHERE window_end IS NOT NULL AND window_end < ?").run(nowIso()).changes, 0);
  }

  /** הוספת ניקוד/ספירה בערך שאינו 1 */
  function addCounter(key, delta = 1, windowSec = 60) {
    return safe(() => {
      const row = stmt("SELECT value, window_end FROM security_counters WHERE key = ?").get(key);
      const now = Date.now();
      if (row && row.window_end && new Date(row.window_end).getTime() > now) {
        const next = Number(row.value) + Number(delta);
        stmt("UPDATE security_counters SET value = ? WHERE key = ?").run(next, key);
        return next;
      }
      const end = new Date(now + windowSec * 1000).toISOString();
      stmt("INSERT INTO security_counters(key, value, window_end) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, window_end = excluded.window_end").run(key, Number(delta), end);
      return Number(delta);
    }, 0);
  }

  /** האם עוגיית הסשן שייכת לאיש צוות מחובר (משמש לחסינות מפני נעילה עצמית) */
  function staffBySessionHash(tokenHash) {
    if (!tokenHash) return null;
    return safe(
      () =>
        stmt(
          `SELECT s.id, s.user_id, u.email, u.role
             FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.revoked_at IS NULL
              AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
              AND u.deleted_at IS NULL AND u.role IN ('owner','admin','editor','moderator')
            LIMIT 1`,
        ).get(tokenHash) ?? null,
      null,
    );
  }

  /** מזהי התוקפנים הבולטים ביממה האחרונה (לפי אירועי אבטחה וחסימות) */
  function topOffenders(limit = 10) {
    return safe(() => {
      const rows = stmt(
        `SELECT ip, COUNT(*) AS hits, MAX(created_at) AS last_seen
           FROM security_events
          WHERE ip IS NOT NULL AND created_at > datetime('now','-1 day')
          GROUP BY ip ORDER BY hits DESC LIMIT ?`,
      ).all(Math.min(50, limit));
      const bans = stmt(`SELECT ip, reason, category, strikes, expires_at FROM ip_bans WHERE ${isActive}`).all();
      const banByIp = new Map(bans.map((b) => [b.ip, b]));
      return rows.map((r) => ({ ...r, banned: banByIp.has(r.ip), ban: banByIp.get(r.ip) ?? null }));
    }, []);
  }

  /* ── אירועי אבטחה ───────────────────────────────────────────────────────── */

  function event({ kind, severity = "warning", ip = null, detail = null, userId = null }) {
    return safe(
      () => stmt("INSERT INTO security_events(kind, severity, ip, user_id, detail) VALUES(?,?,?,?,?)").run(String(kind).slice(0, 60), severity, ip ?? null, userId ?? null, detail ? String(detail).slice(0, 2000) : null),
      null,
    );
  }

  function recentEvents(limit = 50) {
    return safe(() => stmt("SELECT id, kind, severity, ip, user_id, detail, created_at FROM security_events ORDER BY id DESC LIMIT ?").all(Math.min(500, limit)), []);
  }

  function pruneEvents(days = 90) {
    return safe(() => stmt("DELETE FROM security_events WHERE created_at < datetime('now', ?)").run(`-${days} day`).changes, 0);
  }

  function close() {
    safe(() => db?.close());
  }

  return {
    file, enabled: Boolean(db),
    settings, setting, setSetting, resetSettings,
    isBanned, bannedList, banHistory, ban, unban, unbanAll, purgeExpired, banStats,
    incr, addCounter, getCounter, resetCounter, pruneCounters,
    staffBySessionHash, topOffenders,
    event, recentEvents, pruneEvents,
    close,
  };
}
