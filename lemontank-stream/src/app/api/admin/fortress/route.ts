import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { verifyAuditChain } from "@/lib/audit";
import { CRITICAL_ACTIONS, adminIpAllowlist, fortressReport, setAdminIpAllowlist } from "@/lib/fortress";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** דוח המבצר — סשנים, חריגות, מצב 2FA בסגל, ורשימת ההיתר */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "security.read", rateLimit: "api" }, async () => {
    return jsonOk(
      {
        report: fortressReport(),
        auditChain: verifyAuditChain(2000),
        allowlist: adminIpAllowlist(),
        criticalActions: [...CRITICAL_ACTIONS],
      },
      undefined,
      req,
    );
  });
}

const patchSchema = z.object({ allowlist: z.array(z.string().max(60)).max(50) });

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
      const before = adminIpAllowlist();
      setAdminIpAllowlist(input.allowlist);
      const after = adminIpAllowlist();
      writeAudit(
        { action: "security.settings_update", entity: "admin_ip_allowlist", severity: "critical", before: { addrs: before }, after: { addrs: after } },
        { req, actorId: ctx.user!.id, actorEmail: ctx.user!.email },
      );
      return jsonOk({ allowlist: after, active: after.length > 0 }, undefined, req);
    },
  );
}
