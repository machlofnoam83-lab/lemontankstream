import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run, tx } from "@/lib/db";
import { z } from "zod";

/** מספר חשבונית ייחודי: LT-<שנה>-<מזהה תשלום>, ועם ספרת גיבוי אם המספר תפוס (רשומות ותיקות) */
function uniqueInvoiceNo(paymentId: number): string {
  const year = new Date().getFullYear();
  const base = `LT-${year}-${String(paymentId).padStart(6, "0")}`;
  if (!get<{ id: number }>("SELECT id FROM payments WHERE invoice_no = ?", [base])) return base;
  for (let i = 1; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!get<{ id: number }>("SELECT id FROM payments WHERE invoice_no = ?", [candidate])) return candidate;
  }
  return `LT-${year}-${paymentId}-${Date.now().toString(36)}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["subscribe", "cancel", "resume", "trial"]),
  plan_code: z.enum(["free", "plus"]).optional().default("plus"),
  coupon: z.string().trim().max(40).optional().nullable(),
});

const VAT_RATE = 0.18; // מע"מ ישראל

/** המנוי שלי + היסטוריית תשלומים */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const subscriptions = all("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC", [ctx.user!.id]);
    const payments = all("SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 36", [ctx.user!.id]);
    return jsonOk({ subscriptions, payments, effectivePlan: ctx.user!.effective_plan }, undefined, req);
  });
}

/**
 * שינוי מנוי:
 *  • subscribe — מעביר לפלוס, יוצר רשומת תשלום (בסביבת דמו: תשלום מיידי "paid").
 *  • trial     — התחלת תקופת ניסיון (7 ימים כברירת מחדל).
 *  • cancel    — ביטול בסוף התקופה (המשתמש נשאר פלוס עד סוף החודש ששילם).
 *  • resume    — ביטול הביטול.
 */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", rateLimit: "write", audit: { action: "subscription.update", entity: "subscription", severity: "warning" } },
    async (ctx) => {
      const input = schema.parse(await ctx.body<Record<string, unknown>>());
      const userId = ctx.user!.id;

      if (input.action === "cancel") {
        const sub = get<{ id: number }>("SELECT id FROM subscriptions WHERE user_id = ? AND status IN ('active','trialing') ORDER BY id DESC LIMIT 1", [userId]);
        if (!sub) throw new ApiError("BAD_REQUEST", 400, undefined, "אין מנוי פעיל לביטול");
        run("UPDATE subscriptions SET cancel_at_period_end = 1, canceled_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", [sub.id]);
        return jsonOk({ canceled: true, message: "המנוי יסתיים בתום התקופה הנוכחית" }, undefined, req);
      }

      if (input.action === "resume") {
        const sub = get<{ id: number }>("SELECT id FROM subscriptions WHERE user_id = ? AND cancel_at_period_end = 1 ORDER BY id DESC LIMIT 1", [userId]);
        if (!sub) throw new ApiError("BAD_REQUEST", 400, undefined, "אין ביטול פעיל");
        run("UPDATE subscriptions SET cancel_at_period_end = 0, canceled_at = NULL WHERE id = ?", [sub.id]);
        return jsonOk({ resumed: true, message: "המנוי ימשיך כרגיל 🎉" }, undefined, req);
      }

      const plan = get<{ code: string; price_ils: number; trial_days: number }>(
        "SELECT code, price_ils, trial_days FROM plans WHERE code = ? AND is_active = 1",
        [input.plan_code],
      );
      if (!plan) throw new ApiError("NOT_FOUND", 404, undefined, "המסלול לא זמין");

      // ── קופון ──
      let discount = 0;
      let couponId: number | null = null;
      if (input.coupon) {
        const coupon = get<{ id: number; kind: string; value: number; uses: number; max_uses: number; expires_at: string | null; is_active: number; plan_code: string | null }>(
          `SELECT id, kind, value, uses, max_uses, expires_at, is_active, plan_code FROM coupons WHERE code = ?`,
          [input.coupon.toUpperCase()],
        );
        const used = coupon ? get<{ c: number }>("SELECT COUNT(*) c FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?", [coupon.id, userId]) : undefined;
        if (!coupon || !coupon.is_active) throw new ApiError("BAD_REQUEST", 400, undefined, "הקופון אינו תקף");
        if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) throw new ApiError("BAD_REQUEST", 400, undefined, "תוקף הקופון פג");
        if (coupon.max_uses > 0 && coupon.uses >= coupon.max_uses) throw new ApiError("BAD_REQUEST", 400, undefined, "הקופון מוצה");
        if (coupon.plan_code && coupon.plan_code !== input.plan_code) throw new ApiError("BAD_REQUEST", 400, undefined, "הקופון לא תקף למסלול הזה");
        if (Number(used?.c ?? 0) > 0) throw new ApiError("BAD_REQUEST", 400, undefined, "כבר מימשת את הקופון הזה");
        discount = coupon.kind === "percent" ? (plan.price_ils * coupon.value) / 100 : coupon.kind === "fixed" ? coupon.value : 0;
        couponId = coupon.id;
      }

      const isTrial = input.action === "trial" && plan.trial_days > 0;
      const now = Date.now();
      const price = Math.max(0, plan.price_ils - discount);
      const vat = Number((price * VAT_RATE / (1 + VAT_RATE)).toFixed(2));

      const subscriptionId = tx(() => {
        // מבטלים מנויים קודמים פעילים
        run("UPDATE subscriptions SET status='expired' WHERE user_id = ? AND status IN ('active','trialing')", [userId]);

        const res = run(
          `INSERT INTO subscriptions(user_id, plan_code, status, current_period_end, trial_end, provider)
           VALUES(?,?,?,?,?, 'manual')`,
          [
            userId,
            input.plan_code,
            isTrial ? "trialing" : "active",
            new Date(now + (isTrial ? plan.trial_days : 30) * 86_400_000).toISOString(),
            isTrial ? new Date(now + plan.trial_days * 86_400_000).toISOString() : null,
          ],
        );
        const subId = Number(res.lastInsertRowid);

        run("UPDATE users SET plan_code = ? WHERE id = ?", [input.plan_code, userId]);

        if (price > 0 && !isTrial) {
          // מספר החשבונית נגזר ממזהה התשלום (ולא מהמנוי) — כך כל חיוב מקבל מספר ייחודי,
          // גם בחידוש חודשי על אותו מנוי.
          const payRes = run(
            `INSERT INTO payments(user_id, subscription_id, amount, currency, status, provider, vat_amount, meta)
             VALUES(?,?,?,?, 'paid', 'manual', ?, ?)`,
            [userId, subId, price, "ILS", vat, JSON.stringify({ coupon: input.coupon ?? null, discount })],
          );
          const payId = Number(payRes.lastInsertRowid);
          const invoiceNo = uniqueInvoiceNo(payId);
          run("UPDATE payments SET invoice_no = ? WHERE id = ?", [invoiceNo, payId]);
          run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
            userId, "billing", "התשלום התקבל ✓", `חשבונית ${invoiceNo} על סך ₪${price.toFixed(2)}`, "/account/billing",
          ]);
        } else if (isTrial) {
          run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
            userId, "billing", `תקופת ניסיון של ${plan.trial_days} ימים התחילה 🎉`, "תיהנה מכל התוכן — אפשר לבטל בכל רגע.", "/account/billing",
          ]);
        }

        if (couponId) {
          run("INSERT INTO coupon_redemptions(coupon_id, user_id) VALUES(?,?)", [couponId, userId]);
          run("UPDATE coupons SET uses = uses + 1 WHERE id = ?", [couponId]);
        }

        return subId;
      });

      return jsonOk(
        {
          subscriptionId,
          plan: input.plan_code,
          trial: isTrial,
          amount: isTrial ? 0 : price,
          message: isTrial ? `התחילה תקופת ניסיון ל-${plan.trial_days} ימים 🎉` : "המנוי שלך פעיל — צפייה מהנה! ⭐",
        },
        { status: 201 },
        req,
      );
    },
  );
}
