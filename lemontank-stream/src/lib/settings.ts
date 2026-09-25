/**
 * הגדרות מערכת — נשמרות בטבלת settings כ-JSON, עם ברירות מחדל בטוחות.
 * אדמין יכול לשנות דרך /admin/settings; כל שינוי נרשם ביומן הביקורת.
 */

import { all, get, parseJson, run } from "./db";

export type AppSettings = {
  site_name: string;
  site_tagline: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  registration_open: boolean;
  require_email_verification: boolean;
  force_2fa_for_admins: boolean;
  default_signup_plan: "free" | "plus";
  free_plan_has_ads: boolean;
  trial_days: number;
  max_streams_free: number;
  max_streams_plus: number;
  free_quality: "480p" | "720p" | "1080p";
  plus_quality: "1080p" | "1440p" | "4K";
  downloads_enabled: boolean;
  comments_enabled: boolean;
  reviews_require_approval: boolean;
  kids_mode_enabled: boolean;
  hero_slides: Array<{ title_id?: number; headline: string; sub: string; image?: string }>;
  announcement: string;
  contact_email: string;
  contact_phone: string;
  social: Record<string, string>;
  seo_keywords: string;
  session_ttl_days: number;
  max_login_attempts: number;
  audit_retention_days: number;
  updated_at?: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  site_name: "LemonTank Stream",
  site_tagline: "כל הסרטים והסדרות במקום אחד 🍋",
  maintenance_mode: false,
  maintenance_message: "אנחנו משדרגים את המערכת — נחזור בעוד כמה דקות 🍋",
  registration_open: true,
  require_email_verification: false,
  force_2fa_for_admins: false,
  default_signup_plan: "free",
  free_plan_has_ads: true,
  trial_days: 7,
  max_streams_free: 1,
  max_streams_plus: 4,
  free_quality: "720p",
  plus_quality: "4K",
  downloads_enabled: true,
  comments_enabled: true,
  reviews_require_approval: false,
  kids_mode_enabled: true,
  hero_slides: [],
  announcement: "",
  contact_email: "support@lemontank.local",
  contact_phone: "",
  social: { instagram: "", facebook: "", tiktok: "", youtube: "", telegram: "" },
  seo_keywords: "סרטים, סדרות, סטרימינג, עברית, צפייה ישירה, סרטים בעברית",
  session_ttl_days: 30,
  max_login_attempts: 8,
  audit_retention_days: 365,
};

const CACHE_TTL_MS = 5_000;
let cache: { at: number; value: AppSettings } | null = null;

/** מחזיר את כל ההגדרות (עם מטמון קצר בזיכרון למניעת עומס DB) */
export function getSettings(force = false): AppSettings {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const merged: AppSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in merged) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[row.key] = parseJson(row.value, (merged as any)[row.key]);
    }
  }
  cache = { at: Date.now(), value: merged };
  return merged;
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return getSettings()[key];
}

export function setSetting(key: keyof AppSettings, value: unknown, userId?: number): void {
  const exists = get<{ key: string }>("SELECT key FROM settings WHERE key = ?", [key]);
  const json = JSON.stringify(value);
  if (exists) {
    run("UPDATE settings SET value=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_by=? WHERE key=?", [
      json, userId ?? null, key,
    ]);
  } else {
    run("INSERT INTO settings(key, value, updated_by) VALUES(?,?,?)", [key, json, userId ?? null]);
  }
  cache = null;
}

export function updateSettings(patch: Partial<AppSettings>, userId?: number): AppSettings {
  for (const [key, value] of Object.entries(patch)) {
    if (key in DEFAULT_SETTINGS) setSetting(key as keyof AppSettings, value, userId);
  }
  return getSettings(true);
}

/* ─────────────────────── Feature flags ─────────────────────────────────── */

