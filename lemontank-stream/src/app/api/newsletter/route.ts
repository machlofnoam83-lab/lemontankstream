import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { withApi } from "@/server/api";
import { jsonOk } from "@/lib/http";
import { get, run } from "@/lib/db";
import { hashKey } from "@/lib/apikeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email("כתובת אימייל לא תקינה").max(200),
  source: z.string().trim().max(60).optional(),
});

/**
 * הרשמה לעדכונים — עם אישור כפול (double opt-in).
 *
 * ─ למה אישור כפול ────────────────────────────────────────────────────────────
 *  · מישהו יכול להרשם עם המייל של אחר; בלי אישור, זו הטרדה.
 *  · שולחים קישור אישור; רק מי שלוחץ — נרשם באמת.
 *  · התשובה זהה בין "נרשמת" ל"כבר רשום" — כדי לא לחשוף מי מנוי (privacy).
 */
export async function POST(req: NextRequest) {
  return withApi(req, { rateLimit: "register" }, async (ctx) => {
    const input = schema.parse(await ctx.body<Record<string, unknown>>());
    const email = input.email.toLowerCase().trim();

    const token = crypto.randomBytes(24).toString("hex");
    const existing = get<{ id: number; confirmed: number }>(
      "SELECT id, confirmed FROM newsletter_subscribers WHERE email_norm = ?",
      [email],
    );

    if (existing) {
      if (!existing.confirmed) {
        run("UPDATE newsletter_subscribers SET token_hash = ?, source = ? WHERE id = ?", [
          hashKey(token),
          input.source ?? "web",
          existing.id,
        ]);
      }
    } else {
      run("INSERT INTO newsletter_subscribers(email_norm, source, token_hash) VALUES(?,?,?)", [
        email,
        input.source ?? "web",
        hashKey(token),
      ]);
    }

    // אין שליחת מייל בסביבת הדגמה — מחזירים את הקישור כדי שהמנהל יראה את הזרימה
    return jsonOk(
      {
        subscribed: true,
        confirmUrl: `/api/newsletter/confirm?token=${token}&email=${encodeURIComponent(email)}`,
        message: "נשלח אליך מייל אישור — לחיצה אחת ואתה בפנים",
      },
      undefined,
      req,
    );
  });
}

/**
 * הסרה מהרשימה — בלחיצה אחת, בלי שאלות.
 * למשתמש מחובר: לפי המייל של החשבון. לאורח: לפי כתובת בגוף הבקשה.
 */
export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "optional", rateLimit: "write" }, async (ctx) => {
    // כתובת מפורשת בגוף הבקשה קודמת; אחרת מסירים את הכתובת של המשתמש המחובר
    const body = await ctx.body<{ email?: string }>().catch(() => ({}) as { email?: string });
    const explicit = (body?.email ?? "").toLowerCase().trim();
    const own = ctx.user?.email?.toLowerCase() ?? "";
    const email = explicit || own;
    if (!email) return jsonOk({ removed: false, message: "לא נמצאה כתובת להסרה" }, undefined, req);

    run("DELETE FROM newsletter_subscribers WHERE email_norm = ?", [email]);
    // סימון "בלי שיווק" רק כשההסרה היא של החשבון עצמו
    if (ctx.user && email === own) run("UPDATE users SET marketing_opt_in = 0 WHERE id = ?", [ctx.user.id]);
    return jsonOk({ removed: true, message: "הוסרת מהרשימה" }, undefined, req);
  });
}
