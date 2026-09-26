/**
 * סכימות ולידציה (Zod) — קלט מהלקוח עובר כאן לפני שהוא נוגע במסד.
 * הכלל: whitelist של שדות, המרה לטיפוסים, הגבלת אורך, וניקוי HTML.
 */

import { z } from "zod";

/* ─────────────────────────── ניקוי וסניטציה ─────────────────────────────── */

/**
 * ניקוי טקסט מתוכן HTML/סקריפטים.
 * אנחנו לא מאפשרים HTML בכלל (React כבר מבצע escaping בתצוגה), אבל מנקים
 * גם מחרוזות שנכנסות ל-meta/JSON-LD/מיילים — הגנה בשכבות.
 */
export function sanitizeText(input: unknown, maxLength = 5000): string {
  return String(input ?? "")
    .replace(/\u0000/g, "")                                   // null bytes
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "") // סקריפטים
    .replace(/<\/?[a-z][^>]*>/gi, "")                          // תגי HTML
    .replace(/javascript:/gi, "")                               // javascript: URI
    .replace(/on[a-z]+\s*=/gi, "")                              // onerror= וכדומה
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")               // תווי bidi (מניעת החלפת כיוון)
    .trim()
    .slice(0, maxLength);
}

/** טקסט עשיר מוגבל (עבור תקציר/תיאור) — שומר על שורות חדשות בלבד */
export const sanitizeMultiline = (input: unknown, max = 8000): string =>
  sanitizeText(input, max).replace(/\r\n/g, "\n");

/** כתובת URL בטוחה: רק http/https (או נתיב יחסי שמתחיל ב-/) */
export const safeUrl = (input: unknown): string | null => {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(0, 500);
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null; // מניעת phishing עם credentials
    return u.toString().slice(0, 800);
  } catch {
    return null;
  }
};

export const slugify = (input: string): string =>
  String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/['"׳״]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `item-${Date.now().toString(36)}`;

/* ─────────────────────────────── סכימות ────────────────────────────────── */

export const emailSchema = z.string().trim().min(5).max(160).email("כתובת אימייל לא תקינה").transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, "הסיסמה חייבת להכיל לפחות 10 תווים")
  .max(200, "הסיסמה ארוכה מדי")
  .refine((v) => /\d/.test(v), "הסיסמה חייבת לכלול ספרה")
  .refine((v) => /[^A-Za-z0-9\u0590-\u05FF]/.test(v), "הסיסמה חייבת לכלול תו מיוחד");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "שם קצר מדי").max(60, "שם ארוך מדי"),
  email: emailSchema,
  password: passwordSchema,
  plan: z.enum(["free", "plus"]).optional().default("free"),
  referral: z.string().trim().max(32).optional().nullable(),
  marketing: z.boolean().optional().default(false),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "צריך לאשר את התקנון" }) }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "חסרה סיסמה").max(200),
  remember: z.boolean().optional().default(false),
  totp: z.string().trim().regex(/^\d{6}$/, "קוד 2FA חייב להיות 6 ספרות").optional(),
  challenge: z.string().max(200).optional(),
});

export const resetRequestSchema = z.object({ email: emailSchema });

export const resetConfirmSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, "צריך שם").max(30, "שם ארוך מדי"),
  is_kid: z.boolean().optional().default(false),
  maturity_limit: z.enum(["7+", "12+", "16+", "18+"]).optional().default("18+"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#f5b301"),
  avatar_url: z.string().max(500).optional().nullable(),
  lang_audio: z.enum(["he", "en", "ru", "ar"]).optional().default("he"),
  lang_subs: z.enum(["he", "en", "ru", "ar", "off"]).optional().default("he"),
});

/* ─── קטלוג ─── */

export const PLAN_ACCESS = z.enum(["free", "plus"]);
export const TITLE_STATUS = z.enum(["draft", "scheduled", "published", "archived"]);

