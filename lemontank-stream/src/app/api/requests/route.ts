import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { createRequest, listRequests } from "@/lib/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2, "שם קצר מדי").max(120),
  kind: z.enum(["movie", "series", "any"]).optional(),
  year: z.coerce.number().int().min(1888).max(2100).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

/** כל הבקשות הפתוחות, המבוקשות ביותר קודם */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional", rateLimit: "api" }, async (ctx) => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "open";
    return jsonOk({ requests: listRequests({ userId: ctx.user?.id ?? null, status: status.slice(0, 12) }) }, undefined, req);
  });
}

/** בקשת כותר חדשה */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const input = createSchema.parse(await ctx.body<Record<string, unknown>>());
    const request = createRequest({
      userId: ctx.user!.id,
      name: input.name,
      kind: input.kind,
      year: input.year ?? null,
      note: input.note ?? null,
    });
    return jsonOk({ request }, { status: 201 }, req);
  });
}
