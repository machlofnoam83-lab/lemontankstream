import Link from "next/link";
import { catalogStats } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";

/** כותרת תחתונה — ניווט, מספרי הקטלוג והשורה המשפטית */
export function SiteFooter() {
  let stats = { movies: 0, series: 0, episodes: 0, users: 0 };
  try {
    stats = catalogStats();
  } catch {
    /* המסד עוד לא אותחל */
  }

  const links = [
    {
      title: "קטלוג",
      items: [
        { href: "/movies", label: "סרטים" },
        { href: "/series", label: "סדרות" },
        { href: "/new", label: "נוספו לאחרונה" },
        { href: "/popular", label: "הנצפים ביותר" },
        { href: "/genres", label: "ז'אנרים" },
        { href: "/live", label: "ערוצים בשידור חי" },
      ],
    },
    {
      title: "החשבון שלי",
      items: [
        { href: "/plans", label: "מנויים ומחירים" },
        { href: "/account", label: "אזור אישי" },
        { href: "/account/security", label: "אבטחה ואימות דו-שלבי" },
        { href: "/my-list", label: "הרשימה שלי" },
        { href: "/support", label: "תמיכה ויצירת קשר" },
      ],
    },
  ];

  return (
    <footer className="relative mt-20 border-t border-white/[0.07] bg-gradient-to-b from-ink-950/40 to-black/40">
      <div className="h-px w-full bg-gradient-to-l from-transparent via-lemon-400/25 to-transparent" aria-hidden="true" />

      <div className="mx-auto grid max-w-[1500px] gap-10 px-4 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-lemon-400/30 bg-lemon-400/10 text-xl shadow-[0_0_24px_-8px_rgba(247,194,43,0.8)]"
              aria-hidden="true"
            >
              🍋
            </span>
            <span className="text-xl font-black tracking-tight">
              Lemon<span className="text-gradient">Tank</span>
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">
            פלטפורמת סטרימינג ישראלית — סרטים, סדרות ושידורים חיים בעברית. מנוי חינם לכל, ומנוי פלוס לאיכות 4K ולהורדות.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[0.85rem] font-semibold text-ink-300">
              🔒 scrypt + CSP
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[0.85rem] font-semibold text-ink-300">
              ⚡ 4K · Dolby
            </span>
          </div>
        </div>

        {links.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h3 className="mb-4 text-sm font-black tracking-tight text-white">{group.title}</h3>
            <ul className="space-y-2.5 text-sm text-ink-400">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="inline-block transition-colors hover:text-lemon-300">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h3 className="mb-4 text-sm font-black tracking-tight text-white">במספרים</h3>
          <dl className="space-y-2.5 text-sm">
            {[
              { label: "סרטים", value: stats.movies },
              { label: "סדרות", value: stats.series },
              { label: "פרקים", value: stats.episodes },
              { label: "צופים רשומים", value: stats.users },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-white/[0.05] pb-2">
                <dt className="text-ink-400">{row.label}</dt>
                <dd className="font-black tabular-nums text-lemon-300">{formatNumber(row.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="border-t border-white/[0.05]">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-ink-400 sm:flex-row">
          <span>© {new Date().getFullYear()} LemonTank Stream — כל הזכויות שמורות.</span>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link href="/legal/terms" className="transition-colors hover:text-lemon-300">
              תנאי שימוש
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-lemon-300">
              מדיניות פרטיות
            </Link>
            <Link href="/legal/accessibility" className="transition-colors hover:text-lemon-300">
              נגישות
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
