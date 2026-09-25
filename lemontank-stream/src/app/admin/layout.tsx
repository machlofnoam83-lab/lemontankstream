import Link from "next/link";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/ui/toast";
import { AdminNav } from "@/components/admin/admin-nav";
import { getCurrentUser } from "@/lib/session";
import { isAdminRole, ROLE_NAMES_HE, type Role } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { count } from "@/lib/db";

export const dynamic = "force-dynamic";

/** פריסת פאנל הניהול — גישה למנהלים בלבד (האכיפה האמיתית בכל נקודת קצה) */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminRole(user.role)) redirect("/?error=forbidden");

  const settings = getSettings();
  const pendingReports = count("SELECT COUNT(*) c FROM reports WHERE status='open'");
  const pendingReviews = count("SELECT COUNT(*) c FROM reviews WHERE status='pending'");
  const drafts = count("SELECT COUNT(*) c FROM titles WHERE status='draft' AND deleted_at IS NULL");

  return (
    <ToastProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-black">
              <span aria-hidden="true">🍋</span> LemonTank
              <span className="rounded-full bg-lemon-400/20 px-2 py-0.5 text-[10px] text-lemon-300">פאנל ניהול</span>
            </Link>

            <div className="ms-auto flex items-center gap-3 text-xs">
              {pendingReviews > 0 ? <span className="rounded-full bg-amber-500/20 px-2 py-1 text-amber-300">{pendingReviews} ביקורות לאישור</span> : null}
              {drafts > 0 ? <span className="rounded-full bg-white/10 px-2 py-1 text-ink-200">{drafts} טיוטות</span> : null}
              {pendingReports > 0 ? <span className="rounded-full bg-red-500/20 px-2 py-1 text-red-300">{pendingReports} דיווחים</span> : null}
              <span className="hidden text-ink-300 sm:inline">
                {user.name} · {ROLE_NAMES_HE[user.role as Role] ?? user.role}
              </span>
              {settings.maintenance_mode ? <span className="rounded-full bg-red-500/20 px-2 py-1 text-red-300">מצב תחזוקה פעיל</span> : null}
              <Link href="/" className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/10">לאתר ←</Link>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6">
          <AdminNav role={user.role} />
          <main id="main" className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
