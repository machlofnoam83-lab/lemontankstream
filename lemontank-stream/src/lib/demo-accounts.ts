/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  מניית חשבונות לבדיקה ("מזויפים") — כלי בטיחות של המנהל
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  מה זה: יצירה מרוכזת של חשבונות דמה כדי לבדוק את המערכת כמו שהיא תיראה
 *  עם קהל — דירוגים, "ממשיכים לצפות", המלצות, לוח בקשות, גרפי ניהול.
 *
 *  שלוש הבטחות שהקוד הזה שומר עליהן, ולא במקרה:
 *
 *    1. **בטיחות מייל מוחלטת.** כל הכתובות נוצרות על דומיין שמור לבדיקות
 *       (ברירת מחדל `@example.com`, וגם `.invalid` / `.test` / `example.org`
 *       מותרים). אלה דומיינים ש-RFC 2606 מקצה בדיוק לכך — הם **לא ניתנים
 *       לשליחה**, ולכן אין סיכוי לשלוח מייל אמיתי לזר. כתובת אמיתית של מישהו
 *       אחר (gmail.com וכדומה) נדחית בכוונה.
 *
 *    2. **סימון שאי אפשר לפספס.** כל חשבון נוצר עם `notes` שמתחיל ב-
 *       `DEMO-ACCOUNT`, והמייל נושא את התבנית `demo-…@…` — כך שכל מסך ניהול,
 *       יצוא נתונים או סקריפט רואה מיד שזה דמה. בנוסף `email_verified=0`
 *       כדי שלא ייחשבו משתמשים מאומתים.
 *
 *    3. **מחיקה נקייה בפקודה אחת.** `deleteDemoAccounts()` מוחק רק חשבונות
 *       שמסומנים ככאלה — לעולם לא משתמש אמיתי, גם אם ביקשו "מחק הכל".
 *
 *  מה *לא* נעשה: החשבונות לא יכולים להתחבר. הסיסמה שלהם אקראית וארוכה,
 *  והיא לא מוחזרת למנהל — כדי שלא יהיה חשבון דמה שאפשר "להיכנס דרכו"
 *  ולעקוף את עקרון האחריותיות (accountability) של המערכת.
 */

import crypto from "node:crypto";
import { all, get, run, tx } from "./db";
import { hashPassword } from "./crypto";
import { ApiError } from "./http";

/** דומיינים שמורים לבדיקות בלבד (RFC 2606) — אפס סיכון לשלוח למישהו */
export const SAFE_DEMO_DOMAINS = ["example.com", "example.org", "example.net", "test.invalid"] as const;

/** הסימן בכל חשבון דמה — הבסיס לזיהוי ולמחיקה בטוחה */
export const DEMO_NOTE_PREFIX = "DEMO-ACCOUNT";

const FIRST_NAMES = [
  "נועם", "שירה", "איתי", "מאיה", "יונתן", "תמר", "עומר", "יעל", "אורי", "רותם",
  "דניאל", "ליאור", "אביב", "נטע", "אילון", "שחר", "רוני", "עדי", "טל", "מיקה",
  "אלון", "הילה", "גיא", "אורלי", "בר", "סתיו", "ים", "אגם", "לביא", "ניצן",
  "אביגיל", "יובל", "אופיר", "דור", "רן", "ענת", "כרמל", "אריאל", "שי", "גל",
];

const LAST_NAMES = [
  "כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "פרידמן", "שפירא", "אזולאי", "גבאי",
  "דהן", "אוחיון", "חדד", "רוזן", "בן דוד", "אשכנזי", "בר־לב", "נחום", "סולומון", "טל",
  "וקנין", "שטרן", "גולן", "הראל", "מור", "זוהר", "אלמוג", "שקד", "נבו", "כרמי",
];

export type DemoAccount = {
  id: number;
  name: string;
  email: string;
  plan: "free" | "plus";
  created_at: string;
};

export type GenerateOptions = {
  count?: number;
  /** אחוז מנויי פלוס (0–100) — כדי לבדוק מסכים בתשלום */
  plusPercent?: number;
  /** דומיין המייל; חייב להיות מהדומיינים השמורים */
  domain?: string;
  /** תחילית לשם המייל (ברירת מחדל demo) */
  prefix?: string;
};

