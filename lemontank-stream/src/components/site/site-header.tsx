import Link from "next/link";
import { SearchBox } from "./search-box";
import { UserMenu } from "./user-menu";
import { count } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { isStaff } from "@/lib/rbac";

const NAV = [
  { href: "/", label: "בית" },
  { href: "/movies", label: "סרטים" },
  { href: "/series", label: "סדרות" },
  { href: "/new", label: "חדש" },
  { href: "/popular", label: "פופולרי" },
  { href: "/genres", label: "ז'אנרים" },
  { href: "/live", label: "שידור חי" },
];

export function SiteHeader({ user }: { user: SessionUser | null }) {
  const notifications = user
    ? count("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL", [user.id])
    : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="LemonTank Stream — דף הבית">
          <span className="text-2xl" aria-hidden="true">🍋</span>
          <span className="hidden text-lg font-black tracking-tight sm:block">
            Lemon<span className="text-lemon-400">Tank</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="ניווט ראשי">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-ink-200 transition-colors hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mx-auto w-full max-w-md">
          <SearchBox compact />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <>
              {user.effective_plan !== "plus" ? (
                <Link href="/plans" className="hidden rounded-full bg-gradient-to-l from-plus-500 to-plus-600 px-3.5 py-1.5 text-xs font-bold text-white hover:brightness-110 sm:block">
                  ⭐ שדרג לפלוס
                </Link>
              ) : null}
              {isStaff(user.role) ? (
                <Link href="/admin" className="hidden rounded-lg border border-lemon-400/40 px-3 py-1.5 text-xs font-semibold text-lemon-300 hover:bg-lemon-400/10 sm:block">
                  ניהול
                </Link>
              ) : null}
              <UserMenu user={user} notifications={notifications} />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-ink-200 hover:bg-white/5 hover:text-white">
                התחברות
              </Link>
              <Link href="/register" className="rounded-lg bg-lemon-400 px-3.5 py-2 text-sm font-bold text-ink-900 hover:bg-lemon-300">
                הרשמה חינם
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ניווט מובייל */}
      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-white/5 px-3 py-2 lg:hidden" aria-label="ניווט מובייל">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs text-ink-200 hover:bg-white/5">
            {item.label}
          </Link>
        ))}
        {user ? <Link href="/my-list" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs text-ink-200 hover:bg-white/5">הרשימה שלי</Link> : null}
      </nav>
    </header>
  );
}
