import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { createList, myLists } from "@/lib/lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2, "שם קצר מדי").max(60),
  description: z.string().trim().max(300).nullable().optional(),
  is_public: z.boolean().optional(),
});

/** הרשימות שלי */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    return jsonOk({ lists: myLists(ctx.user!.id) }, undefined, req);
  });
}

/** יצירת רשימה חדשה */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const input = createSchema.parse(await ctx.body<Record<string, unknown>>());
    const list = createList({
      userId: ctx.user!.id,
      name: input.name,
      description: input.description ?? null,
      isPublic: input.is_public,
    });
    return jsonOk({ list }, { status: 201 }, req);
  });
}
