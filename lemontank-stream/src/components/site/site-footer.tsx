import Link from "next/link";
import { catalogStats } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { NewsletterSignup } from "./newsletter-form";
import { Icon } from "@/components/ui/icons";
import { LogoMark } from "@/components/ui/logo";
import { OrnamentRule } from "@/components/ui/ornaments";

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
        { href: "/account/achievements", label: "ההישגים שלי" },
        { href: "/account/party", label: "צפייה משותפת" },
        { href: "/account/developer", label: "מפתחים ו-API" },
        { href: "/support", label: "תמיכה ויצירת קשר" },
      ],
    },
  ];

  return (
    <footer className="relative mt-20 border-t border-brass-400/15 bg-gradient-to-b from-obsidian-950/60 to-obsidian-950">
      <div className="h-px w-full bg-gradient-to-l from-transparent via-brass-500/40 to-transparent" aria-hidden="true" />

      <div className="mx-auto grid max-w-[1500px] gap-10 px-4 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-10" />
            <span className="font-display text-xl font-bold tracking-tight text-parchment-100">
              Lemon<span className="text-brass-300">Tank</span>
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-parchment-300/70">
            פלטפורמת סטרימינג ישראלית — סרטים, סדרות ושידורים חיים בעברית. מנוי חינם לכל, ומנוי פלוס לאיכות 4K ולהורדות.
          </p>
          <div className="mt-5">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-parchment-200">
              <Icon name="mail" className="size-4 text-brass-300" />
              עדכון שבועי — מה חדש בקטלוג
            </div>
            <div className="mt-2">
              <NewsletterSignup compact />
            </div>
            <p className="mt-1.5 text-[0.8rem] text-parchment-300/50">בלי ספאם. הסרה בלחיצה אחת.</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 border border-brass-400/20 bg-brass-400/[0.05] px-2.5 py-1 font-mono text-[0.72rem] text-parchment-200/80">
              <Icon name="shield-check" className="size-3.5 text-verdigris-400" />
              scrypt · CSP
            </span>
            <span className="inline-flex items-center gap-1.5 border border-brass-400/20 bg-brass-400/[0.05] px-2.5 py-1 font-mono text-[0.72rem] text-parchment-200/80">
              <Icon name="monitor" className="size-3.5 text-brass-300" />
              4K · Dolby
            </span>
          </div>
        </div>

        {links.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold tracking-tight text-parchment-100">
              <Icon name={group.title === "קטלוג" ? "film" : "user"} className="size-4 text-brass-400/90" />
              {group.title}
            </h3>
            <OrnamentRule className="mb-4" />
            <ul className="space-y-2.5 text-sm text-parchment-300/70">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-brass-200"
                  >
                    <span className="h-px w-2.5 bg-brass-400/40 transition-all duration-300 group-hover:w-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold tracking-tight text-parchment-100">
            <Icon name="chart" className="size-4 text-brass-400/90" />
            במספרים
          </h3>
          <OrnamentRule className="mb-4" />
          <dl className="space-y-2.5 text-sm">
            {[
              { label: "סרטים", value: stats.movies },
              { label: "סדרות", value: stats.series },
              { label: "פרקים", value: stats.episodes },
              { label: "צופים רשומים", value: stats.users },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-brass-400/12 pb-2">
                <dt className="text-parchment-300/70">{row.label}</dt>
                <dd className="font-mono font-bold tabular-nums text-brass-200">{formatNumber(row.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="border-t border-brass-400/12">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-parchment-300/60 sm:flex-row">
          <span>© {new Date().getFullYear()} LemonTank Stream — כל הזכויות שמורות.</span>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link href="/legal/terms" className="transition-colors hover:text-brass-200">
              תנאי שימוש
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-brass-200">
              מדיניות פרטיות
            </Link>
            <Link href="/legal/accessibility" className="transition-colors hover:text-brass-200">
              נגישות
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
