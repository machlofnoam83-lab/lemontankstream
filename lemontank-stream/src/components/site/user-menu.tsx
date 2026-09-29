"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Icon, type IconName } from "@/components/ui/icons";
import { OrnamentRule } from "@/components/ui/ornaments";
import type { SessionUser } from "@/lib/session";

/** תפריט המשתמש: פרופיל, מנוי, ניהול, התנתקות — נפתח כמו מגירה מעץ */
export function UserMenu({ user, notifications = 0 }: { user: SessionUser; notifications?: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const logout = async () => {
    setLoading(true);
    await apiCall("/api/auth/logout", { method: "POST", body: {} });
    setLoading(false);
    setOpen(false);
    router.push("/");
    router.refresh();
  };

  const initial = (user.name || user.email).trim().charAt(0);
  const isStaff = ["editor", "admin", "owner"].includes(user.role);

  const groups: { items: { href: string; label: string; icon: IconName; badge?: number }[] }[] = [
    {
      items: [
        { href: "/account", label: "החשבון שלי", icon: "user" },
        { href: "/profiles", label: "מי צופה? (החלפת פרופיל)", icon: "mask" },
        { href: "/account/profiles", label: "ניהול פרופילים", icon: "users" },
      ],
    },
    {
      items: [
        { href: "/lists", label: "הרשימות שלי", icon: "list" },
        { href: "/my-list", label: "הרשימה שלי", icon: "tag" },
        { href: "/account/history", label: "היסטוריית צפייה", icon: "clock" },
        { href: "/wrapped", label: "השנה שלי", icon: "sparkles" },
        { href: "/account/downloads", label: "הורדות ומכשירים", icon: "download" },
        { href: "/notifications", label: "התראות", icon: "bell", badge: notifications },
      ],
    },
    {
      items: [
        { href: "/account/security", label: "אבטחה ומכשירים", icon: "lock" },
        { href: "/plans", label: user.effective_plan === "plus" ? "המנוי שלי" : "שדרג לפלוס", icon: "wallet" },
      ],
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-2 border border-brass-400/22 bg-obsidian-900/70 p-1 pl-3 chamfer transition hover:border-brass-300/55 hover:bg-obsidian-850/80"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="תפריט משתמש"
      >
        <span className="relative">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="size-7 object-cover" />
          ) : (
            <span className="flex size-7 items-center justify-center bg-gradient-to-b from-brass-300 to-brass-500 font-display text-sm font-bold text-obsidian-950">
              {initial}
            </span>
          )}
          {notifications > 0 ? (
            <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center border border-obsidian-950 bg-oxblood-500 px-1 font-mono text-[0.68rem] font-bold text-parchment-50">
              {notifications > 9 ? "9+" : notifications}
            </span>
          ) : null}
        </span>
        <span className="hidden font-display text-sm text-parchment-200 md:inline">{user.name}</span>
        <span className={user.effective_plan === "plus" ? "badge-plus" : "badge-free"}>
          {user.effective_plan === "plus" ? "פלוס" : "חינם"}
        </span>
        <Icon
          name="chevron-down"
          className={`size-4 text-brass-300/70 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute left-0 z-50 mt-2 w-64 origin-top border border-brass-400/25 bg-obsidian-900/97 py-1 shadow-[0_30px_70px_-30px_rgba(0,0,0,1)] backdrop-blur-xl animate-ink-in chamfer"
          >
            <div className="px-4 py-3">
              <div className="truncate font-display text-[1.02rem] font-bold text-parchment-100">{user.name}</div>
              <div className="truncate font-mono text-[0.72rem] text-parchment-300/60" dir="ltr">
                {user.email}
              </div>
            </div>
            <OrnamentRule className="mx-3 mb-1" />

            {groups.map((group, groupIndex) => (
              <div key={groupIndex}>
                {groupIndex > 0 ? <OrnamentRule className="mx-3 my-1.5" /> : null}
                {group.items.map((item, itemIndex) => (
                  <MenuLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    badge={item.badge}
                    delay={itemIndex * 25}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </MenuLink>
                ))}
              </div>
            ))}

            {isStaff ? (
              <>
                <OrnamentRule className="mx-3 my-1.5" />
                <MenuLink href="/admin" icon="wrench" onClick={() => setOpen(false)}>
                  פאנל ניהול
                </MenuLink>
              </>
            ) : null}

            <OrnamentRule className="mx-3 my-1.5" />
            <button
              type="button"
              onClick={logout}
              disabled={loading}
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2 text-right text-sm text-ember-300 transition hover:bg-ember-500/10 disabled:opacity-50"
            >
              <Icon name="door" className="size-4" />
              {loading ? "מתנתק…" : "התנתקות"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  children,
  onClick,
  icon,
  badge,
  delay = 0,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
  icon: IconName;
  badge?: number;
  delay?: number;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      role="menuitem"
      style={{ animationDelay: `${delay}ms` }}
      className="group flex items-center gap-2.5 px-4 py-2 text-sm text-parchment-200/90 reveal-item transition hover:bg-brass-400/[0.07] hover:text-parchment-50"
    >
      <Icon name={icon} className="size-4 text-brass-400/80 transition group-hover:text-brass-200" />
      <span className="flex-1">{children}</span>
      {badge ? (
        <span className="border border-brass-400/30 px-1.5 font-mono text-[0.7rem] text-brass-200 tabular-nums">{badge}</span>
      ) : null}
    </Link>
  );
}
