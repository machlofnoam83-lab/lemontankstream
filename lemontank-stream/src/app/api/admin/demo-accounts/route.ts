import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { logSecurityEvent } from "@/lib/audit";
import {
  countDemoAccounts,
  deleteDemoAccounts,
  generateDemoAccounts,
  listDemoAccounts,
  SAFE_DEMO_DOMAINS,
} from "@/lib/demo-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * מניית חשבונות לבדיקה — כלי ניהול.
 *
 *  GET     → כמה יש ומי הם
 *  POST    → יצירת אצווה חדשה
 *  DELETE  → מחיקת כל החשבונות המסומנים
 *
 * אזהרה מובנית: הכתובות מוגבלות לדומיינים שמורים לבדיקות (RFC 2606),
 * כך שאין כל דרך לשלוח הודעה לאדם אמיתי. ראו src/lib/demo-accounts.ts.
 */

export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "users.read", rateLimit: "api" }, async () =>
    jsonOk(
      {
        count: countDemoAccounts(),
        accounts: listDemoAccounts(200),
        allowedDomains: SAFE_DEMO_DOMAINS,
      },
      undefined,
      req,
    ),
  );
}

const generateSchema = z.object({
  count: z.coerce.number().int().min(1).max(500).default(12),
  plusPercent: z.coerce.number().int().min(0).max(100).default(25),
  domain: z.string().trim().max(64).optional(),
  prefix: z.string().trim().max(24).optional(),
});

export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "users.update", rateLimit: "api" }, async () =>
    withBody(req, generateSchema, async (body) => {
      const created = await generateDemoAccounts({
        count: body.count,
        plusPercent: body.plusPercent,
        domain: body.domain,
        prefix: body.prefix,
      });

      await logSecurityEvent({
        kind: "demo_accounts_created",
        severity: "info",
        detail: `נוצרו ${created.length} חשבונות בדיקה בדומיין בדיקה בלבד`,
      });

      return jsonOk(
        {
          created: created.length,
          accounts: created,
          total: countDemoAccounts(),
        },
        undefined,
        req,
      );
    }),
  );
}

export async function DELETE(req: NextRequest) {
  // מחיקה מוגבלת לבעלים (users.delete) — כמו כל פעולת מחיקה אחרת במערכת
  return withApi(req, { auth: "required", permission: "users.delete", rateLimit: "api" }, async () => {
    const result = deleteDemoAccounts();
    await logSecurityEvent({
      kind: "demo_accounts_deleted",
      severity: "warning",
      detail: `נמחקו ${result.deleted} חשבונות בדיקה`,
    });
    return jsonOk({ deleted: result.deleted, total: countDemoAccounts() }, undefined, req);
  });
}

/** קורא גוף בקשה ומאמת אותו — עם שגיאת 400 בעברית */
async function withBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
  handler: (body: z.infer<T>) => Promise<Response>,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", 400, undefined, "גוף הבקשה חייב להיות JSON תקין");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("BAD_REQUEST", 400, parsed.error.flatten(), "נתונים לא תקינים");
  }
  return handler(parsed.data);
}
