/**
 * שמות העוגיות במקום אחד — כדי שאפשר יהיה "לטשטש" את טביעת האצבע של המערכת.
 *
 * ברירת המחדל נשארת lt_* (תאימות לאחור), אבל בסביבת פרודקשן אפשר להגדיר
 * COOKIE_PREFIX לשם אקראי — כך שסורק לא יזהה את המערכת לפי שם עוגייה.
 *
 *   .env.local:  COOKIE_PREFIX="s7kq2x"
 *
 * חשוב: החלפת הקידומת מנתקת סשנים קיימים (כל המשתמשים מתחברים מחדש).
 */

const raw = (process.env.COOKIE_PREFIX ?? "lt").trim();
const prefix = /^[a-z0-9]{1,16}$/i.test(raw) ? raw : "lt";

export const COOKIE_PREFIX = prefix;
export const SESSION_COOKIE = `${prefix}_session`;
export const CSRF_COOKIE = `${prefix}_csrf`;

/** עוגיית מעבר למצב חמקן — כדי שגם אתה תוכל להיכנס דרך CDN בלי כותרת סודית */
export const ENTRY_COOKIE = `${prefix}_entry`;
export const ENTRY_QUERY = "lt_entry";
