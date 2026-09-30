import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { run } from "@/lib/db";
import { hashIp } from "@/lib/crypto";
import { sanitizeText } from "@/lib/validate";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["play", "pause", "seek", "finish", "pageview", "search", "title_view", "click", "share", "error"]),
  title_id: z.coerce.number().int().positive().optional().nullable(),
  episode_id: z.coerce.number().int().positive().optional().nullable(),
  profile_id: z.coerce.number().int().positive().optional().nullable(),
  meta: z.record(z.unknown()).optional().nullable(),
});

/** קליטת אירועי אנליטיקה מהנגן — IP מגובב בלבד (אנונימי, תואם GDPR) */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "optional", rateLimit: "progress", csrf: true }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());

    run(
      `INSERT INTO analytics_events(user_id, profile_id, session_id, kind, title_id, episode_id, meta, ip_hash)
       VALUES(?,?,?,?,?,?,?,?)`,
      [
        ctx.user?.id ?? null,
        input.profile_id ?? null,
        ctx.sessionId,
        input.kind,
        input.title_id ?? null,
        input.episode_id ?? null,
        input.meta ? JSON.stringify(input.meta).slice(0, 1000) : null,
        hashIp(ctx.ip),
      ],
    );

    // עדכון מונה צפיות יומי לכותר
    if (input.kind === "play" && input.title_id) {
      run(
        `INSERT INTO title_views_daily(day, title_id, views, minutes) VALUES(date('now'), ?, 1, 0)
         ON CONFLICT(day, title_id) DO UPDATE SET views = views + 1`,
        [input.title_id],
      );
    }

    return jsonOk({ recorded: true }, undefined, req);
  });
}

/** חיפוש שנרשם לאנליטיקה (מה מחפשים המשתמשים) */
export async function PUT(req: NextRequest) {
  return withApi(req, { auth: "optional", rateLimit: "search" }, async (ctx) => {
    const body = await ctx.body<{ q?: string }>().catch(() => ({}) as { q?: string });
    const q = sanitizeText(body?.q ?? "", 80);
    if (q.length >= 2) {
      run("INSERT INTO analytics_events(user_id, session_id, kind, meta) VALUES(?,?, 'search', ?)", [
        ctx.user?.id ?? null,
        ctx.sessionId,
        JSON.stringify({ q }),
      ]);
    }
    return jsonOk({ recorded: Boolean(q) }, undefined, req);
  });
}
