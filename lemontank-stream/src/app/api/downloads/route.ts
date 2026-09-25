import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { ApiError, jsonOk } from "@/lib/http";
import { createDownload, deleteDownload, downloadPolicy, downloadStats, myDownloads, registerDevice } from "@/lib/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title_id: z.coerce.number().int().positive(),
  episode_id: z.coerce.number().int().positive().nullable().optional(),
  quality: z.enum(["480p", "720p", "1080p", "4k"]).optional(),
  device_fingerprint: z.string().max(120).optional(),
  device_label: z.string().max(60).optional(),
  platform: z.string().max(40).optional(),
});

/** ההורדות שלי + סטטוס */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    const url = new URL(req.url);
    const titleId = Number(url.searchParams.get("title_id") || 0);
    if (titleId) {
      const policy = downloadPolicy(ctx.user!.id, ctx.user!.effective_plan === "plus" ? "plus" : "free", titleId);
      return jsonOk(policy, undefined, req);
    }
    return jsonOk({ downloads: myDownloads(ctx.user!.id), stats: downloadStats(ctx.user!.id) }, undefined, req);
  });
}

/** בקשת הורדה חדשה — מחזיר טוקן עם תוקף קצר */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const input = createSchema.parse(await ctx.body<Record<string, unknown>>());
    const plan = ctx.user!.effective_plan === "plus" ? "plus" : "free";

    // סדר הבדיקות חשוב לחוויית המשתמש: קודם אומרים "התוכן הזה לא בהורדה / צריך פלוס",
    // ורק אחר כך מבקשים מזהה מכשיר.
    const policy = downloadPolicy(ctx.user!.id, plan, input.title_id, input.episode_id ?? null);
    if (!policy.allowed) throw new ApiError("PLAN_REQUIRED", 402, undefined, policy.reason ?? "ההורדה לא מותרת");

    if (!input.device_fingerprint) throw new ApiError("BAD_REQUEST", 400, undefined, "חסר מזהה מכשיר");

    const deviceId = registerDevice({
      userId: ctx.user!.id,
      fingerprint: input.device_fingerprint,
      label: input.device_label ?? null,
      platform: input.platform ?? null,
    });

    const { download, token } = createDownload({
      userId: ctx.user!.id,
      plan,
      titleId: input.title_id,
      episodeId: input.episode_id ?? null,
      deviceId,
      quality: input.quality,
    });

    return jsonOk({ download, token, note: "הטוקן בתוקף 48 שעות" }, { status: 201 }, req);
  });
}

export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const body = await ctx.body<{ id?: number }>().catch(() => ({ id: 0 }));
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("BAD_REQUEST", 400);
    return jsonOk({ deleted: deleteDownload(ctx.user!.id, id) }, undefined, req);
  });
}
