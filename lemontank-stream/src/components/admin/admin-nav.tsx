"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS: { title: string; items: { href: string; label: string; icon: string; minRole?: string }[] }[] = [
  {
    title: "סקירה",
    items: [
      { href: "/admin", label: "דשבורד", icon: "📊" },
      { href: "/admin/analytics", label: "אנליטיקה", icon: "📈" },
      { href: "/admin/insights", label: "תובנות והכנסות", icon: "💰" },
    ],
  },
  {
    title: "תוכן",
    items: [
      { href: "/admin/titles", label: "סרטים וסדרות", icon: "🎬" },
      { href: "/admin/collections", label: "אוספים ושורות", icon: "🗂️" },
      { href: "/admin/genres", label: "ז'אנרים", icon: "🏷️" },
      { href: "/admin/live", label: "שידורים חיים", icon: "📡" },
      { href: "/admin/promos", label: "קמפיינים ובאנרים", icon: "📣" },
      { href: "/admin/import", label: "ייבוא / ייצוא", icon: "📥" },
      { href: "/admin/requests", label: "בקשות תוכן", icon: "🗳️" },
    ],
  },
  {
    title: "משתמשים והכנסות",
    items: [
      { href: "/admin/users", label: "משתמשים", icon: "👥" },
      { href: "/admin/plans", label: "מסלולי מנוי", icon: "💳" },
      { href: "/admin/coupons", label: "קופונים", icon: "🏷️" },
      { href: "/admin/subscriptions", label: "מנויים ותשלומים", icon: "🧾" },
      { href: "/admin/newsletter", label: "רשימת תפוצה", icon: "📬" },
    ],
  },
  {
    title: "קהילה",
    items: [
      { href: "/admin/badges", label: "הישגים ותגים", icon: "🏆" },
    ],
  },
  {
    title: "מערכת ואבטחה",
    items: [
      { href: "/admin/security", label: "בקרת אבטחה", icon: "🛡️" },
      { href: "/admin/fortress", label: "המבצר", icon: "🏰" },
      { href: "/admin/audit", label: "יומן ביקורת", icon: "📜" },
      { href: "/admin/settings", label: "הגדרות מערכת", icon: "⚙️" },
      { href: "/admin/features", label: "מתגי פיצ'רים", icon: "🎛️" },
      { href: "/admin/health", label: "בריאות המערכת", icon: "💚" },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);
const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

/** ניווט צד בפאנל הניהול — סקשנים, מצב פעיל מודגש, וגלילה אופקית במובייל */
export function AdminNav({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <>
      {/* מובייל: רצועת ניווט נגללת */}
      <nav className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto border-b border-white/[0.06] px-4 pb-2.5 lg:hidden" aria-label="ניווט פאנל ניהול (מובייל)">
        {ALL_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs transition ${
                active
                  ? "bg-lemon-400/15 font-bold text-lemon-200 ring-1 ring-lemon-400/35"
                  : "text-ink-300 hover:bg-white/[0.06]"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* דסקטופ: סרגל צד */}
      <nav className="hidden w-60 shrink-0 lg:block" aria-label="ניווט פאנל ניהול">
        <div className="sticky top-24 space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="mb-2 px-3 text-[0.82rem] font-black uppercase tracking-[0.14em] text-ink-500">{section.title}</h2>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-250 [transition-timing-function:var(--ease-cinema)] ${
                          active
                            ? "bg-gradient-to-l from-lemon-400/[0.16] to-transparent font-bold text-lemon-200"
                            : "text-ink-300 hover:bg-white/[0.05] hover:text-white"
                        }`}
                      >
                        {active ? (
                          <span className="absolute inset-y-1.5 right-0 w-[3px] rounded-full bg-gradient-to-b from-lemon-300 to-lemon-500 shadow-[0_0_14px_1px_rgba(247,194,43,0.7)]" aria-hidden="true" />
                        ) : null}
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-lg text-[0.95rem] transition-colors ${
                            active ? "bg-lemon-400/15" : "bg-white/[0.04] group-hover:bg-white/[0.08]"
                          }`}
                          aria-hidden="true"
                        >
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="card-surface rounded-2xl p-3.5 text-[0.85rem] leading-relaxed text-ink-400">
            <p className="font-bold text-ink-200">מחובר כ: {role}</p>
            <p className="mt-1">ההרשאות נאכפות בצד השרת בכל בקשה — לא בממשק.</p>
          </div>
        </div>
      </nav>
    </>
  );
}
