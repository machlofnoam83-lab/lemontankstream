import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { verifyAuditChain } from "@/lib/audit";
import { CRITICAL_ACTIONS, adminIpAllowlist, fortressReport, maskEmail, setAdminIpAllowlist } from "@/lib/fortress";
import { breachCacheStats, breachMode, setBreachMode } from "@/lib/password-policy";
import { writeAudit } from "@/lib/audit";
import { run } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** דוח המבצר — סשנים, חריגות, מצב 2FA בסגל, ורשימת ההיתר */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "security.read", rateLimit: "api" }, async () => {
    const report = fortressReport();
    return jsonOk(
      {
        report,
        // דוח המבצר מוצג לסגל — כתובות הצוות מוצגות ממוסכות (PII)
        maskedStaff: {
          with2fa: report.staff.with2fa,
          total: report.staff.total,
          missing2fa: report.staff.missing2fa.map((email) => maskEmail(email)),
          // כל חברי הצוות, ממוסכים — התצוגה בדשבורד לא חושפת כתובות מלאות
          accounts: report.staff.accounts.map((email) => maskEmail(email)),
        },
        auditChain: verifyAuditChain(2000),
        allowlist: adminIpAllowlist(),
        criticalActions: [...CRITICAL_ACTIONS],
        passwordPolicy: { breachMode: breachMode(), breachCache: breachCacheStats() },
      },
      undefined,
      req,
    );
  });
}

const patchSchema = z.object({
  allowlist: z.array(z.string().max(60)).max(50).optional(),
  /** off = בלי בדיקת דליפה · warn = להתריע · enforce = לחסום סיסמאות דלופות */
  breachMode: z.enum(["off", "warn", "enforce"]).optional(),
  /** האם חובה 2FA על חשבונות צוות */
  requireStaff2fa: z.enum(["on", "off"]).optional(),
});

/**
 * עדכון רשימת ההיתר של אזור הניהול.
 * רשימה ריקה = פתוח לכל כתובת (עדיין דורש מנהל + 2FA).
 */
export async function PATCH(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", permission: "security.manage", rateLimit: "write", audit: { action: "security.settings_update", entity: "admin_ip_allowlist", severity: "warning" } },
    async (ctx) => {
      const input = patchSchema.parse(await ctx.body<Record<string, unknown>>());
      const previousBreachMode = breachMode();
      const before = adminIpAllowlist();
      if (input.allowlist) setAdminIpAllowlist(input.allowlist);
      if (input.breachMode) setBreachMode(input.breachMode);
      if (input.requireStaff2fa) {
        run(
          `INSERT INTO security_settings(key, value) VALUES('require_staff_2fa', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [input.requireStaff2fa],
        );
      }
      const after = adminIpAllowlist();
      writeAudit(
        {
          action: "security.settings_update",
          entity: "admin_ip_allowlist",
          severity: "critical",
          before: { addrs: before, breachMode: previousBreachMode },
          after: { addrs: after, breachMode: breachMode(), requireStaff2fa: input.requireStaff2fa ?? undefined },
        },
        { req, actorId: ctx.user!.id, actorEmail: ctx.user!.email },
      );
      return jsonOk(
        { allowlist: after, active: after.length > 0, breachMode: breachMode(), passwordPolicy: { breachCache: breachCacheStats() } },
        undefined,
        req,
      );
    },
  );
}
