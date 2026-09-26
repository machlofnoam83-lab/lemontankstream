/**
 * מדיניות סיסמאות — השכבה שאוכפת **מה מותר**, לא רק מה נראה טוב.
 *
 * שלוש בדיקות, בסדר עולה של חוכמה:
 *   1. **מבנה** — אורך, סוגי תווים, חזרתיות, רצפים (1234, qwerty, abcd).
 *   2. **הקשר** — הסיסמה לא מכילה את האימייל, השם, או מילים שקשורות לאתר.
 *   3. **דליפה בפועל** — בדיקת "האם הסיסמה הזו הופיעה בהדלפה" מול Have I
 *      Been Pwned, בשיטת k-anonymity: נשלחות 5 התווים הראשונים של ה-Hash
 *      בלבד. הסיסמה עצמה לא עוזבת את השרת, גם לא בהצפנה.
 *
 * הבדיקה השלישית דורשת אינטרנט. כשאין — נופלים בחזרה לרשימה המקומית
 * ומדווחים על כך, כדי שאתר לא ייחסם להרשמות רק כי HIBP לא זמין.
 */

import crypto from "node:crypto";
import { all, get, run } from "./db";
import { ApiError } from "./http";

// ═══════════════════════════════════════════════════════════════════════════
//  1. רשימת הסיסמאות הדלופות הנפוצות (מקומית, עובדת גם בלי אינטרנט)
// ═══════════════════════════════════════════════════════════════════════════

const LEAKED: string[] = [
  "123456", "123456789", "12345678", "12345", "1234567", "1234567890", "qwerty", "abc123",
  "password", "password1", "password123", "passw0rd", "p@ssw0rd", "p@ssword", "pass1234",
  "iloveyou", "iloveyou1", "admin", "admin123", "admin1234", "administrator", "root", "toor",
  "welcome", "welcome1", "welcome123", "letmein", "letmein123", "monkey", "dragon", "sunshine",
  "princess", "football", "baseball", "superman", "batman", "master", "shadow", "michael",
  "jennifer", "jordan", "whatever", "trustno1", "freedom", "starwars", "computer", "internet",
  "samsung", "google", "facebook", "instagram", "whatsapp", "tiktok", "netflix", "spotify",
  "1q2w3e4r", "1qaz2wsx", "qazwsx", "zaq12wsx", "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "qwerty123", "qwerty1", "abc12345", "abcd1234", "abcd123456", "a1b2c3d4", "111111", "000000",
  "121212", "123123", "654321", "987654321", "555555", "666666", "777777", "888888", "999999",
  "112233", "123321", "159753", "147852", "789456", "asdf1234", "asdfgh", "changeme", "secret",
  "summer2024", "summer2025", "winter2024", "winter2025", "spring2025", "autumn2025",
  "january123", "december123", "iloveu", "mypassword", "newpassword", "nopassword", "temp1234",
  "test1234", "test12345", "testing123", "guest1234", "user1234", "default123", "changeme123",
  "sapassword", "israel", "israel1", "israel123", "israel1234", "yisrael123", "shalom123",
  "shalom1234", "shalom1", "shalom", "jerusalem", "telaviv123", "mazal111", "mazaltov123",
  "boker111", "layla123", "sababa123", "sababa", "achsheli", "cocacola", "pepsi123",
  "maccabi", "hapoel", "maccabi123", "hapoel123", "hapoel10", "maccabi10", "kombina123",
  "milchama", "orlanu123", "tikva123", "hadera123", "netanya123", "naharia123", "ashdod123",
  "beersheva", "lemontank", "lemontank123", "lemontank1", "lemon123", "tank123", "stream123",
  "movies123", "series123", "watcher123", "binge123", "popcorn123", "cinema123", "sratim123",
  "kosher123", "shabbat123", "mishpacha", "mishpacha123", "amit1234", "mor123456", "noam12345",
  "a1234567", "a123456789", "aa123456", "ab123456", "abc123abc", "family123", "mom123456",
  "dad123456", "love1234", "angel123", "hello123", "hello1234", "bonjour123", "hola123",
  "qwerty!@#$", "password!", "password1!", "admin123!", "welcome1!", "israel123!", "abc123456!",
  "asdasd", "asdasd123", "lkjhgf", "poiuyt", "0987654321", "1abcdefg", "1234abcd", "abcde12345",
  "iloveyou123", "ilovemusic", "iloveu123", "chocolate", "cookie123", "diamond123", "peanut123",
  "pokemon123", "minecraft", "minecraft123", "fortnite123", "roblox123", "gamer123", "gamer1234",
  "linux123", "windows123", "apple123", "iphone123", "android123", "python123", "hacker123",
  "anonymous", "unknown12", "nobody123", "nothing123", "nothing", "anything123", "whatever123",
  "bigboss123", "king1234", "queen1234", "princess1", "prince123", "friends123", "forever123",
  "together", "together1", "minealone", "temp123456", "tempor123", "welcome123!", "qwerty12",
  "aaaaaaaa", "aaaaaaaaaa", "11111111", "00000000", "12341234", "123123123", "qwer1234",
  "pass123", "pass12345", "passwd123", "passw0rd123", "letmein1", "trustno", "monkey123",
  "dragon123", "shadow123", "master123", "ninja123", "super123", "flower123", "yellow123",
  "orange123", "purple123", "green123", "silver123", "golden123", "summer123", "winter123",
  "spring123", "autumn123", "school123", "student123", "teacher123", "doctor123", "police123",
  "soldier123", "israeli123", "ivrit123", "boker123", "erev123", "shavua123", "chag123",
  "chag1234", "tov1234", "kol12345", "hakol123", "hakol", "bemeitz", "bemeitz123",
].map((value) => value.toLowerCase());

