import { EntryNotFound } from "@/components/ui/states";

/**
 * רשומה שלא נמצאה באתר — לדוגמה /title/<slug> שהתיישן.
 * רץ בתוך פריסת האתר, עם הכותרת והכותרת התחתונה.
 */
export default function SiteNotFound() {
  return <EntryNotFound />;
}
