import type { Metadata } from "next";
import Link from "next/link";
import { Card, StatCard } from "@/components/ui/primitives";
import { SubscriptionsTable, type AdminSubscription } from "@/components/admin/subscriptions-table";
import { all, count, get } from "@/lib/db";
import { formatNumber, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "מנויים", robots: { index: false } };
export const dynamic = "force-dynamic";

/** כל המנויים — כולל הארכה/ביטול ידני בלי לפתוח את כרטיס המשתמש */
export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; plan?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = ["active", "trialing", "past_due", "canceled", "expired"].includes(params.status ?? "") ? params.status! : "";
  const plan = ["free", "plus"].includes(params.plan ?? "") ? params.plan! : "";
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 40;
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const values: unknown[] = [];
  if (status) {
    where.push("s.status = ?");
    values.push(status);
  }
  if (plan) {
    where.push("s.plan_code = ?");
    values.push(plan);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const items = all<AdminSubscription>(
    `SELECT s.id, s.user_id, u.email, u.name, s.plan_code, s.status, s.started_at, s.current_period_end, s.trial_end,
            s.cancel_at_period_end, s.provider,
            (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.subscription_id = s.id AND p.status = 'paid') AS paid_total
     FROM subscriptions s JOIN users u ON u.id = s.user_id ${whereSql}
     ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  const total = count(`SELECT COUNT(*) c FROM subscriptions s ${whereSql}`, values);
  const pages = Math.max(1, Math.ceil(total / limit));

  const activePlus = count("SELECT COUNT(*) c FROM subscriptions WHERE plan_code='plus' AND status IN ('active','trialing')");
  const trialing = count("SELECT COUNT(*) c FROM subscriptions WHERE status='trialing'");
  const pastDue = count("SELECT COUNT(*) c FROM subscriptions WHERE status='past_due'");
  const canceled30 = count("SELECT COUNT(*) c FROM subscriptions WHERE status IN ('canceled','expired') AND updated_at > datetime('now','-30 day')");
  const mrr = Number(get<{ s: number }>("SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE status='paid' AND created_at > datetime('now','-30 day')")?.s ?? 0);
  const vat = Number(get<{ s: number }>("SELECT COALESCE(SUM(vat_amount), 0) s FROM payments WHERE status='paid' AND created_at > datetime('now','-30 day')")?.s ?? 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">💳 מנויים ותשלומים</h1>
        <p className="mt-1 text-sm text-ink-400">
          {formatNumber(total)} מנויים במערכת. ביטול ידני מעביר את המשתמש למסלול חינם מיד; "הענק פלוס" יוצר מנוי ל-30 יום.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="מנויי פלוס פעילים" value={formatNumber(activePlus)} tone="success" />
        <StatCard label="בתקופת ניסיון" value={formatNumber(trialing)} />
        <StatCard label="תשלום בפיגור" value={formatNumber(pastDue)} tone={pastDue ? "warn" : "neutral"} />
        <StatCard label="בוטלו ב-30 יום" value={formatNumber(canceled30)} />
        <StatCard label="הכנסות 30 יום" value={formatPrice(mrr)} />
        <StatCard label="מתוכן מע״מ" value={formatPrice(vat)} />
      </div>

      <form className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3" action="/admin/subscriptions">
        <select name="status" defaultValue={status} aria-label="סטטוס" className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="active">פעיל</option>
          <option value="trialing">בניסיון</option>
          <option value="past_due">בפיגור</option>
          <option value="canceled">בוטל</option>
          <option value="expired">הסתיים</option>
        </select>
        <select name="plan" defaultValue={plan} aria-label="מסלול" className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm">
          <option value="">כל המסלולים</option>
          <option value="plus">פלוס</option>
          <option value="free">חינם</option>
        </select>
        <button className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">סנן</button>
        {status || plan ? <Link href="/admin/subscriptions" className="text-xs text-ink-300 hover:text-white">איפוס</Link> : null}
      </form>

      <SubscriptionsTable items={items} />

      {pages > 1 ? (
        <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="עמודים">
          {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 20).map((p) => (
            <Link
              key={p}
              href={`/admin/subscriptions?page=${p}${status ? `&status=${status}` : ""}${plan ? `&plan=${plan}` : ""}`}
              aria-current={p === page ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${p === page ? "bg-lemon-400 font-bold text-ink-900" : "bg-white/5 hover:bg-white/10"}`}
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}

      <Card className="p-5 text-xs text-ink-400">
        <h2 className="mb-2 text-sm font-bold text-ink-100">תזכורת חשבונאית</h2>
        <p>
          מחירי המסלולים כוללים מע״מ 18% (המע״מ מחולץ מתוך הסכום). כל תשלום נשמר בטבלת payments עם מספר חשבונית
          בפורמט <span dir="ltr" className="font-mono">LT-&lt;שנה&gt;-&lt;מזהה&gt;</span> וסכום המע״מ בנפרד — מוכן לדוח.
          {" "}ייצוא מלא: <Link href="/api/export?type=backup" className="text-lemon-300 hover:underline">גיבוי JSON</Link>.
        </p>
      </Card>
    </div>
  );
}
