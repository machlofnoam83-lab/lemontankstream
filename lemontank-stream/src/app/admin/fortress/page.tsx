import type { Metadata } from "next";
import { FortressDashboard } from "@/components/admin/fortress-dashboard";
import { verifyAuditChain } from "@/lib/audit";
import { CRITICAL_ACTIONS, adminIpAllowlist, fortressReport } from "@/lib/fortress";
import { requirePermission } from "@/lib/rbac";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = { title: "המבצר · אבטחה", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * דף "המבצר" — תמונת מצב אבטחה, בקרת שלמות יומן הביקורת,
 * ורשימת היתר לכתובות הניהול.
 */
export default async function FortressPage() {
  const session = await getCurrentSession();
  requirePermission(session?.user, "security.read");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">🛡️ המבצר</h1>
        <p className="mt-1 text-ink-300">
          הגנת עומק: קישור סשנים למכשיר ולרשת, אימות דו-שלבי לסגל, אימות מחדש לפעולות הרסניות,
          ויומן ביקורת חתום שלא ניתן לשכתב בשקט.
        </p>
      </header>

      <FortressDashboard
        initial={{
          report: fortressReport(),
          auditChain: verifyAuditChain(2000),
          allowlist: adminIpAllowlist(),
          criticalActions: [...CRITICAL_ACTIONS],
        }}
        canManage={session?.user.role === "owner"}
      />
    </div>
  );
}