const LEAKED_SET = new Set(LEAKED);

/** מילים אסורות בהקשר של האתר הזה */
const SITE_WORDS = ["lemontank", "lemontankstream", "lemon tank", "לימונטנק", "lemontank.co", "lt-stream"];

/** ממיר ליטושי קיצור ("p@ssw0rd") לצורת הבסיס, כדי שהם לא יעברו */
function deLeet(value: string): string {
  return value
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/2/g, "z")
    .replace(/[$]/g, "s")
    .replace(/[@]/g, "a")
    .replace(/[!|]/g, "i");
}

/** מיפוי קיצורי תווים נפוצים — "p@ssw0rd" → "password" */
const LEET_MAP: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "2": "z", "9": "g", "6": "b",
  "@": "a", "$": "s", "!": "i", "|": "i", "+": "t", "(": "c", ")": "o",
};

const mapLeet = (value: string): string =>
  value.replace(/[0-9@$!|+()]/g, (ch) => LEET_MAP[ch] ?? ch);

const lettersOnly = (value: string): string => value.replace(/[^a-z\u0590-\u05ff]/g, "");
const alnumOnly = (value: string): string => value.replace(/[^a-z0-9\u0590-\u05ff]/g, "");

/** סיסמאות באורך 6+ שמספיק שיופיעו *בתוך* הסיסמה כדי לפסול אותה */
const CONTAINED = LEAKED.filter((word) => word.length >= 6);

/**
 * האם הסיסמה מבוססת על סיסמה דלופה/נפוצה — גם בקיצורי תווים,
 * באותיות גדולות, עם סיומת מספרים, או כחלק ממנה.
 *
 * למשל: P@ssw0rd#2027 → ממופה ל-password, ‏Qwerty1234! → qwerty,
 * ‏Mango-Password-2026 → password (מופיע בתוך).
 */
