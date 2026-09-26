import type { Metadata } from "next";
import { SupportForm } from "@/components/site/support-form";
import { Card } from "@/components/ui/primitives";
import { SITE } from "@/lib/i18n";

export const metadata: Metadata = { title: "תמיכה", description: "צריך עזרה? אנחנו כאן בשבילך" };
export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1.2fr_0.8fr]">
      <div>
        <h1 className="text-2xl font-black md:text-3xl">🛟 תמיכה ופניות</h1>
        <p className="mt-1 text-sm text-ink-400">
          נתקלת בבעיה בסטרימינג, בחיוב או בחשבון? שלח פנייה ונחזור אליך בהקדם (בדרך כלל תוך יום עסקים).
        </p>
        <div className="mt-6">
          <SupportForm />
        </div>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-bold">יצירת קשר מהירה</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-300">
            <li>📧 {SITE.supportEmail}</li>
            <li>💬 צ׳אט חי — זמין למנויי פלוס, ראשון–חמישי 9:00–18:00</li>
            <li>⏱️ זמן תגובה ממוצע: 6 שעות</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold">בעיות נפוצות</h2>
          <ul className="mt-2 space-y-2 text-xs text-ink-300">
            <li>
              <b className="text-ink-200">הווידאו לא נטען?</b> נסה לרענן (Ctrl+F5). אם זה נמשך — בדוק את מהירות החיבור ונסה איכות נמוכה יותר מהתפריט בנגן.
            </li>
            <li>
              <b className="text-ink-200">אין כתוביות?</b> בנגן לחץ על כפתור הכתוביות ובחר עברית. אם הן עדיין לא מופיעות — ייתכן שלא הועלו לפרק.
            </li>
            <li>
              <b className="text-ink-200">ננעלתי אחרי כמה ניסיונות התחברות?</b> ההמתנה קצרה (עד שעתיים). אפשר לאפס סיסמה כדי להתחבר מיד.
            </li>
            <li>
              <b className="text-ink-200">איך משדרגים לפלוס?</b> עמוד המנויים → בחר פלוס → 7 ימי ניסיון חינם.
            </li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
