import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import {
  createGiftCards,
  decideRedemption,
  giftCardStats,
  listGiftCards,
  listRedemptions,
  revealGiftCardCode,
  revokeGiftCard,
} from "@/lib/giftcards";
import { outboundConfig, outboundReady, recentOutbound, setOutboundSetting } from "@/lib/notify-out";
import { logSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** קונסולת התשלומים: כרטיסים, בקשות ממתינות, הכנסות, ומצב ההתראות */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "billing.read", rateLimit: "api" }, async () => {
    const config = outboundConfig();
    return jsonOk(
      {
        stats: giftCardStats(),
        cards: listGiftCards(200),
        requests: listRedemptions({ limit: 200 }),
        pending: listRedemptions({ status: "pending", limit: 100 }),
        alerts: {
          ready: outboundReady(),
          // הסודות עצמם לא מוחזרים — רק האם הוגדרו
          discord: Boolean(config.discord),
          webhook: Boolean(config.webhook),
          email: config.emailReady,
          recent: recentOutbound(15),
        },
      },
      undefined,
      req,
    );
  });
}

const createSchema = z.object({
  action: z.literal("create"),
  planCode: z.string().max(30).optional().default("plus"),
  months: z.coerce.number().int().min(1).max(36).default(1),
  count: z.coerce.number().int().min(1).max(50).default(1),
  valueIls: z.coerce.number().min(0).max(100_000).optional(),
  maxUses: z.coerce.number().int().min(1).max(50).default(1),
  expiresInDays: z.coerce.number().int().min(0).max(3650).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});

const decideSchema = z.object({
  action: z.literal("decide"),
  id: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(400).nullable().optional(),
  months: z.coerce.number().int().min(1).max(36).nullable().optional(),
  valueIls: z.coerce.number().min(0).max(100_000).nullable().optional(),
  planCode: z.string().max(30).nullable().optional(),
});

const revokeSchema = z.object({ action: z.literal("revoke"), id: z.coerce.number().int().positive(), reason: z.string().max(200).optional() });
const revealSchema = z.object({ action: z.literal("reveal"), id: z.coerce.number().int().positive() });
const settingsSchema = z.object({
  action: z.literal("settings"),
  discord: z.string().trim().max(400).optional(),
  webhook: z.string().trim().max(400).optional(),
  email: z.string().trim().max(200).optional(),
});
const testSchema = z.object({ action: z.literal("testAlert") });

const bodySchema = z.discriminatedUnion("action", [
  createSchema,
  decideSchema,
  revokeSchema,
  revealSchema,
  settingsSchema,
  testSchema,
]);

/**
 * כל הפעולות שמשנות משהו בתשלומים. כולן דורשות `billing.manage`,
 * והפעולות הרגישות (הנפקה, ביטול, אישור) דורשות **אימות מחדש** דרך
 * `requireStepUp` בשכבת ה-API — לפי שם הפעולה שנרשם ב-audit.
 */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "billing.manage", rateLimit: "write" }, async (ctx) => {
    const input = bodySchema.parse(await ctx.body<Record<string, unknown>>());
    const actor = ctx.user!;

    switch (input.action) {
      case "create": {
        // הנפקת כרטיסים = כסף שנכנס → אימות מחדש
        const { requireStepUp } = await import("@/lib/fortress");
        requireStepUp(actor, ctx.sessionId ?? undefined, "giftcard.create");
        const result = createGiftCards({
          actorId: actor.id,
          planCode: input.planCode,
          months: input.months,
          count: input.count,
          valueIls: input.valueIls,
          maxUses: input.maxUses,
          expiresInDays: input.expiresInDays ?? null,
          note: input.note ?? null,
        });
        return jsonOk(
          {
            created: result.ids.length,
            codes: result.codes,
            summary: {
              note: result.note,
              plan: result.planCode,
              months: result.months,
              valueIls: result.valueIls,
              maxUses: result.maxUses,
              ids: result.ids,
            },
          },
          { status: 201 },
          req,
        );
      }

      case "decide": {
        const { requireStepUp } = await import("@/lib/fortress");
        requireStepUp(actor, ctx.sessionId ?? undefined, "giftcard.decide");
        const result = decideRedemption({
          id: input.id,
          decision: input.decision,
          actorId: actor.id,
          note: input.note ?? null,
          months: input.months ?? null,
          valueIls: input.valueIls ?? null,
          planCode: input.planCode ?? null,
        });
        await logSecurityEvent({
          kind: input.decision === "approve" ? "giftcard_approved" : "giftcard_rejected",
          severity: input.decision === "approve" ? "warning" : "info",
          userId: actor.id,
          detail: `בקשה #${input.id} · משתמש #${result.userId}`,
        });
        return jsonOk({ ok: true, decision: input.decision, userId: result.userId, period_end: result.periodEnd ?? null }, undefined, req);
      }

      case "revoke": {
        const { requireStepUp } = await import("@/lib/fortress");
        requireStepUp(actor, ctx.sessionId ?? undefined, "giftcard.revoke");
        revokeGiftCard(input.id, actor.id, input.reason);
        return jsonOk({ revoked: input.id }, undefined, req);
      }

      case "reveal": {
        // פענוח הקוד הגלוי — בעלים בלבד, ונרשם ביומן (זו חשיפה של סוד)
        if (actor.role !== "owner") throw new ApiError("FORBIDDEN", 403, undefined, "רק הבעלים יכול להציג קוד כרטיס");
        const result = revealGiftCardCode(input.id);
        await logSecurityEvent({
          kind: "giftcard_revealed",
          severity: "warning",
          userId: actor.id,
          detail: `כרטיס #${input.id} נחשף ע\"י הבעלים`,
        });
        return jsonOk({ code: result.code, status: result.status }, undefined, req);
      }

      case "settings": {
        if (actor.role !== "owner") throw new ApiError("FORBIDDEN", 403, undefined, "רק הבעלים יכול לשנות ערוצי התראות");
        if (input.discord !== undefined) setOutboundSetting("outbound_discord", input.discord);
        if (input.webhook !== undefined) setOutboundSetting("outbound_webhook", input.webhook);
        if (input.email !== undefined) setOutboundSetting("outbound_email", input.email);
        await logSecurityEvent({
          kind: "outbound_settings_update",
          severity: "warning",
          userId: actor.id,
          detail: `discord=${input.discord ? "set" : "-"} webhook=${input.webhook ? "set" : "-"} email=${input.email ?? "-"}`,
        });
        const config = outboundConfig();
        return jsonOk({ ready: outboundReady(), discord: Boolean(config.discord), webhook: Boolean(config.webhook), email: config.emailReady }, undefined, req);
      }

      case "testAlert": {
        const { notifyOutbound } = await import("@/lib/notify-out");
        const result = await notifyOutbound({
          kind: "test",
          title: "בדיקת התראות",
          body: `נשלח ידנית מהמסך על ידי ${actor.email}.\nאם אתה רואה את זה בדיסקורד — ההתראות עובדות.`,
          link: "/admin/giftcards",
          severity: "info",
        });
        return jsonOk(result, undefined, req);
      }
    }
  });
}
