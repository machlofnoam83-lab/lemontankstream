"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import type { SessionUser } from "@/lib/session";

/** תפריט המשתמש: פרופיל, מנוי, ניהול, התנתקות */
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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 pl-3 hover:bg-white/10"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="תפריט משתמש"
      >
        <span className="relative">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lemon-400 text-sm font-bold text-ink-900">{initial}</span>
          )}
          {notifications > 0 ? (
            <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.75rem] font-bold">
              {notifications > 9 ? "9+" : notifications}
            </span>
          ) : null}
        </span>
        <span className="hidden text-sm md:inline">{user.name}</span>
        <span className={user.effective_plan === "plus" ? "badge-plus" : "badge-free"}>{user.effective_plan === "plus" ? "פלוס" : "חינם"}</span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" className="absolute left-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-ink-850/98 py-1 shadow-2xl backdrop-blur">
            <div className="border-b border-white/10 px-4 py-2.5">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="truncate text-[0.85rem] text-ink-400">{user.email}</div>
            </div>
            <MenuLink href="/account" onClick={() => setOpen(false)}>👤 החשבון שלי</MenuLink>
            <MenuLink href="/profiles" onClick={() => setOpen(false)}>🎭 מי צופה? (החלפת פרופיל)</MenuLink>
            <MenuLink href="/account/profiles" onClick={() => setOpen(false)}>👨‍👩‍👧 ניהול פרופילים</MenuLink>
            <MenuLink href="/lists" onClick={() => setOpen(false)}>📚 הרשימות שלי</MenuLink>
            <MenuLink href="/my-list" onClick={() => setOpen(false)}>🔖 הרשימה שלי</MenuLink>
            <MenuLink href="/account/history" onClick={() => setOpen(false)}>🕘 היסטוריית צפייה</MenuLink>
            <MenuLink href="/wrapped" onClick={() => setOpen(false)}>🎞️ השנה שלי</MenuLink>
            <MenuLink href="/account/downloads" onClick={() => setOpen(false)}>📥 הורדות ומכשירים</MenuLink>
            <MenuLink href={`/notifications`} onClick={() => setOpen(false)}>
              🔔 התראות {notifications > 0 ? <span className="ms-1 rounded-full bg-red-500 px-1.5 text-[0.8rem]">{notifications}</span> : null}
            </MenuLink>
            <MenuLink href="/account/security" onClick={() => setOpen(false)}>🔐 אבטחה ומכשירים</MenuLink>
            <MenuLink href="/plans" onClick={() => setOpen(false)}>
              {user.effective_plan === "plus" ? "💳 המנוי שלי" : "⭐ שדרג לפלוס"}
            </MenuLink>
            {isStaff ? <MenuLink href="/admin" onClick={() => setOpen(false)}>🛠️ פאנל ניהול</MenuLink> : null}
            <div className="my-1 border-t border-white/10" />
            <button
              onClick={logout}
              disabled={loading}
              className="w-full px-4 py-2 text-right text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              role="menuitem"
            >
              {loading ? "מתנתק…" : "🚪 התנתקות"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} role="menuitem" className="block px-4 py-2 text-sm text-ink-200 hover:bg-white/5 hover:text-white">
      {children}
    </Link>
  );
}