export function looksLeaked(password: string): boolean {
  const raw = String(password ?? "").normalize("NFKC").toLowerCase();
  const mapped = mapLeet(raw);

  // מסלול א': התאמה מדויקת — כולל הסרת סיומות נפוצות (1234, 2026…)
  const candidates = new Set<string>([
    raw,
    mapped,
    alnumOnly(raw),
    alnumOnly(mapLeet(alnumOnly(raw))),
    lettersOnly(raw),
    lettersOnly(mapped),
  ]);

  const suffixes = ["123", "1234", "12345", "1", "12", "2024", "2025", "2026", "2027"];
  for (const candidate of candidates) {
    if (candidate.length >= 4 && LEAKED_SET.has(candidate)) return true;
    for (const suffix of suffixes) {
      if (candidate.length > suffix.length + 3 && candidate.endsWith(suffix)) {
        const base = candidate.slice(0, -suffix.length);
        if (base.length >= 4 && LEAKED_SET.has(base)) return true;
      }
    }
  }

  // מסלול ב': הסיסמה *מכילה* סיסמה דלופה (Mango-Password-2026)
  for (const span of [lettersOnly(raw), lettersOnly(mapped), alnumOnly(mapped)]) {
    if (span.length < 6) continue;
    for (const word of CONTAINED) {
      if (span.includes(word)) return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. בדיקות הקשר — שהסיסמה לא תיגזר מהפרטים הגלויים של המשתמש
// ═══════════════════════════════════════════════════════════════════════════

export type PasswordContext = { email?: string | null; name?: string | null };

function contextProblems(password: string, ctx: PasswordContext): string[] {
  const problems: string[] = [];
  const pw = String(password ?? "").normalize("NFKC").toLowerCase();
  const flat = deLeet(pw.replace(/[^a-z0-9\u0590-\u05ff]+/g, ""));

  const email = String(ctx.email ?? "").toLowerCase();
  const local = email.split("@")[0]?.replace(/[^a-z0-9]/g, "") ?? "";
  if (local.length >= 4 && flat.includes(local)) problems.push("הסיסמה מכילה את כתובת האימייל שלך");

  const domain = email.split("@")[1]?.split(".")[0]?.replace(/[^a-z0-9]/g, "") ?? "";
  if (domain.length >= 4 && flat.includes(domain)) problems.push("הסיסמה מכילה את שם הדומיין של האימייל");

  for (const part of String(ctx.name ?? "").toLowerCase().split(/[\s-_]+/)) {
    const clean = part.replace(/[^a-z0-9\u0590-\u05ff]/g, "");
    if (clean.length >= 4 && flat.includes(deLeet(clean))) {
      problems.push("הסיסמה מכילה את השם שלך");
      break;
    }
  }

  for (const word of SITE_WORDS) {
    if (flat.includes(deLeet(word.replace(/[^a-z0-9\u0590-\u05ff]+/g, "")))) {
      problems.push("הסיסמה מכילה את שם האתר — קל לנחש");
      break;
    }
  }
  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. בדיקת דליפה מול Have I Been Pwned (k-anonymity, עם מטמון)
// ═══════════════════════════════════════════════════════════════════════════

const HIBP_ENDPOINT = "https://api.pwnedpasswords.com/range/";
const HIBP_TTL_HOURS = 24 * 7;

export type BreachVerdict = {
  /** האם נמצאה בדליפה (true/false) או שלא הצלחנו לבדוק (null) */
  pwned: boolean | null;
  /** מספר ההופעות בדליפות, אם ידוע */
  count: number;
  /** האם ההחלטה התקבלה ממטמון מקומי */
  cached: boolean;
  /** האם הבדיקה המרוחקת בכלל נוסה */
  checked: boolean;
  error?: string;
};

/** מצב בדיקת הדליפה — ניתן לכיבוי/הקלה דרך הגדרות האבטחה */
export function breachMode(): "off" | "warn" | "enforce" {
  const row = get<{ value: string }>("SELECT value FROM security_settings WHERE key = 'breach_check'");
  const value = String(row?.value ?? "enforce");
  return value === "off" || value === "warn" ? (value as "off" | "warn") : "enforce";
}

export function setBreachMode(mode: "off" | "warn" | "enforce"): void {
  run(
    `INSERT INTO security_settings(key, value) VALUES('breach_check', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [mode],
  );
}

/**
 * בדיקת דליפה. שולחים 5 תווים ראשונים של SHA-1; מקבלים רשימת
 * סיומות והמונים. הסיסמה לא נשלחת ולא נשמרת בשום צורה.
 */
export async function checkPwned(password: string, opts: { timeoutMs?: number; now?: number } = {}): Promise<BreachVerdict> {
  const mode = breachMode();
  if (mode === "off") return { pwned: false, count: 0, cached: false, checked: false };

  // SHA-1 הוא מה שה-HIBP API עובד איתו — זו אינה הגנת סיסמה אלא מפתח חיפוש
  const hash = crypto.createHash("sha1").update(String(password)).digest("hex");
  const prefix = hash.slice(0, 5).toUpperCase();
  const suffix = hash.slice(5).toUpperCase();
  const now = opts.now ?? Date.now();

  // מטמון: אותו prefix נבדק פעם ב-7 ימים
  const cached = get<{ payload: string; checked_at: string }>(
    "SELECT payload, checked_at FROM breach_checks WHERE prefix = ?",
    [prefix],
  );
  if (cached && Date.parse(cached.checked_at) > now - HIBP_TTL_HOURS * 3_600_000) {
    return { ...matchSuffix(cached.payload, suffix), cached: true, checked: true };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 4000);
    const res = await fetch(`${HIBP_ENDPOINT}${prefix}`, {
      signal: controller.signal,
      headers: { "user-agent": "LemonTank-Stream-Password-Policy", "add-padding": "true" },
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.text();
    run(
      `INSERT INTO breach_checks(prefix, payload, checked_at) VALUES(?,?,?)
       ON CONFLICT(prefix) DO UPDATE SET payload = excluded.payload, checked_at = excluded.checked_at`,
      [prefix, payload, new Date(now).toISOString()],
    );
    pruneBreachCache(now);
    return { ...matchSuffix(payload, suffix), cached: false, checked: true };
  } catch (error) {
    // אין אינטרנט? ממשיכים עם הרשימה המקומית — ולא חוסמים אנשים בגלל זה
    return {
      pwned: null,
      count: 0,
      cached: Boolean(cached),
      checked: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function matchSuffix(payload: string, suffix: string): { pwned: boolean; count: number } {
  for (const line of payload.split(/\r?\n/)) {
    const [candidate, times] = line.split(":");
    if (candidate?.trim().toUpperCase() === suffix) return { pwned: true, count: Number(times ?? 0) || 1 };
  }
  return { pwned: false, count: 0 };
}

function pruneBreachCache(now: number): void {
  try {
    run("DELETE FROM breach_checks WHERE checked_at < ?", [new Date(now - HIBP_TTL_HOURS * 3_600_000).toISOString()]);
    const rows = all<{ prefix: string; checked_at: string }>(
      "SELECT prefix, checked_at FROM breach_checks ORDER BY checked_at DESC",
    );
    for (const row of rows.slice(2000)) run("DELETE FROM breach_checks WHERE prefix = ?", [row.prefix]);
  } catch {
    /* ניקוי הוא מיטוב, לא חובה */
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. הפנים הציבוריות של המודול
// ═══════════════════════════════════════════════════════════════════════════

export type PasswordVerdict = {
  ok: boolean;
  /** 0–100, לתצוגה בלבד */
  score: number;
  level: "חלשה מאוד" | "חלשה" | "בינונית" | "חזקה" | "מצוינת";
  problems: string[];
  breached: boolean | null;
  breachCount: number;
  breachChecked: boolean;
  suggestions: string[];
};

const LENGTH_TARGET = 14;

/** בדיקה מקומית בלבד — מהירה, בלי רשת. משמשת את מדד החוזק בזמן הקלדה. */
export function assessLocal(password: string, ctx: PasswordContext = {}): PasswordVerdict {
  const pw = String(password ?? "");
  const problems: string[] = [];
  const suggestions: string[] = [];

  if (pw.length < 10) problems.push("הסיסמה חייבת להכיל לפחות 10 תווים");
  if (pw.length > 200) problems.push("הסיסמה ארוכה מדי (מקסימום 200 תווים)");
  if (!/[a-z]/.test(pw) && !/[\u0590-\u05FF]/.test(pw)) problems.push("חייבת לכלול אות");
  if (!/\d/.test(pw)) problems.push("חייבת לכלול ספרה");
  if (!/[^A-Za-z0-9\u0590-\u05FF]/.test(pw)) problems.push("חייבת לכלול תו מיוחד (!@#$%)");
  if (/^(.)\1+$/.test(pw)) problems.push("אין לחזור על אותו תו");
  if (/^\d+$/.test(pw)) problems.push("סיסמה של ספרות בלבד קלה מדי לניחוש");
  if (/(1234|12345|123456|abcd|qwer|asdf|zxcv|qwerty|1111|0000|2222)/i.test(pw)) {
    problems.push("הסיסמה מכילה רצף מוכר (1234/qwerty/abcd)");
  }
  if (looksLeaked(pw)) problems.push("הסיסמה נמצאת ברשימת הסיסמאות הנפוצות או הדלופות");
  problems.push(...contextProblems(pw, ctx));

  if (pw.length < LENGTH_TARGET) suggestions.push("אורך של 14 תווים ומעלה הוא הקפיצה הגדולה ביותר בביטחון");
  if (!/[A-Z]/.test(pw) && !/[\u0590-\u05FF]/.test(pw)) suggestions.push("הוסף אות גדולה");
  if (!/\d/.test(pw)) suggestions.push("הוסף ספרה");
  if (!/[^A-Za-z0-9\u0590-\u05FF]/.test(pw)) suggestions.push("הוסף תו מיוחד");
  if (suggestions.length === 0) suggestions.push("נוסחת מנצחת: 4 מילים אקראיות + ספרה + סימן");

  let score = 100 - problems.length * 22;
  score += Math.min(24, Math.max(0, pw.length - 10) * 3);
  score -= Math.max(0, LENGTH_TARGET - pw.length) * 2;
  if (problems.length) score = Math.min(score, 45);
  score = Math.max(0, Math.min(100, score));

  const level: PasswordVerdict["level"] =
    score < 25 ? "חלשה מאוד" : score < 45 ? "חלשה" : score < 70 ? "בינונית" : score < 90 ? "חזקה" : "מצוינת";

  return { ok: problems.length === 0, score, level, problems, breached: null, breachCount: 0, breachChecked: false, suggestions };
}

/** בדיקה מלאה — כולל דליפה. זוהי הבדיקה שמשמשת לפני שמירת סיסמה. */
export async function assessPassword(password: string, ctx: PasswordContext = {}): Promise<PasswordVerdict> {
  const verdict = assessLocal(password, ctx);
  const mode = breachMode();
  if (mode === "off") return verdict;

  const breach = await checkPwned(password);
  verdict.breached = breach.pwned;
  verdict.breachCount = breach.count;
  verdict.breachChecked = breach.checked;

  if (breach.pwned) {
    const message = `הסיסמה הזו הופיעה ב-${breach.count.toLocaleString("he-IL")} דליפות מידע ידועות — אסור להשתמש בה`;
    if (mode === "enforce") {
      verdict.problems.push(message);
      verdict.ok = false;
      verdict.score = Math.min(verdict.score, 10);
    } else {
      verdict.suggestions.unshift(`${message} (מומלץ מאוד להחליף)`);
      verdict.score = Math.min(verdict.score, 40);
    }
  }
  return verdict;
}

/** אכיפה בצד השרת — זורקת שגיאה אם הסיסמה לא עומדת במדיניות */
export async function enforcePasswordPolicy(password: string, ctx: PasswordContext = {}): Promise<{ breached: boolean | null; score: number }> {
  const verdict = await assessPassword(password, ctx);
  if (!verdict.ok) {
    throw new ApiError("BAD_REQUEST", 400, { problems: verdict.problems, score: verdict.score }, verdict.problems[0]);
  }
  return { breached: verdict.breached, score: verdict.score };
}

/** כמה סיסמאות נבדקו לאחרונה מול HIBP — לסטטיסטיקה בלוח הניהול */
export function breachCacheStats(): { ranges: number; lastCheckedAt: string | null } {
  try {
    const row = get<{ c: number; last: string | null }>(
      "SELECT COUNT(*) c, MAX(checked_at) last FROM breach_checks",
    );
    return { ranges: Number(row?.c ?? 0), lastCheckedAt: row?.last ?? null };
  } catch {
    return { ranges: 0, lastCheckedAt: null };
  }
}
