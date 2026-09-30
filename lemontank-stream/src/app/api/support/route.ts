import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { all, run } from "@/lib/db";
import { sanitizeMultiline, sanitizeText } from "@/lib/validate";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  subject: z.string().trim().min(3, "נושא קצר מדי").max(150),
  body: z.string().trim().min(10, "תאר את הבעיה בכמה מילים").max(3000),
  email: z.string().email().max(160).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
});

/** פתיחת פנייה לתמיכה */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "optional", rateLimit: "write" }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const res = run(
      "INSERT INTO support_tickets(user_id, email, subject, body, priority) VALUES(?,?,?,?,?)",
      [ctx.user?.id ?? null, input.email ?? ctx.user?.email ?? null, sanitizeText(input.subject, 150), sanitizeMultiline(input.body, 3000), input.priority],
    );
    return jsonOk(
      { id: Number(res.lastInsertRowid), message: "קיבלנו את הפנייה! נחזור אליך בהקדם 🙏" },
      { status: 201 },
      req,
    );
  });
}

/** הפניות שלי / כל הפניות (צוות) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const staff = ["editor", "admin", "owner"].includes(ctx.user?.role ?? "");
    const all_tickets = staff && new URL(req.url).searchParams.get("all") === "1";
    const items = all_tickets
      ? all("SELECT id, user_id, email, subject, priority, status, created_at FROM support_tickets ORDER BY id DESC LIMIT 100")
      : all("SELECT id, subject, priority, status, created_at FROM support_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 50", [ctx.user?.id ?? -1]);
    return jsonOk({ items }, undefined, req);
  });
}
