import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { ToastProvider } from "@/components/ui/toast";
import { getCurrentUser } from "@/lib/session";
import { get } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/account", label: "סקירה", icon: "🏠" },
  { href: "/account/profiles", label: "פרופילים", icon: "👨‍👩‍👧" },
  { href: "/account/security", label: "אבטחה ומכשירים", icon: "🔐" },
  { href: "/account/billing", label: "מנוי ותשלומים", icon: "💳" },
  { href: "/account/history", label: "היסטוריית צפייה", icon: "🕘" },
  { href: "/account/privacy", label: "פרטיות ונתונים", icon: "🛡️" },
];

/** פריסת האזור האישי — דורשת התחברות */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const subscription = get<{ status: string; current_period_end: string | null; trial_end: string | null }>(
    "SELECT status, current_period_end, trial_end FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [user.id],
  );

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader user={user} />
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside className="space-y-4">
              <div className="card-surface rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lemon-400 text-xl font-black text-ink-900">
                    {(user.name || user.email).charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-bold">{user.name}</div>
                    <div className="truncate text-[11px] text-ink-400">{user.email}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={user.effective_plan === "plus" ? "badge-plus" : "badge-free"}>
                    {user.effective_plan === "plus" ? "⭐ מנוי פלוס" : "מנוי חינם"}
                  </span>
                  {user.effective_plan === "plus" ? (
                    <span className="text-ink-400">{formatDate(subscription?.current_period_end)}</span>
                  ) : (
                    <Link href="/plans" className="text-lemon-300 hover:underline">שדרג ←</Link>
                  )}
                </div>
              </div>

              <nav className="card-surface rounded-2xl p-2" aria-label="ניווט באזור האישי">
                <ul className="space-y-1">
                  {NAV.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-ink-200 transition hover:bg-white/5 hover:text-white"
                      >
                        <span aria-hidden="true">{item.icon}</span>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            <main id="main" className="min-w-0">{children}</main>
          </div>
        </div>
        <SiteFooter />
      </div>
    </ToastProvider>
  );
}