export const DEFAULT_FLAGS: Record<string, { enabled: boolean; description: string }> = {
  watch_party: { enabled: true, description: "מסיבות צפייה משותפות" },
  downloads: { enabled: true, description: "הורדה לצפייה אופליין" },
  live_tv: { enabled: true, description: "ערוצי שידור חיים" },
  reviews: { enabled: true, description: "ביקורות ודירוגים" },
  comments: { enabled: true, description: "תגובות לפרקים" },
  ai_recommendations: { enabled: true, description: "המלצות אישיות" },
  kids_mode: { enabled: true, description: "מצב ילדים עם פרופיל נעול" },
  trailers: { enabled: true, description: "נגן טריילרים" },
  notifications: { enabled: true, description: "מרכז התראות" },
  coupons: { enabled: true, description: "קופונים והנחות" },
  referrals: { enabled: true, description: "הזמנת חברים וקרדיטים" },
  ads_on_free: { enabled: true, description: "פרסומות במסלול חינם" },
  trailer_autoplay: { enabled: true, description: "הפעלה אוטומטית של טריילר" },
  skip_intro: { enabled: true, description: "דלג על פתיח" },
  pip: { enabled: true, description: "תמונה בתוך תמונה" },
  chromecast: { enabled: false, description: "העברה ל-Chromecast" },
  offline_sync: { enabled: false, description: "סנכרון אופליין מלא" },
  parental_pin: { enabled: true, description: "קוד הורים לפרופיל ילדים" },
  dark_theme: { enabled: true, description: "ערכת נושא כהה (ברירת מחדל)" },
  light_theme: { enabled: false, description: "ערכת נושא בהירה" },
  hebrew_search: { enabled: true, description: "חיפוש חכם בעברית" },
  voice_search: { enabled: false, description: "חיפוש קולי" },
  two_factor_auth: { enabled: true, description: "אימות דו-שלבי" },
  audit_log: { enabled: true, description: "יומן ביקורת מלא" },
  api_access: { enabled: true, description: "גישת API עם מפתחות" },
  webhooks: { enabled: false, description: "Webhooks לאינטגרציות" },
  csv_import: { enabled: true, description: "ייבוא קטלוג מ-CSV/JSON" },
  tmdb_sync: { enabled: true, description: "סנכרון מטא-דאטה מ-TMDB" },
  multi_language_ui: { enabled: true, description: "ממשק רב-לשוני (עברית/אנגלית)" },
  watch_history: { enabled: true, description: "היסטוריית צפייה" },
  continue_watching: { enabled: true, description: "המשך צפייה" },
  top10: { enabled: true, description: "דירוג עשרת הגדולים" },
  collections: { enabled: true, description: "אוספים ואוצרות תוכן" },
  collections_auto: { enabled: true, description: "אוספים אוטומטיים לפי כללים" },
  promos: { enabled: true, description: "באנרים וקמפיינים" },
  badges: { enabled: true, description: "תגים והישגים" },
  coins: { enabled: true, description: "מטבעות פנימיים" },
  referrals_rewards: { enabled: true, description: "תגמול על הזמנות" },
  export_user_data: { enabled: true, description: "ייצוא נתונים אישיים (GDPR)" },
  delete_account: { enabled: true, description: "מחיקת חשבון עצמית" },
  email_verification: { enabled: false, description: "אימות כתובת מייל" },
  password_reset_email: { enabled: true, description: "איפוס סיסמה במייל" },
  rate_limiting: { enabled: true, description: "הגבלת קצב בקשות" },
  csp_nonce: { enabled: true, description: "CSP עם nonce לכל בקשה" },
  session_rotation: { enabled: true, description: "סיבוב טוקן סשן" },
  device_management: { enabled: true, description: "ניהול מכשירים מחוברים" },
  security_dashboard: { enabled: true, description: "לוח בקרת אבטחה" },
  backup_export: { enabled: true, description: "גיבוי וייצוא מסד" },
  analytics_dashboard: { enabled: true, description: "לוח אנליטיקה" },
  clickhouse_style_reports: { enabled: true, description: "דוחות צפייה יומיים" },
  autoplay_next: { enabled: true, description: "הפעלה אוטומטית של הפרק הבא" },
  quality_selector: { enabled: true, description: "בורר איכות" },
  subtitle_styling: { enabled: true, description: "עיצוב כתוביות" },
  keyboard_shortcuts: { enabled: true, description: "קיצורי מקלדת בנגן" },
  sleep_timer: { enabled: false, description: "טיימר שינה" },
  speed_control: { enabled: true, description: "שליטה במהירות נגינה" },
  skip_recap: { enabled: true, description: "דלג על תקציר" },
  next_episode_overlay: { enabled: true, description: "חלונית הפרק הבא" },
  mobile_pwa: { enabled: true, description: "התקנה כאפליקציה (PWA)" },
  rtl_full: { enabled: true, description: "תמיכה מלאה ב-RTL" },
  accessibility: { enabled: true, description: "נגישות ותאימות WCAG" },
};

export function getFeatureFlags(): Record<string, { enabled: boolean; description: string; rollout_pct: number }> {
  const stored = all<{ key: string; enabled: number; rollout_pct: number; description: string | null }>(
    "SELECT key, enabled, rollout_pct, description FROM feature_flags",
  );
  const map: Record<string, { enabled: boolean; description: string; rollout_pct: number }> = {};
  for (const [key, def] of Object.entries(DEFAULT_FLAGS)) {
    map[key] = { enabled: def.enabled, description: def.description, rollout_pct: 100 };
  }
  for (const row of stored) {
    map[row.key] = { enabled: !!row.enabled, description: row.description ?? map[row.key]?.description ?? "", rollout_pct: row.rollout_pct ?? 100 };
  }
  return map;
}

export const isFeatureEnabled = (key: string): boolean => getFeatureFlags()[key]?.enabled ?? false;

/** האם הפיצ'ר דלוק עבור משתמש ספציפי (כולל rollout באחוזים) */
export function featureForUser(key: string, userId: number | null): boolean {
  const flag = getFeatureFlags()[key];
  if (!flag || !flag.enabled) return false;
  if (flag.rollout_pct >= 100) return true;
  if (userId == null) return false;
  return (userId * 2654435761) % 100 < flag.rollout_pct;
}

export function toggleFeature(key: string, enabled: boolean, userId?: number, description?: string): void {
  const def = DEFAULT_FLAGS[key];
  run(
    `INSERT INTO feature_flags(key, enabled, description, updated_at) VALUES(?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled, description=COALESCE(excluded.description, feature_flags.description),
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [key, enabled ? 1 : 0, description ?? def?.description ?? null],
  );
  void userId;
}