export const titleSchema = z.object({
  kind: z.enum(["movie", "series"]),
  name_he: z.string().trim().min(1, "חייב שם בעברית").max(160),
  name_en: z.string().trim().max(160).optional().nullable(),
  slug: z.string().trim().max(120).optional().nullable(),
  tagline: z.string().trim().max(200).optional().nullable(),
  overview: z.string().trim().max(6000).optional().nullable(),
  year: z.coerce.number().int().min(1890).max(2100).optional().nullable(),
  release_date: z.string().trim().max(20).optional().nullable(),
  runtime_min: z.coerce.number().int().min(1).max(600).optional().nullable(),
  maturity: z.enum(["0+", "7+", "12+", "16+", "18+"]).optional().default("12+"),
  country: z.string().trim().max(80).optional().nullable(),
  language: z.string().trim().max(20).optional().default("he"),
  director: z.string().trim().max(160).optional().nullable(),
  cast_text: z.string().trim().max(1000).optional().nullable(),
  poster_url: z.string().max(800).optional().nullable(),
  backdrop_url: z.string().max(800).optional().nullable(),
  trailer_url: z.string().max(800).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#f5b301"),
  plan_access: PLAN_ACCESS.default("free"),     // ← האדמין קובע: חינם / פלוס
  status: TITLE_STATUS.default("draft"),
  is_featured: z.boolean().optional().default(false),
  is_original: z.boolean().optional().default(false),
  is_downloadable: z.boolean().optional().default(false),
  quality_max: z.enum(["480p", "720p", "1080p", "1440p", "4K"]).optional().default("1080p"),
  rating_imdb: z.coerce.number().min(0).max(10).optional().nullable(),
  keywords: z.string().trim().max(500).optional().nullable(),
  seo_title: z.string().trim().max(200).optional().nullable(),
  seo_description: z.string().trim().max(400).optional().nullable(),
  scheduled_at: z.string().trim().max(40).optional().nullable(),
  genres: z.array(z.coerce.number().int().positive()).max(12).optional().default([]),
});
export type TitleInput = z.infer<typeof titleSchema>;

export const seasonSchema = z.object({
  title_id: z.coerce.number().int().positive(),
  number: z.coerce.number().int().min(1).max(200),
  name_he: z.string().trim().max(160).optional().nullable(),
  overview: z.string().trim().max(3000).optional().nullable(),
  poster_url: z.string().max(800).optional().nullable(),
  year: z.coerce.number().int().min(1890).max(2100).optional().nullable(),
  plan_access: z.enum(["inherit", "free", "plus"]).optional().default("inherit"),
});

export const episodeSchema = z.object({
  title_id: z.coerce.number().int().positive(),
  season_id: z.coerce.number().int().positive(),
  season_number: z.coerce.number().int().min(1).max(200).optional().default(1),
  number: z.coerce.number().int().min(0).max(2000),
  name_he: z.string().trim().min(1, "חייב שם לפרק").max(200),
  name_en: z.string().trim().max(200).optional().nullable(),
  overview: z.string().trim().max(4000).optional().nullable(),
  runtime_sec: z.coerce.number().int().min(0).max(60 * 60 * 12).optional().default(0),
  air_date: z.string().trim().max(20).optional().nullable(),
  thumb_url: z.string().max(800).optional().nullable(),
  video_url: z.string().max(1000).optional().nullable(),
  plan_access: z.enum(["inherit", "free", "plus"]).optional().default("inherit"), // ← האדמין קובע לפרק
  status: TITLE_STATUS.optional().default("draft"),
  intro_start_sec: z.coerce.number().int().min(0).optional().nullable(),
  intro_end_sec: z.coerce.number().int().min(0).optional().nullable(),
  credits_start_sec: z.coerce.number().int().min(0).optional().nullable(),
  is_premiere: z.boolean().optional().default(false),
  is_finale: z.boolean().optional().default(false),
  is_filler: z.boolean().optional().default(false),
});
export type EpisodeInput = z.infer<typeof episodeSchema>;

export const genreSchema = z.object({
  name_he: z.string().trim().min(1).max(40),
  slug: z.string().trim().max(40).optional(),
  icon: z.string().trim().max(8).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#f5b301"),
  sort: z.coerce.number().int().min(0).max(999).optional().default(0),
});

