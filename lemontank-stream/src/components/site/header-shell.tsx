"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchBox } from "./search-box";
import { UserMenu } from "./user-menu";
import type { SessionUser } from "@/lib/session";

const NAV = [
  { href: "/", label: "בית" },
  { href: "/movies", label: "סרטים" },
  { href: "/series", label: "סדרות" },
  { href: "/new", label: "חדש" },
  { href: "/popular", label: "פופולרי" },
  { href: "/genres", label: "ז'אנרים" },
  { href: "/live", label: "שידור חי" },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/**
 * כותרת האתר — שקופה מעל התוכן, מתחזקת לזכוכית בגלילה.
 * הניווט מציג מצב פעיל עם קו לימוני זוהר, ובמובייל נגלל אופקית.
 */
export function HeaderShell({
  user,
  notifications,
  isStaffUser,
}: {
  user: SessionUser | null;
  notifications: number;
  isStaffUser: boolean;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-500 [transition-timing-function:var(--ease-cinema)] ${
        scrolled
          ? "border-b border-white/[0.07] bg-ink-950/80 shadow-[0_18px_50px_-30px_rgba(0,0,0,1)] backdrop-blur-2xl"
          : "border-b border-transparent bg-gradient-to-b from-ink-950/90 via-ink-950/40 to-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3">
        {/* לוגו */}
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="LemonTank Stream — דף הבית">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-lemon-400/30 bg-lemon-400/10 text-lg shadow-[0_0_22px_-6px_rgba(247,194,43,0.7)] transition-transform duration-300 group-hover:scale-105"
            aria-hidden="true"
          >
            🍋
          </span>
          <span className="hidden text-lg font-black tracking-tight sm:block">
            Lemon<span className="text-gradient">Tank</span>
          </span>
        </Link>

        {/* ניווט ראשי */}
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="ניווט ראשי">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-xl px-3 py-2 text-sm transition-colors duration-200 ${
                  active ? "font-bold text-white" : "text-ink-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-2.5 -bottom-0.5 h-[2px] rounded-full bg-gradient-to-l from-lemon-300 to-lemon-500 transition-opacity duration-300 ${
                    active ? "opacity-100 shadow-[0_0_12px_1px_rgba(247,194,43,0.8)]" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </nav>

        <div className="mx-auto w-full max-w-md">
          <SearchBox compact />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <>
              {user.effective_plan !== "plus" ? (
                <Link
                  href="/plans"
                  className="hidden rounded-full bg-gradient-to-l from-plus-500 to-plus-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-[0_8px_24px_-10px_rgba(139,92,246,1)] transition hover:brightness-110 sm:block"
                >
                  ⭐ שדרג לפלוס
                </Link>
              ) : null}
              {isStaffUser ? (
                <Link
                  href="/admin"
                  className="hidden rounded-xl border border-lemon-400/40 bg-lemon-400/5 px-3 py-1.5 text-xs font-bold text-lemon-300 transition hover:bg-lemon-400/15 sm:block"
                >
                  ניהול
                </Link>
              ) : null}
              <UserMenu user={user} notifications={notifications} />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-xl px-3 py-2 text-sm text-ink-200 transition hover:bg-white/[0.06] hover:text-white">
                התחברות
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-gradient-to-b from-lemon-300 to-lemon-400 px-4 py-2 text-sm font-extrabold text-ink-950 shadow-[0_10px_30px_-12px_rgba(247,194,43,0.8)] transition hover:brightness-105"
              >
                הרשמה חינם
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ניווט מובייל */}
      <nav className="no-scrollbar flex gap-1.5 overflow-x-auto border-t border-white/[0.05] px-3 py-2 lg:hidden" aria-label="ניווט מובייל">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs transition ${
                active
                  ? "bg-lemon-400/15 font-bold text-lemon-200 ring-1 ring-lemon-400/30"
                  : "text-ink-300 hover:bg-white/[0.06]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {user ? (
          <Link href="/my-list" className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs text-ink-300 hover:bg-white/[0.06]">
            הרשימה שלי
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
