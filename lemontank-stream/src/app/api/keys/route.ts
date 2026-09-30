import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { createApiKey, listApiKeys } from "@/lib/apikeys";
import { isFeatureEnabled } from "@/lib/settings";
import { ApiError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2, "שם קצר מדי").max(60),
  scopes: z.array(z.enum(["read", "write", "admin"])).min(1).max(3).optional(),
  rate_limit: z.coerce.number().int().min(10).max(6000).optional(),
  expires_in_days: z.coerce.number().int().min(0).max(3650).nullable().optional(),
});

/** רשימת המפתחות שלי — בלי הסודות (הם לא קיימים בשרת אחרי היצירה) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    return jsonOk({ keys: listApiKeys(ctx.user!.id) }, undefined, req);
  });
}

/** יצירת מפתח חדש — הסוד מוחזר פעם אחת בלבד */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", rateLimit: "write", audit: { action: "api_key.create", entity: "api_key", severity: "warning" } },
    async (ctx) => {
      if (!isFeatureEnabled("developer_api")) throw new ApiError("FORBIDDEN", 403, "גישת ה-API מושבתת כרגע");
      const input = createSchema.parse(await ctx.body<Record<string, unknown>>());
      const { key, record } = createApiKey({
        userId: ctx.user!.id,
        name: input.name,
        scopes: input.scopes,
        rateLimit: input.rate_limit,
        expiresInDays: input.expires_in_days ?? null,
      });
      // ה-Hash של המפתח לא יוצא מהשרת: מי שמקבל אותו יכול לנסות
      // השוואות offline מול רשימות גנובות. הלקוח צריך רק מזהה וקידומת.
      const { key_hash: _omit, ...safeRecord } = record as Record<string, unknown> & { key_hash?: string };
      return jsonOk({ key, record: safeRecord }, undefined, req);
    },
  );
}
