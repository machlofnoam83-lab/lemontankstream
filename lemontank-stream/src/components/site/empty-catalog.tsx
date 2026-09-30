import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { OrnamentRule } from "@/components/ui/ornaments";

/**
 * מוצג כשהקטלוג עוד ריק (אין סרטים, סדרות או פרקים).
 *
 * שני קהלים שונים לגמרי, ובכוונה שני מסכים ולא אחד:
 *   • הבעלים/הצוות — "שולחן העבודה": איפה מוסיפים תוכן, בדיוק באיזה מסך.
 *   • צופה אקראי — לא רואה "מערכת ריקה" אלא ארכיון שנפתח, עם הזמנה להירשם.
 */
export function EmptyCatalog({ isStaff, className = "" }: { isStaff: boolean; className?: string }) {
  if (isStaff) {
    const actions: { href: string; icon: IconName; title: string; hint: string }[] = [
      { href: "/admin/titles/new", icon: "film", title: "הוספת סרט", hint: "שם, שנה, תמונה, סרטון, והרשאת צפייה" },
      { href: "/admin/titles/new", icon: "reel", title: "הוספת סדרה", hint: "ואז ״ניהול פרקים״ לעונות ולפרקים" },
      { href: "/admin/live", icon: "wifi", title: "ערוץ שידור חי", hint: "כתובת HLS/MP4, לוגו וקטגוריה" },
      { href: "/admin/import", icon: "download", title: "ייבוא מרוכז", hint: "העלאת רשימת כותרים מ-JSON" },
    ];

    return (
      <section className={`card-surface chamfer relative p-6 md:p-8 ${className}`} aria-label="מצב מנהל">
        <span aria-hidden="true" className="pointer-events-none absolute inset-[6px] border border-brass-400/10" />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-brass-300/90">
              <Icon name="wrench" className="size-3.5" />
              מצב מנהל · הקטלוג ריק
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-parchment-50 md:text-3xl">
              הארכיון בנוי. עכשיו מניחים בו את המדפים הראשונים.
            </h2>
            <p className="mt-2 text-base leading-relaxed text-parchment-200/80">
              המערכת נטענה נקייה — בלי תוכן לדוגמה. כל סרט, סדרה, פרק וערוץ שתוסיף יופיע כאן מיד.
              לכל כותר אתה קובע אם הוא <b className="text-parchment-100">חינם</b> או{" "}
              <b className="text-brass-300">פלוס</b>, ולסדרה אפשר לקבוע גם לכל פרק בנפרד.
            </p>
          </div>
          <span className="flex size-16 shrink-0 items-center justify-center border border-brass-400/30 bg-brass-400/[0.06] text-brass-300 chamfer" aria-hidden="true">
            <Icon name="quill" className="size-7" />
          </span>
        </div>

        <OrnamentRule className="my-6" />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {actions.map((item, index) => (
            <Link
              key={item.title}
              href={item.href}
              className="group reveal-item border border-brass-400/16 bg-obsidian-900/50 p-4 chamfer transition duration-500 hover:border-brass-300/55 hover:bg-obsidian-850/70"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <span className="flex size-10 items-center justify-center border border-brass-400/25 bg-brass-400/[0.07] text-brass-300 chamfer transition group-hover:border-brass-300/60 group-hover:text-brass-200">
                <Icon name={item.icon} className="size-5" />
              </span>
              <p className="mt-3 font-display text-lg font-bold text-parchment-100 group-hover:text-brass-200">{item.title}</p>
              <p className="mt-1 text-sm text-parchment-300/70">{item.hint}</p>
            </Link>
          ))}
        </div>

        <p className="mt-5 text-sm text-parchment-300/60">
          רוצה לראות איך זה נראה עם תוכן לפני שאתה מעלה את שלך?{" "}
          <span dir="ltr" className="font-mono text-parchment-200/80">node scripts/seed.mjs --reset --demo</span> · למחיקה:{" "}
          <span dir="ltr" className="font-mono text-parchment-200/80">node scripts/clear-content.mjs --yes --users</span>
        </p>
      </section>
    );
  }

  return (
    <section className={`card-surface chamfer relative p-8 text-center ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-[6px] border border-brass-400/10" />
      <span className="mx-auto flex size-16 items-center justify-center border border-brass-400/30 bg-brass-400/[0.06] text-brass-300 chamfer" aria-hidden="true">
        <Icon name="lantern" className="size-7" />
      </span>
      <h2 className="mt-4 font-display text-2xl font-bold text-parchment-50 md:text-3xl">הארכיון נפתח לאט</h2>
      <p className="mx-auto mt-2 max-w-lg text-base leading-relaxed text-parchment-200/80">
        אנחנו מסדרים את המדפים בימים אלה. פתחו חשבון חינם ותהיו הראשונים לדעת —
        ברגע שהתוכן יעלה, הוא יחכה לכם כאן.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/register" className="btn-primary sheen">
          <Icon name="key" className="size-4" />
          פתחו חשבון חינם
        </Link>
        <Link
          href="/plans"
          className="inline-flex items-center gap-2 border border-brass-400/35 px-5 py-3 text-sm font-bold text-parchment-100 chamfer transition hover:border-brass-300/70 hover:bg-obsidian-850/60"
        >
          <Icon name="tag" className="size-4" />
          למסלולים ולמחירים
        </Link>
      </div>
    </section>
  );
}
