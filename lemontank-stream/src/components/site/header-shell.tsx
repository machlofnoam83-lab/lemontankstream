"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchBox } from "./search-box";
import { UserMenu } from "./user-menu";
import { Icon } from "@/components/ui/icons";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import type { SessionUser } from "@/lib/session";

const NAV = [
  { href: "/", label: "בית" },
  { href: "/movies", label: "סרטים" },
  { href: "/series", label: "סדרות" },
  { href: "/new", label: "חדש" },
  { href: "/popular", label: "פופולרי" },
  { href: "/genres", label: "ז׳אנרים" },
  { href: "/live", label: "שידור חי" },
  { href: "/account/party", label: "צפייה משותפת" },
  { href: "/requests", label: "בקשו כותר" },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/**
 * כותרת האתר — "לוח השיש בכניסה".
 *
 * בתחילת העמוד היא צפה מעל התמונה בשקיפות מדורגת; בגלילה היא מתעבה למשטח
 * אובסידיאן עם קו פליז תחתון שנמשך (אנימציה, לא קפיצה). הניווט מציג מצב פעיל
 * בקו פליז זוהר עדין — לא "כפתור מודגש".
 */
export function HeaderShell({
  user,
  notifications,
  isStaffUser,
  profile,
}: {
  user: SessionUser | null;
  notifications: number;
  isStaffUser: boolean;
  profile: { id: number; name: string; avatar_url: string | null; is_kid: number } | null;
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
      className={`sticky top-0 z-40 transition-all duration-700 [transition-timing-function:var(--ease-ink)] ${
        scrolled
          ? "bg-obsidian-950/92 shadow-[0_18px_50px_-30px_rgba(0,0,0,1)] backdrop-blur-xl"
          : "bg-gradient-to-b from-obsidian-950/95 via-obsidian-950/55 to-transparent"
      }`}
    >
      {/* קו פליז עליון — "קו האור" של הארכיון */}
      <div className="h-px w-full bg-gradient-to-l from-transparent via-brass-500/45 to-transparent" aria-hidden="true" />

      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="LemonTank Stream — דף הבית">
          <span className="transition-transform duration-500 [transition-timing-function:var(--ease-ink)] group-hover:-translate-y-0.5 group-hover:rotate-[-3deg]">
            <LogoMark className="size-9" />
          </span>
          <Wordmark className="hidden sm:flex" />
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
                className={`relative px-3 py-2 font-display text-[0.98rem] transition-colors duration-300 ${
                  active ? "font-bold text-parchment-50" : "text-parchment-300/75 hover:text-parchment-100"
                }`}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-2.5 -bottom-[3px] h-px origin-center bg-gradient-to-l from-transparent via-brass-300 to-transparent transition-transform duration-500 [transition-timing-function:var(--ease-ink)] ${
                    active ? "scale-x-100 shadow-[0_0_10px_0_rgba(224,188,120,0.75)]" : "scale-x-0"
                  }`}
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
                  className="hidden items-center gap-1.5 border border-brass-400/40 bg-brass-400/[0.08] px-3 py-1.5 text-xs font-bold text-brass-200 chamfer transition hover:border-brass-300/70 hover:bg-brass-400/15 sm:inline-flex"
                >
                  <Icon name="crown" className="size-3.5" />
                  שדרג לפלוס
                </Link>
              ) : null}
              {isStaffUser ? (
                <Link
                  href="/admin"
                  className="hidden items-center gap-1.5 border border-oxblood-500/45 bg-oxblood-500/10 px-3 py-1.5 text-xs font-bold text-parchment-100 chamfer transition hover:bg-oxblood-500/20 sm:inline-flex"
                >
                  <Icon name="wrench" className="size-3.5" />
                  ניהול
                </Link>
              ) : null}
              {profile ? (
                <Link
                  href="/profiles"
                  title="החלפת פרופיל"
                  className="hidden items-center gap-2 border border-brass-400/20 bg-obsidian-900/60 py-1 pl-3 pr-1 text-sm text-parchment-200 chamfer transition hover:border-brass-300/50 sm:flex"
                >
                  <span className="max-w-[7rem] truncate">{profile.name}</span>
                  {profile.is_kid ? <span className="badge-free">ילדים</span> : null}
                  <span className="flex size-7 items-center justify-center overflow-hidden border border-brass-400/30 bg-brass-400 text-obsidian-950">
                    {profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt="" className="size-7 object-cover" />
                    ) : (
                      <span className="font-display text-sm font-bold">{profile.name.slice(0, 1)}</span>
                    )}
                  </span>
                </Link>
              ) : null}
              <UserMenu user={user} notifications={notifications} />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 border border-brass-400/25 px-3 py-2 font-display text-sm text-parchment-200 chamfer transition hover:border-brass-300/60 hover:text-parchment-50"
              >
                <Icon name="door" className="size-4" />
                התחברות
              </Link>
              <Link href="/register" className="btn-primary sheen text-sm">
                <Icon name="key" className="size-4" />
                הרשמה חינם
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ניווט מובייל */}
      <nav className="no-scrollbar flex gap-1.5 overflow-x-auto border-t border-brass-400/10 px-3 py-2 lg:hidden" aria-label="ניווט מובייל">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border px-3.5 py-1.5 font-display text-sm transition ${
                active
                  ? "border-brass-300/50 bg-brass-400/10 text-brass-100"
                  : "border-transparent text-parchment-300/75 hover:border-brass-400/20 hover:text-parchment-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {user ? (
          <Link
            href="/my-list"
            className="whitespace-nowrap border border-transparent px-3.5 py-1.5 font-display text-sm text-parchment-300/75 transition hover:border-brass-400/20 hover:text-parchment-100"
          >
            הרשימה שלי
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
