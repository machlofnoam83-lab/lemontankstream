import fs from "node:fs";
import path from "node:path";

/**
 * בדיקת קיום קבצי אמנות — כדי שמסך לא יציג תמונה שבורה.
 *
 * למה זה קיים: הציורים נוצרים בנפרד מהקוד, ולכן ייתכן שרכיב מבקש ציור שעוד
 * לא הופק. בצד שרת אפשר לבדוק בקובץ עצמו ולהחליף בשכבת צבע מעוצבת — עדיף על
 * תמונה חסרה, וזה גם מה שמאפשר להוסיף אמנות בהמשך בלי לגעת ברכיבים.
 */
export function artFile(name: string): string | null {
  try {
    const file = path.join(process.cwd(), "public", "art", name);
    return fs.existsSync(file) ? `/art/${name}` : null;
  } catch {
    return null;
  }
}

/** כל קבצי האמנות שזמינים כרגע — לשימוש בתצוגות שמציגות רשימה */
export function availableArt(): string[] {
  try {
    return fs.readdirSync(path.join(process.cwd(), "public", "art"));
  } catch {
    return [];
  }
}
