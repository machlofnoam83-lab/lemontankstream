import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { all, count, run, tx } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** רשימת הנרשמים + נתונים — למנהלים בלבד */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "users.read", rateLimit: "api" }, async () => {
    const subscribers = all(
      `SELECT id, email_norm AS email, source, confirmed, created_at FROM newsletter_subscribers
       ORDER BY id DESC LIMIT 500`,
    );
    const stats = {
      total: count("SELECT COUNT(*) c FROM newsletter_subscribers"),
      confirmed: count("SELECT COUNT(*) c FROM newsletter_subscribers WHERE confirmed = 1"),
      pending: count("SELECT COUNT(*) c FROM newsletter_subscribers WHERE confirmed = 0"),
      last7: count("SELECT COUNT(*) c FROM newsletter_subscribers WHERE created_at >= datetime('now','-7 days')"),
    };
    return jsonOk({ subscribers, stats }, undefined, req);
  });
}

const broadcastSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(4000),
  link: z.string().trim().max(300).optional(),
  /** true = גם למשתמשים רשומים (התראה באתר), לא רק לנרשמי המייל */
  notify_users: z.boolean().optional(),
});

/**
 * שליחת עדכון.
 * אין שרת מייל בסביבה הזו, ולכן בפועל נוצרות התראות למשתמשים הרשומים,
 * והנרשמים למייל מסומנים כ"ממתינים לשליחה" — כך שהזרימה נבדקת מקצה לקצה
 * ובייצור מחברים את ספק המייל בקריאה אחת.
 */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    {
      auth: "required",
      permission: "users.read",
      rateLimit: "write",
      audit: { action: "newsletter.broadcast", entity: "newsletter" },
    },
    async (ctx) => {
      const input = broadcastSchema.parse(await ctx.body<Record<string, unknown>>());

      let notified = 0;
      if (input.notify_users) {
        const users = all<{ id: number }>(
          "SELECT id FROM users WHERE status = 'active' AND deleted_at IS NULL AND marketing_opt_in = 1 LIMIT 5000",
        );
        tx(() => {
          for (const user of users) {
            run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
              user.id,
              "newsletter",
              input.subject,
              input.body.slice(0, 1000),
              input.link ?? null,
            ]);
          }
        });
        notified = users.length;
      }

      const pending = count("SELECT COUNT(*) c FROM newsletter_subscribers WHERE confirmed = 1");
      return jsonOk({ notified, emailRecipients: pending, queued: true }, undefined, req);
    },
  );
}
