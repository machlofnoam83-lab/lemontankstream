import Link from "next/link";
import { Card } from "@/components/ui/primitives";

/**
 * מוצג כשהקטלוג עוד ריק (אין סרטים, סדרות או פרקים).
 *
 * שני קהלים שונים לגמרי:
 *   • הבעלים/הצוות — צריך לדעת מיד איפה מוסיפים תוכן.
 *   • צופה אקראי — לא צריך לראות "מערכת ריקה", אלא אתר בהקמה עם הצעה להירשם.
 */
export function EmptyCatalog({ isStaff, className = "" }: { isStaff: boolean; className?: string }) {
  if (isStaff) {
    return (
      <Card className={`p-6 md:p-8 ${className}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-bold text-lemon-300">מצב מנהל · הקטלוג ריק</p>
            <h2 className="mt-1 text-2xl font-black">האתר מוכן — עכשיו מוסיפים תוכן 🎬</h2>
            <p className="mt-2 text-sm text-ink-300">
              המערכת נטענה נקייה בלי תוכן דמו. כל הסרטים, הסדרות, הפרקים והערוצים שתוסיף יופיעו כאן מיד.
              באתר הזה, בכל כותר אתה בוחר אם הוא <b className="text-ink-100">חינם</b> או <b className="text-plus-400">פלוס</b>,
              ולסדרה אפשר לקבוע גם לכל פרק בנפרד.
            </p>
          </div>
          <span className="text-5xl" aria-hidden="true">🍋</span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/admin/titles/new", icon: "🎬", title: "הוספת סרט", hint: "שם, שנה, תמונה, סרטון והרשאה" },
            { href: "/admin/titles/new", icon: "📺", title: "הוספת סדרה", hint: "ואז “ניהול פרקים” להעלאת עונות ופרקים" },
            { href: "/admin/live", icon: "📡", title: "ערוץ שידור חי", hint: "כתובת HLS/MP4, לוגו וקטגוריה" },
            { href: "/admin/import", icon: "📥", title: "ייבוא מרוכז", hint: "העלאת רשימת כותרים מ-JSON" },
          ].map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-lemon-400/40 hover:bg-white/[0.06]"
            >
              <span className="text-2xl" aria-hidden="true">{item.icon}</span>
              <p className="mt-2 font-bold text-ink-100 group-hover:text-lemon-300">{item.title}</p>
              <p className="mt-1 text-[11px] text-ink-400">{item.hint}</p>
            </Link>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-ink-500">
          רוצה לראות איך זה נראה עם תוכן לפני שאתה מעלה את שלך?{" "}
          <span dir="ltr" className="font-mono text-ink-300">node scripts/seed.mjs --reset --demo</span> · למחיקה:{" "}
          <span dir="ltr" className="font-mono text-ink-300">node scripts/clear-content.mjs --yes --users</span>
        </p>
      </Card>
    );
  }

  return (
    <Card className={`p-8 text-center ${className}`}>
      <p className="text-4xl" aria-hidden="true">🍿</p>
      <h2 className="mt-3 text-2xl font-black">הקטלוג שלנו בהקמה</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-ink-300">
        אנחנו מעלים את הסרטים והסדרות בימים אלה. פתחו חשבון חינם ותהיו הראשונים לדעת —
        ברגע שהתוכן יעלה, הוא יחכה לכם כאן.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link href="/register" className="rounded-xl bg-lemon-400 px-6 py-3 text-sm font-black text-ink-900">פתחו חשבון חינם</Link>
        <Link href="/plans" className="rounded-xl border border-white/20 px-6 py-3 text-sm font-bold hover:bg-white/10">למסלולים ולמחירים</Link>
      </div>
    </Card>
  );
}
