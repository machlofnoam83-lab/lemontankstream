import Link from "next/link";
import { catalogStats } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";

export function SiteFooter() {
  let stats = { movies: 0, series: 0, episodes: 0, users: 0 };
  try {
    stats = catalogStats();
  } catch {
    /* המסד עוד לא אותחל */
  }

  return (
    <footer className="mt-16 border-t border-white/5 bg-ink-950/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-lg font-black">
            <span aria-hidden="true">🍋</span> Lemon<span className="text-lemon-400">Tank</span>
          </div>
          <p className="mt-2 text-sm text-ink-400">
            פלטפורמת סטרימינג ישראלית — סרטים, סדרות ושידורים חיים בעברית. מנוי חינם לכל, ומנוי פלוס לאיכות 4K ולהורדות.
          </p>
        </div>

        <nav aria-label="קטלוג">
          <h3 className="mb-3 text-sm font-bold text-white">קטלוג</h3>
          <ul className="space-y-2 text-sm text-ink-400">
            <li><Link href="/movies" className="hover:text-lemon-300">סרטים</Link></li>
            <li><Link href="/series" className="hover:text-lemon-300">סדרות</Link></li>
            <li><Link href="/new" className="hover:text-lemon-300">נוספו לאחרונה</Link></li>
            <li><Link href="/popular" className="hover:text-lemon-300">הנצפים ביותר</Link></li>
            <li><Link href="/live" className="hover:text-lemon-300">ערוצים בשידור חי</Link></li>
          </ul>
        </nav>

        <nav aria-label="חשבון">
          <h3 className="mb-3 text-sm font-bold text-white">החשבון שלי</h3>
          <ul className="space-y-2 text-sm text-ink-400">
            <li><Link href="/plans" className="hover:text-lemon-300">מנויים ומחירים</Link></li>
            <li><Link href="/account" className="hover:text-lemon-300">אזור אישי</Link></li>
            <li><Link href="/account/security" className="hover:text-lemon-300">אבטחה ואימות דו-שלבי</Link></li>
            <li><Link href="/my-list" className="hover:text-lemon-300">הרשימה שלי</Link></li>
            <li><Link href="/support" className="hover:text-lemon-300">תמיכה ויצירת קשר</Link></li>
          </ul>
        </nav>

        <div>
          <h3 className="mb-3 text-sm font-bold text-white">במספרים</h3>
          <dl className="space-y-2 text-sm text-ink-400">
            <div className="flex justify-between"><dt>סרטים</dt><dd className="font-semibold text-lemon-300">{formatNumber(stats.movies)}</dd></div>
            <div className="flex justify-between"><dt>סדרות</dt><dd className="font-semibold text-lemon-300">{formatNumber(stats.series)}</dd></div>
            <div className="flex justify-between"><dt>פרקים</dt><dd className="font-semibold text-lemon-300">{formatNumber(stats.episodes)}</dd></div>
            <div className="flex justify-between"><dt>צופים רשומים</dt><dd className="font-semibold text-lemon-300">{formatNumber(stats.users)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-ink-400 sm:flex-row">
          <span>© {new Date().getFullYear()} LemonTank Stream — כל הזכויות שמורות.</span>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/legal/terms" className="hover:text-lemon-300">תנאי שימוש</Link>
            <Link href="/legal/privacy" className="hover:text-lemon-300">מדיניות פרטיות</Link>
            <Link href="/legal/accessibility" className="hover:text-lemon-300">נגישות</Link>
            <span className="rounded-full border border-white/10 px-2 py-0.5">🔒 מאובטח ב-scrypt + CSP</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