const slug = (text: string) =>
  text
    .replace(/["'’]/g, "")
    .replace(/[־\s]+/g, ".")
    .replace(/[^a-zA-Z0-9.\u0590-\u05FF]/g, "")
    .toLowerCase();

const pick = <T,>(items: readonly T[]): T => items[crypto.randomInt(items.length)];

/** סיסמה אקראית ארוכה — לא מוחזרת למנהל ולא נשמרת בשום מקום גלוי */
const randomPassword = () => `Demo-${crypto.randomBytes(24).toString("base64url")}`;

function validate(options: GenerateOptions) {
  const domain = (options.domain ?? SAFE_DEMO_DOMAINS[0]).trim().toLowerCase();
  if (!SAFE_DEMO_DOMAINS.includes(domain as (typeof SAFE_DEMO_DOMAINS)[number])) {
    throw new ApiError(
      "BAD_REQUEST",
      400,
      { domain, allowed: SAFE_DEMO_DOMAINS },
      `מותר להשתמש רק בדומיין בדיקה שמור (${SAFE_DEMO_DOMAINS.join(", ")}) — כדי שלא יישלח מייל לאף אדם אמיתי`,
    );
  }
  const count = Math.max(1, Math.min(300, Math.round(options.count ?? 12)));
  const plusPercent = Math.max(0, Math.min(100, Math.round(options.plusPercent ?? 25)));
  const prefix = (options.prefix ?? "demo").replace(/[^a-z0-9.-]/gi, "").slice(0, 24) || "demo";
  return { domain, count, plusPercent, prefix };
}

/**
 * יצירת חשבונות דמה. הכל בטרנזקציה אחת — או שהכל נוצר, או שלא נוצר כלום.
 * מחזיר את רשימת החשבונות (בלי סיסמאות, בלי האשים).
 */
export async function generateDemoAccounts(options: GenerateOptions = {}): Promise<DemoAccount[]> {
  const { domain, count, plusPercent, prefix } = validate(options);
  const created: DemoAccount[] = [];

  /*
   * האשה אחת לכל אצווה, ולא אחת לכל חשבון: scrypt תוכנן להיות איטי
   * (N=32768), ולכן 300 חשבונות בנפרד היו מקפיאים את השרת לחצי דקה.
   * הסיסמה עצמה אקראית ואינה מוצגת לאף אחד, ולכן אין לה שום שימוש —
   * היא קיימת רק כדי שהרשומה תהיה תקינה כמו כל משתמש אחר.
   */
  const passwordHash = await hashPassword(randomPassword());

  tx(() => {
    for (let index = 0; index < count; index += 1) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const name = `${first} ${last}`;

      // מייל ייחודי: demo-<slug>.<n>@domain — ואם תפוס, ממשיכים להוסיף מספר
      let attempt = index + 1;
      let email = "";
      let emailNorm = "";
      for (let guard = 0; guard < 60; guard += 1) {
        email = `${prefix}-${slug(first)}.${slug(last)}.${attempt}@${domain}`;
        emailNorm = email.toLowerCase();
        const exists = get<{ id: number }>("SELECT id FROM users WHERE email_norm = ?", [emailNorm]);
        if (!exists) break;
        attempt += 1;
      }
      if (!email) throw new ApiError("CONFLICT", 409, undefined, "לא הצלחתי לייצר כתובת ייחודית — נסה שוב");

      const isPlus = crypto.randomInt(100) < plusPercent;
      const plan: "free" | "plus" = isPlus ? "plus" : "free";
      const note = `${DEMO_NOTE_PREFIX} · נוצר ע"י המנהל · ${new Date().toISOString().slice(0, 10)}`;
      const referral = crypto.randomBytes(4).toString("hex").toUpperCase();

      const result = run(
        `INSERT INTO users(email, email_norm, password_hash, password_algo, name, plan_code, referral_code,
                           marketing_opt_in, max_profiles, email_verified, notes, country, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,0,?,?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
        [
          email,
          emailNorm,
          passwordHash,
          "scrypt$32768$8$1",
          name,
          plan,
          referral,
          0,
          plan === "plus" ? 5 : 2,
          note,
          "IL",
        ],
      );

      const id = Number(result.lastInsertRowid);

      // פרופיל ברירת מחדל + פרופיל ילדים לכל חמישי — כדי שבדיקות משפחה יהיו אמיתיות
      run("INSERT INTO profiles(user_id, name, is_kid, sort_order) VALUES(?,?,0,0)", [id, first]);
      if (crypto.randomInt(100) < 20) {
        run("INSERT INTO profiles(user_id, name, is_kid, maturity_limit, sort_order) VALUES(?,?,1,7,1)", [id, `${first} (ילד)`]);
      }
      if (plan === "plus") {
        run("INSERT INTO subscriptions(user_id, plan_code, status, current_period_end) VALUES(?,?,?,?)", [
          id,
          "plus",
          "active",
          new Date(Date.now() + 30 * 86_400_000).toISOString(),
        ]);
      }

      created.push({ id, name, email, plan, created_at: new Date().toISOString() });
    }
  });

  return created;
}

/** כמה חשבונות דמה קיימים כרגע */
export function countDemoAccounts(): number {
  const row = get<{ c: number }>(
    "SELECT COUNT(*) c FROM users WHERE notes LIKE ? AND deleted_at IS NULL",
    [`${DEMO_NOTE_PREFIX}%`],
  );
  return Number(row?.c ?? 0);
}

/** רשימת חשבונות הדמה (לתצוגה בפאנל) */
export function listDemoAccounts(limit = 200) {
  return all<{ id: number; name: string; email: string; plan_code: string; created_at: string; status: string }>(
    `SELECT id, name, email, plan_code, created_at, status FROM users
      WHERE notes LIKE ? AND deleted_at IS NULL
      ORDER BY id DESC LIMIT ?`,
    [`${DEMO_NOTE_PREFIX}%`, Math.max(1, Math.min(1000, limit))],
  );
}

/**
 * מחיקת כל חשבונות הדמה — ורק הם.
 * שתי הגנות: הסימן ב-notes, וגם המייל חייב להיות באחד הדומיינים השמורים.
 * גם אם מישהו יזייף הערה, אף משתמש אמיתי לא יימחק.
 */
export function deleteDemoAccounts(): { deleted: number } {
  const rows = all<{ id: number; email_norm: string }>(
    "SELECT id, email_norm FROM users WHERE notes LIKE ?",
    [`${DEMO_NOTE_PREFIX}%`],
  );
  const safe = rows.filter((row) =>
    SAFE_DEMO_DOMAINS.some((domain) => String(row.email_norm).endsWith(`@${domain}`)),
  );

  tx(() => {
    for (const row of safe) {
      // ניקוי מלא: סשנים, פרופילים, מנויים, רשימות, היסטוריה — ואז המחיקה הרכה
      run("DELETE FROM sessions WHERE user_id = ?", [row.id]);
      run("DELETE FROM profiles WHERE user_id = ?", [row.id]);
      run("DELETE FROM subscriptions WHERE user_id = ?", [row.id]);
      run("DELETE FROM watch_progress WHERE user_id = ?", [row.id]);
      run("DELETE FROM watchlist WHERE user_id = ?", [row.id]);
      run("DELETE FROM ratings WHERE user_id = ?", [row.id]);
      run("DELETE FROM notifications WHERE user_id = ?", [row.id]);
      for (const list of all<{ id: number }>("SELECT id FROM user_lists WHERE user_id = ?", [row.id])) {
        run("DELETE FROM user_list_items WHERE list_id = ?", [list.id]);
      }
      run("DELETE FROM user_lists WHERE user_id = ?", [row.id]);
      // אותו מסלול מחיקה רכה שהמערכת עצמה משתמשת בו (users/[id]) — status='banned' + deleted_at
      run("UPDATE users SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status='banned' WHERE id = ?", [row.id]);
    }
  });

  return { deleted: safe.length };
}
