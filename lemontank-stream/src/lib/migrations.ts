/**
 * הגירות עמודות — רצות פעם אחת לכל התקנה.
 *
 * למה זה בכלל קיים: `CREATE TABLE IF NOT EXISTS` לא נוגע בטבלה קיימת,
 * ולכן הוספת עמודה לשכבת "המבצר" לא הייתה מגיעה למסד ותיק. כאן כל הגירה
 * נרשמת בטבלת `schema_migrations` ורצה פעם אחת בלבד, בסדר קבוע.
 *
 * כלל ברזל: הגירה לא משנה ולא מוחקת נתונים קיימים — רק מוסיפה עמודות/indexes.
 */

import { all, get, run } from "./db";

type Migration = { name: string; sql: string[] };

const MIGRATIONS: Migration[] = [
  {
    name: "2026-09-fortress-session-posture",
    sql: [
      // קישור הסשן לטביעת הדפדפן ולרשת שממנה נוצר — זיהוי גניבת עוגייה
      "ALTER TABLE sessions ADD COLUMN ua_hash TEXT",
      "ALTER TABLE sessions ADD COLUMN ip_prefix TEXT",
      "ALTER TABLE sessions ADD COLUMN last_ip TEXT",
      // פקיעה מוחלטת (ליד ה-sliding) וחלון re-auth מדורג לפעולות רגישות
      "ALTER TABLE sessions ADD COLUMN absolute_expires_at TEXT",
      "ALTER TABLE sessions ADD COLUMN stepup_until TEXT",
      "ALTER TABLE sessions ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 0",
    ],
  },
  {
    name: "2026-09-fortress-audit-chain",
    sql: [
      // חתימת Hash משורשרת: כל רשומה נושאת את חתימת קודמתה →
      // כל מחיקה או שינוי בדיעבד ניתנים לגילוי בהשוואה אחת.
      "ALTER TABLE audit_log ADD COLUMN seq INTEGER",
      "ALTER TABLE audit_log ADD COLUMN prev_hash TEXT",
      "ALTER TABLE audit_log ADD COLUMN entry_hash TEXT",
      "CREATE INDEX IF NOT EXISTS idx_audit_seq ON audit_log(seq)",
    ],
  },
  {
    name: "2026-09-fortress-login-geo",
    sql: [
      // פרטי התחברות היסטוריים לזיהוי חריגות (מכשיר חדש, רשת חדשה)
      "ALTER TABLE sessions ADD COLUMN origin_country TEXT",
      "ALTER TABLE sessions ADD COLUMN mfa_used INTEGER NOT NULL DEFAULT 0",
    ],
  },
  {
    name: "2026-09-fortress-breach-cache",
    sql: [
      // מטמון לבדיקות דליפה (k-anonymity): נשמר רק ה-prefix של ה-Hash
      // ורשימת הסיומות שהוחזרה מה-API — לא הסיסמה עצמה, בשום צורה.
      `CREATE TABLE IF NOT EXISTS breach_checks (
        prefix TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        checked_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_breach_checked ON breach_checks(checked_at)",
      // ברירת מחדל: אכיפה. 'warn' = להתריע בלי לחסום, 'off' = כבוי.
      "INSERT OR IGNORE INTO security_settings(key, value) VALUES('breach_check', 'enforce')",
    ],
  },
  {
    name: "2026-09-fortress-login-attempts-user",
    sql: [
      // קישור ניסיון ההתחברות לחשבון — מאפשר לזהות "שורת כישלונות ואז הצלחה"
      // בחשבון מסוים, ולא רק לפי כתובת IP (שמשתנה מאחורי NAT/proxy).
      "ALTER TABLE login_attempts ADD COLUMN user_id INTEGER",
      "CREATE INDEX IF NOT EXISTS idx_login_attempts_user ON login_attempts(user_id, created_at)",
    ],
  },
  {
    name: "2026-09-payments-giftcards",
    sql: [
      // כרטיסי מתנה שהאתר מנפיק: נשמר Hash (לחיפוש) + עותק מוצפן (כדי לשלוח
      // שוב ללקוח). קוד גלוי לא נשמר — גם לא בטבלה ולא בגיבוי.
      `CREATE TABLE IF NOT EXISTS gift_cards (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        code_hash   TEXT NOT NULL UNIQUE,
        code_prefix TEXT NOT NULL,
        code_enc    TEXT,
        kind        TEXT NOT NULL DEFAULT 'issued',
        plan_code   TEXT NOT NULL DEFAULT 'plus',
        months      INTEGER NOT NULL DEFAULT 1,
        value_ils   REAL NOT NULL DEFAULT 0,
        max_uses    INTEGER NOT NULL DEFAULT 1,
        used_count  INTEGER NOT NULL DEFAULT 0,
        status      TEXT NOT NULL DEFAULT 'active',
        note        TEXT,
        created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        expires_at  TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      "CREATE INDEX IF NOT EXISTS idx_giftcards_status ON gift_cards(status, created_at)",
      // בקשות מימוש: גם מימוש עצמי של כרטיס שלנו, וגם תביעת תשלום חיצונית
      // שממתינה לאישור אנושי (הכרטיס נקנה בחנות — אף שרת לא יודע לאמת אותו).
      `CREATE TABLE IF NOT EXISTS redemption_requests (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash     TEXT NOT NULL,
        code_prefix   TEXT NOT NULL,
        code_enc      TEXT,
        kind          TEXT NOT NULL DEFAULT 'external',
        status        TEXT NOT NULL DEFAULT 'pending',
        plan_code     TEXT,
        months        INTEGER,
        value_ils     REAL,
        contact       TEXT,
        evidence      TEXT,
        decided_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        decided_at    TEXT,
        decision_note TEXT,
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ) STRICT`,
      "CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemption_requests(user_id, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemption_requests(status, created_at)",
      // יומן התראות יוצאות: מה נשלח, לאן, והאם הצליח — כדי ש"אין התראה" יהיה מצב גלוי
      `CREATE TABLE IF NOT EXISTS outbound_alerts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        channel    TEXT NOT NULL,
        kind       TEXT NOT NULL,
        title      TEXT NOT NULL,
        body       TEXT,
        status     TEXT NOT NULL DEFAULT 'queued',
        attempts   INTEGER NOT NULL DEFAULT 0,
        error      TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        sent_at    TEXT
      ) STRICT`,
      "CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_alerts(status, created_at)",
    ],
  },
  {
    name: "2026-09-audit-ledger-immutable",
    // ── לקח שנלמד מבדיקה אוטומטית ──────────────────────────────────────────
    // היומן המשורשר נכתב כשה-actor_id מוטמע בחתימה. אבל המפתח הזר של
    // audit_log.actor_id היה ON DELETE SET NULL — כלומר **מחיקת משתמש**
    // (פעולה לגיטימית לגמרי, ואף נרשמת ביומן) שכתבה מחדש רשומות עבר
    // והפכה חתימות תקפות ל"שבורות". יומן שאפשר לשנות בעקיפין הוא לא יומן.
    //
    // התיקון: actor_id נשאר מזהה היסטורי בלבד — בלי מפתח זר, בלי מחיקה
    // מטפסת. בנוסף נאכף ייחוד על seq כדי שלא ייווצרו שני "ראשי שרשרת".
    sql: [
      `CREATE TABLE audit_log_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id      INTEGER,
        actor_email   TEXT,
        action        TEXT    NOT NULL,
        entity        TEXT,
        entity_id     TEXT,
        severity      TEXT    NOT NULL DEFAULT 'info',
        before_json   TEXT,
        after_json    TEXT,
        ip            TEXT,
        user_agent    TEXT,
        request_id    TEXT,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        seq           INTEGER,
        prev_hash     TEXT,
        entry_hash    TEXT
      ) STRICT`,
      "INSERT INTO audit_log_new(id, actor_id, actor_email, action, entity, entity_id, severity, before_json, after_json, ip, user_agent, request_id, created_at, seq, prev_hash, entry_hash) SELECT id, actor_id, actor_email, action, entity, entity_id, severity, before_json, after_json, ip, user_agent, request_id, created_at, seq, prev_hash, entry_hash FROM audit_log",
      "DROP TABLE audit_log",
      "ALTER TABLE audit_log_new RENAME TO audit_log",
      "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_seq_unique ON audit_log(seq)",
      // ── עוגן נפרד ליומן ────────────────────────────────────────────────────
      // רצף seq מגלה מחיקה מהאמצע, אבל **מחיקת הרשומות האחרונות** (התקיפה
      // הקלה ביותר: לחתוך את הזנב כדי להסתיר חדירה) נראית כמו יומן תמים
      // שפשוט נגמר. העוגן נכתב תמיד יחד עם הרשומה האחרונה, ולכן הוא המזהה
      // היחיד שיודע מה באמת היה הראש של היומן.
      `CREATE TABLE IF NOT EXISTS audit_anchor (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        seq        INTEGER NOT NULL,
        entry_hash TEXT    NOT NULL,
        updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ) STRICT`,
      `INSERT INTO audit_anchor(id, seq, entry_hash, updated_at)
         SELECT 1, seq, entry_hash, strftime('%Y-%m-%dT%H:%M:%fZ','now')
         FROM audit_log WHERE seq IS NOT NULL AND entry_hash IS NOT NULL
         ORDER BY seq DESC LIMIT 1
       ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, entry_hash = excluded.entry_hash, updated_at = excluded.updated_at`,
    ],
  },
];

let applied = false;

function columnsOf(table: string): Set<string> {
  return new Set(
    all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => String(row.name)),
  );
}