export const collectionSchema = z.object({
  name_he: z.string().trim().min(1).max(80),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  cover_url: z.string().max(800).optional().nullable(),
  layout: z.enum(["row", "hero", "grid", "top10", "spotlight", "continue", "carousel", "compact"]).optional().default("row"),
  plan_access: PLAN_ACCESS.optional().default("free"),
  is_public: z.boolean().optional().default(true),
  rule_json: z.string().max(4000).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

export const promoSchema = z.object({
  kind: z.enum(["banner", "popup", "strip", "hero"]).optional().default("banner"),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(300).optional().nullable(),
  image_url: z.string().max(800).optional().nullable(),
  cta_text: z.string().trim().max(40).optional().nullable(),
  cta_url: z.string().max(800).optional().nullable(),
  plan_access: z.enum(["all", "free", "plus"]).optional().default("all"),
  audience: z.enum(["all", "free", "plus", "new", "churned"]).optional().default("all"),
  starts_at: z.string().max(40).optional().nullable(),
  ends_at: z.string().max(40).optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

export const planUpdateSchema = z.object({
  name_he: z.string().trim().min(1).max(60).optional(),
  tagline: z.string().trim().max(200).optional().nullable(),
  price_ils: z.coerce.number().min(0).max(10_000).optional(),
  old_price_ils: z.coerce.number().min(0).max(10_000).optional().nullable(),
  max_streams: z.coerce.number().int().min(1).max(10).optional(),
  max_profiles: z.coerce.number().int().min(1).max(10).optional(),
  max_quality: z.enum(["480p", "720p", "1080p", "1440p", "4K"]).optional(),
  downloads_allowed: z.boolean().optional(),
  ads_enabled: z.boolean().optional(),
  ads_free_bypass: z.boolean().optional(),
  trial_days: z.coerce.number().int().min(0).max(90).optional(),
  early_access: z.boolean().optional(),
  features_json: z.array(z.string().max(120)).max(30).optional(),
  badge_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  is_active: z.boolean().optional(),
});

export const userAdminSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  role: z.enum(["user", "editor", "admin", "owner"]).optional(),
  status: z.enum(["active", "suspended", "banned", "pending"]).optional(),
  plan_code: z.enum(["free", "plus"]).optional(),
  plan_until: z.string().max(40).optional().nullable(),
  max_profiles: z.coerce.number().int().min(1).max(10).optional(),
  mature_allowed: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
  coins: z.coerce.number().int().min(0).max(1_000_000).optional(),
  /** ניתוק מיידי של כל המכשירים המחוברים של המשתמש */
  revoke_sessions: z.boolean().optional(),
});

export const reviewSchema = z.object({
  title_id: z.coerce.number().int().positive(),
  headline: z.string().trim().max(120).optional().nullable(),
  body: z.string().trim().min(3, "הביקורת קצרה מדי").max(4000),
  stars: z.coerce.number().int().min(1).max(10).optional().nullable(),
  has_spoilers: z.boolean().optional().default(false),
});

export const commentSchema = z.object({
  title_id: z.coerce.number().int().positive().optional().nullable(),
  episode_id: z.coerce.number().int().positive().optional().nullable(),
  parent_id: z.coerce.number().int().positive().optional().nullable(),
  body: z.string().trim().min(1, "תגובה ריקה").max(1500, "תגובה ארוכה מדי"),
});

export const progressSchema = z.object({
  title_id: z.coerce.number().int().positive(),
  episode_id: z.coerce.number().int().positive().optional().nullable(),
  profile_id: z.coerce.number().int().positive().optional().nullable(),
  position_sec: z.coerce.number().min(0).max(86_400),
  duration_sec: z.coerce.number().min(0).max(86_400),
});

export const settingsSchema = z.record(z.string().max(60), z.union([z.string().max(4000), z.number(), z.boolean(), z.null()]));

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
  offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
});

/** ניקוי אובייקט קלט מקסימלי — מחזיר רק שדות מוכרים */
export function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}
