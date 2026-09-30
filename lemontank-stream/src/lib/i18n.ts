/**
 * עברית כברירת מחדל — כל מחרוזות הממשק, תמיכה מלאה ב-RTL.
 * מיושם כמפת מחרוזות פשוטה: קל לתרגם וללא תלות בספרייה חיצונית.
 */

export const LOCALES = ["he", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "he";
export const isRtl: Record<Locale, boolean> = { he: true, en: false };

export const SITE = {
  name: "LemonTank Stream",
  nameHe: "לימונטנק סטרים",
  tagline: "כל הסרטים והסדרות במקום אחד 🍋",
  description: "פלטפורמת סטרימינג ישראלית: סרטים וסדרות בעברית, מנוי חינם ומנוי פלוס, צפייה ב-4K, הורדות ומסיבות צפייה.",
  supportEmail: "support@lemontank.local",
};

export const GENRE_ICONS: Record<string, string> = {
  action: "💥", comedy: "😂", drama: "🎭", thriller: "🔪", horror: "👻", scifi: "🚀",
  fantasy: "🐉", romance: "💞", animation: "🎨", kids: "🧸", documentary: "🎥", crime: "🕵️",
  mystery: "🧩", family: "👨‍👩‍👧", history: "🏛️", music: "🎵", sport: "⚽", reality: "📺",
  anime: "🍥", israeli: "🇮🇱", war: "🎖️", western: "🤠",
};

export const MATURITY_OPTIONS = ["0+", "7+", "12+", "16+", "18+"] as const;
export const QUALITY_OPTIONS = ["480p", "720p", "1080p", "1440p", "4K"] as const;

export const LANGUAGES: Record<string, string> = {
  he: "עברית", en: "אנגלית", ru: "רוסית", ar: "ערבית", fr: "צרפתית", es: "ספרדית", de: "גרמנית",
};

export const HE = {
  nav: {
    home: "בית",
    movies: "סרטים",
    series: "סדרות",
    new: "חדש",
    popular: "פופולרי",
    myList: "הרשימה שלי",
    kids: "ילדים",
    live: "שידורים חיים",
    search: "חיפוש",
    login: "התחברות",
    logout: "התנתקות",
    register: "הרשמה",
    profile: "הפרופיל שלי",
    account: "החשבון שלי",
    plans: "מנויים",
    admin: "פאנל ניהול",
    upgrade: "שדרג לפלוס",
  },
  actions: {
    watch: "צפה עכשיו",
    resume: "המשך לצפות",
    play: "נגן",
    pause: "השהה",
    addToList: "הוסף לרשימה",
    removeFromList: "הסר מהרשימה",
    like: "אהבתי",
    share: "שיתוף",
    download: "הורדה",
    trailer: "טריילר",
    more: "עוד",
    details: "פרטים",
    back: "חזרה",
    save: "שמור",
    cancel: "ביטול",
    delete: "מחק",
    edit: "עריכה",
    create: "צור",
    update: "עדכן",
    upload: "העלה",
    search: "חפש",
    filter: "סנן",
    reset: "אפס",
    close: "סגור",
    next: "הבא",
    prev: "הקודם",
    confirm: "אישור",
    invite: "הזמן חברים",
    report: "דיווח",
  },
  labels: {
    freePlan: "חינם",
    plusPlan: "פלוס",
    plusOnly: "פלוס בלבד",
    freeContent: "חינם לכולם",
    hours: "שעות",
    minutes: "דקות",
    seasons: "עונות",
    episodes: "פרקים",
    rating: "דירוג",
    year: "שנה",
    genres: "ז'אנרים",
    director: "בימוי",
    cast: "שחקנים",
    quality: "איכות",
    audio: "אודיו",
    subtitles: "כתוביות",
    similar: "סרטים וסדרות דומים",
    continueWatching: "המשך לצפות",
    trending: "הטרנדים של השבוע",
    newReleases: "חדש בפלטפורמה",
    recommended: "מומלץ עבורך",
    becauseYouWatched: "כי צפית ב-",
    top10: "עשרת הגדולים",
    allMovies: "כל הסרטים",
    allSeries: "כל הסדרות",
    results: "תוצאות",
    noResults: "לא נמצאו תוצאות",
    loading: "טוען…",
    empty: "אין כאן עדיין תוכן",
    welcomeBack: "ברוך שובך",
    yourPlan: "המנוי שלך",
    expiresAt: "בתוקף עד",
  },
  messages: {
    loginRequired: "צריך להתחבר כדי לצפות",
    upgradeRequired: "התוכן הזה זמין למנויי פלוס. שדרג כדי לצפות.",
    addedToList: "נוסף לרשימה ✓",
    removedFromList: "הוסר מהרשימה",
    saved: "נשמר בהצלחה",
    error: "משהו השתבש, נסה שוב",
    comingSoon: "בקרוב",
  },
} as const;

/** מחזיר תרגום לפי מפתח (he כברירת מחדל) */
export function t(path: string): string {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = HE;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) return path;
  }
  return typeof node === "string" ? node : path;
}

export const htmlLangDir = (locale: Locale = DEFAULT_LOCALE) => ({
  lang: locale,
  dir: isRtl[locale] ? ("rtl" as const) : ("ltr" as const),
});
