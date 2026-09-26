import type { Metadata } from "next";
import { FortressDashboard } from "@/components/admin/fortress-dashboard";
import { verifyAuditChain } from "@/lib/audit";
import { CRITICAL_ACTIONS, adminIpAllowlist, fortressReport, maskEmail } from "@/lib/fortress";
import { breachCacheStats, breachMode } from "@/lib/password-policy";
import { get as dbGet } from "@/lib/db";
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

  const report = fortressReport();
  // המסך מציג אימיילי צוות ממוסכים — הנתון המלא נשאר במסד ובקוד השרת
  const maskedStaff = {
    total: report.staff.total,
    with2fa: report.staff.with2fa,
    missing2fa: report.staff.missing2fa.map((email) => maskEmail(email)),
    accounts: report.staff.accounts.map((email) => maskEmail(email)),
  };
  const staff2faSetting =
    dbGet<{ value: string }>("SELECT value FROM security_settings WHERE key = 'require_staff_2fa'")?.value ?? "on";

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
          report,
          maskedStaff,
          auditChain: verifyAuditChain(2000),
          allowlist: adminIpAllowlist(),
          criticalActions: [...CRITICAL_ACTIONS],
          passwordPolicy: { breachMode: breachMode(), breachCache: breachCacheStats() },
          requireStaff2fa: staff2faSetting === "off" ? "off" : "on",
        }}
        canManage={session?.user.role === "owner"}
      />
    </div>
  );
}
