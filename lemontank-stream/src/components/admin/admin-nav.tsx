"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS: { title: string; items: { href: string; label: string; icon: string; minRole?: string }[] }[] = [
  {
    title: "סקירה",
    items: [
      { href: "/admin", label: "דשבורד", icon: "📊" },
      { href: "/admin/analytics", label: "אנליטיקה", icon: "📈" },
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
    ],
  },
  {
    title: "משתמשים והכנסות",
    items: [
      { href: "/admin/users", label: "משתמשים", icon: "👥" },
      { href: "/admin/plans", label: "מסלולי מנוי", icon: "💳" },
      { href: "/admin/coupons", label: "קופונים", icon: "🏷️" },
      { href: "/admin/subscriptions", label: "מנויים ותשלומים", icon: "🧾" },
    ],
  },
  {
    title: "מערכת ואבטחה",
    items: [
      { href: "/admin/security", label: "בקרת אבטחה", icon: "🛡️" },
      { href: "/admin/audit", label: "יומן ביקורת", icon: "📜" },
      { href: "/admin/settings", label: "הגדרות מערכת", icon: "⚙️" },
      { href: "/admin/features", label: "מתגי פיצ'רים", icon: "🎛️" },
      { href: "/admin/health", label: "בריאות המערכת", icon: "💚" },
    ],
  },
];

/** ניווט צד בפאנל הניהול — עם הדגשה של הנתיב הנוכחי */
export function AdminNav({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 lg:block" aria-label="ניווט פאנל ניהול">
      <div className="sticky top-20 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-ink-500">{section.title}</h2>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                        active ? "bg-lemon-400/15 font-bold text-lemon-200" : "text-ink-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="card-surface rounded-xl p-3 text-[11px] text-ink-400">
          <p className="font-bold text-ink-200">תפקיד: {role}</p>
          <p className="mt-1">הרשאות נאכפות בצד השרת בכל בקשה — לא בממשק.</p>
        </div>
      </div>
    </nav>
  );
}
