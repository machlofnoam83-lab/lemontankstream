import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { listDevices, registerDevice } from "@/lib/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** המכשירים שלי */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    return jsonOk({ devices: listDevices(ctx.user!.id) }, undefined, req);
  });
}

const registerSchema = z.object({
  fingerprint: z.string().min(4).max(120),
  label: z.string().max(60).optional(),
  platform: z.string().max(40).optional(),
});

/** רישום המכשיר הזה (idempotent — מחזיר את הקיים אם כבר רשום) */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const input = registerSchema.parse(await ctx.body<Record<string, unknown>>());
    const deviceId = registerDevice({
      userId: ctx.user!.id,
      fingerprint: input.fingerprint,
      label: input.label ?? null,
      platform: input.platform ?? null,
    });
    return jsonOk({ device_id: deviceId, devices: listDevices(ctx.user!.id) }, undefined, req);
  });
}
