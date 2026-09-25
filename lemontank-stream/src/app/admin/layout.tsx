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

  const alerts = [
    pendingReviews > 0 ? { label: `${pendingReviews} ביקורות לאישור`, tone: "warn" as const } : null,
    drafts > 0 ? { label: `${drafts} טיוטות`, tone: "neutral" as const } : null,
    pendingReports > 0 ? { label: `${pendingReports} דיווחים`, tone: "danger" as const } : null,
    settings.maintenance_mode ? { label: "מצב תחזוקה פעיל", tone: "danger" as const } : null,
  ].filter(Boolean) as { label: string; tone: "warn" | "neutral" | "danger" }[];

  const TONES = {
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    danger: "bg-red-500/15 text-red-300 border-red-500/30",
    neutral: "bg-white/[0.07] text-ink-200 border-white/10",
  };

  return (
    <ToastProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-ink-950/85 backdrop-blur-2xl">
          {/* פס זוהר עליון — מסמן "מצב ניהול" */}
          <div className="h-px w-full bg-gradient-to-l from-transparent via-lemon-400/60 to-transparent" aria-hidden="true" />
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <Link href="/admin" className="group flex items-center gap-2.5" aria-label="פאנל הניהול">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-lemon-400/30 bg-lemon-400/10 text-lg shadow-[0_0_22px_-6px_rgba(247,194,43,0.7)]" aria-hidden="true">
                🍋
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-sm font-black tracking-tight">
                  Lemon<span className="text-gradient">Tank</span>
                </span>
                <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-lemon-300/80">פאנל ניהול</span>
              </span>
            </Link>

            <div className="ms-auto flex flex-wrap items-center gap-2 text-xs">
              {alerts.map((a) => (
                <span key={a.label} className={`rounded-full border px-2.5 py-1 font-semibold ${TONES[a.tone]}`}>
                  {a.label}
                </span>
              ))}
              <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 sm:inline-flex">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-lemon-300 to-lemon-400 text-[10px] font-black text-ink-950" aria-hidden="true">
                  {user.name.trim().charAt(0)}
                </span>
                <span className="text-ink-200">{user.name}</span>
                <span className="text-ink-500">·</span>
                <span className="text-ink-400">{ROLE_NAMES_HE[user.role as Role] ?? user.role}</span>
              </span>
              <Link
                href="/"
                className="rounded-xl border border-white/15 px-3 py-1.5 font-semibold text-ink-200 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
              >
                לאתר ←
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-[1600px] gap-7 px-4 py-6">
          <AdminNav role={user.role} />
          <main id="main" className="min-w-0 flex-1 pb-16">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
