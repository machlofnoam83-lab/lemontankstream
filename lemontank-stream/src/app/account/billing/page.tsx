import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, StatCard } from "@/components/ui/primitives";
import { all, get } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDate, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "מנוי ותשלומים", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await requireUser();

  const subscription = get<{
    id: number; plan_code: string; status: string; started_at: string; current_period_end: string | null;
    trial_end: string | null; cancel_at_period_end: number; provider: string;
  }>(
    "SELECT id, plan_code, status, started_at, current_period_end, trial_end, cancel_at_period_end, provider FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [user.id],
  );

  const payments = all<{ id: number; amount: number; currency: string; status: string; invoice_no: string | null; vat_amount: number; created_at: string }>(
    "SELECT id, amount, currency, status, invoice_no, vat_amount, created_at FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 50",
    [user.id],
  );

  const totalPaid = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0);
  const couponRedemptions = all<{ code: string; kind: string; value: number; created_at: string }>(
    `SELECT c.code, c.kind, c.value, cr.created_at FROM coupon_redemptions cr JOIN coupons c ON c.id = cr.coupon_id
     WHERE cr.user_id = ? ORDER BY cr.id DESC`,
    [user.id],
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black md:text-3xl">💳 מנוי ותשלומים</h1>
        <p className="mt-1 text-sm text-ink-400">ניהול המנוי, חשבוניות והיסטוריית חיובים.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          label="המסלול הנוכחי"
          value={user.effective_plan === "plus" ? "⭐ פלוס" : "חינם"}
          hint={subscription?.status ? `סטטוס: ${subscription.status}` : undefined}
        />
        <StatCard label="חיוב הבא" value={subscription?.cancel_at_period_end ? "—" : formatDate(subscription?.current_period_end)} hint={subscription?.cancel_at_period_end ? "המנוי יסתיים" : undefined} />
        <StatCard label="סה״כ שולם" value={formatPrice(totalPaid)} tone="success" />
      </div>

      {subscription ? (
        <Card className="p-5">
          <h2 className="text-sm font-bold">פרטי המנוי</h2>
          <dl className="mt-3 grid gap-3 text-xs md:grid-cols-4">
            <div>
              <dt className="text-ink-400">מסלול</dt>
              <dd className="font-bold">{subscription.plan_code === "plus" ? "פלוס" : "חינם"}</dd>
            </div>
            <div>
              <dt className="text-ink-400">התחיל</dt>
              <dd className="font-bold">{formatDate(subscription.started_at)}</dd>
            </div>
            <div>
              <dt className="text-ink-400">{subscription.status === "trialing" ? "סוף ניסיון" : "בתוקף עד"}</dt>
              <dd className="font-bold">{formatDate(subscription.trial_end ?? subscription.current_period_end)}</dd>
            </div>
            <div>
              <dt className="text-ink-400">ביטול בסוף תקופה</dt>
              <dd className="font-bold">{subscription.cancel_at_period_end ? "כן" : "לא"}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/plans" className="rounded-xl bg-lemon-400 px-4 py-2 text-xs font-bold text-ink-900">
              {user.effective_plan === "plus" ? "ניהול המנוי" : "שדרג לפלוס ⭐"}
            </Link>
            <Link href="/api/export?type=my-data" className="rounded-xl border border-white/15 px-4 py-2 text-xs">
              הורד את הנתונים שלי (JSON)
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-ink-300">אין לך מנוי בתשלום — אתה במסלול החינם.</p>
          <Link href="/plans" className="mt-3 inline-block rounded-xl bg-gradient-to-l from-plus-500 to-plus-600 px-4 py-2 text-xs font-bold text-white">
            שדרג לפלוס — 7 ימי ניסיון חינם
          </Link>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-bold">🧾 חשבוניות</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-xs text-ink-400">אין חשבוניות עדיין.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="admin-table">
              <thead className="text-ink-300">
                <tr>
                  <th className="px-3 py-2 text-right">מספר חשבונית</th>
                  <th className="px-3 py-2 text-right">תאריך</th>
                  <th className="px-3 py-2 text-right">סכום</th>
                  <th className="px-3 py-2 text-right">מע״מ</th>
                  <th className="px-3 py-2 text-right">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-mono text-xs" dir="ltr">{p.invoice_no ?? `#${p.id}`}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(p.created_at)}</td>
                    <td className="px-3 py-2 font-bold">{formatPrice(p.amount, p.currency)}</td>
                    <td className="px-3 py-2 text-xs text-ink-400">{formatPrice(p.vat_amount, p.currency)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={p.status === "paid" ? "success" : p.status === "refunded" ? "warn" : "danger"}>
                        {p.status === "paid" ? "שולם" : p.status === "refunded" ? "הוחזר" : p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {couponRedemptions.length ? (
        <Card className="p-5">
          <h2 className="text-sm font-bold">🏷️ קופונים שנוצלו</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {couponRedemptions.map((c, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="font-mono" dir="ltr">{c.code}</span>
                <span className="text-ink-400">{c.kind === "percent" ? `${c.value}% הנחה` : c.kind === "fixed" ? `${formatPrice(c.value)} הנחה` : `${c.value} ימים`}</span>
                <span className="text-ink-500">{formatDate(c.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