/**
 * מריץ הגירות שלא הוחלו. בטוח לקריאה חוזרת (idempotent) ובטוחה במקביליות
 * ברמה שהמערכת צריכה: אם עמודה כבר קיימת — מדלגים על ההצהרה הזו בלבד.
 */
export function runMigrations(): { applied: string[]; skipped: string[] } {
  const appliedAlready = new Set(all<{ name: string }>("SELECT name FROM schema_migrations").map((r) => String(r.name)));
  const done: string[] = [];
  const skipped: string[] = [];

  for (const migration of MIGRATIONS) {
    if (appliedAlready.has(migration.name)) {
      skipped.push(migration.name);
      continue;
    }
    for (const statement of migration.sql) {
      try {
        run(statement);
      } catch (error) {
        const message = String((error as Error)?.message ?? "");
        // "duplicate column name" = כבר הוחל בעבר (למשל אחרי שחזור מגיבוי)
        if (!/duplicate column name|already exists/i.test(message)) {
          throw new Error(`הגירה ${migration.name} נכשלה: ${message}`);
        }
      }
    }
    run("INSERT OR IGNORE INTO schema_migrations(name) VALUES(?)", [migration.name]);
    done.push(migration.name);
  }

  applied = true;
  return { applied: done, skipped };
}

/** האם העמודה קיימת בפועל (לבדיקות ולמסך הבריאות) */
export const hasColumn = (table: string, column: string): boolean => columnsOf(table).has(column);

/** מספר ההגירות הרשומות */
export const migrationsApplied = (): number => Number(get<{ c: number }>("SELECT COUNT(*) c FROM schema_migrations")?.c ?? 0);

/** האם ההגירות כבר רצו בתהליך הזה */
export const migrationsReady = (): boolean => applied;
