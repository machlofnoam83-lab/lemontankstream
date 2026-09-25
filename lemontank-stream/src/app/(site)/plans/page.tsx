import type { Metadata } from "next";
import Link from "next/link";
import { all, get } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatPrice } from "@/lib/format";
import { UpgradePanel } from "@/components/site/upgrade-panel";
import { Badge } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "מנויים ומחירים",
  description: "מסלול חינם ומסלול פלוס — איכות 4K, הורדות, 4 מסכים ובלי פרסמות. 7 ימי ניסיון חינם.",
};
export const dynamic = "force-dynamic";

type Plan = {
  code: string;
  name_he: string;
  tagline: string | null;
  price_ils: number;
  old_price_ils: number | null;
  max_streams: number;
  max_profiles: number;
  max_quality: string;
  downloads_allowed: number;
  ads_enabled: number;
  trial_days: number;
  early_access: number;
  features_json: string;
  badge_color: string;
};

export default async function PlansPage() {
  const user = await getCurrentUser();
  const plans = all<Plan>("SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order, price_ils");

  const subscription = user
    ? get<{ plan_code: string; status: string; current_period_end: string | null; trial_end: string | null; cancel_at_period_end: number }>(
        "SELECT plan_code, status, current_period_end, trial_end, cancel_at_period_end FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        [user.id],
      )
    : null;

  const payments = user
    ? all<{ id: number; amount: number; currency: string; status: string; invoice_no: string | null; created_at: string }>(
        "SELECT id, amount, currency, status, invoice_no, created_at FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 6",
        [user.id],
      )
    : [];

  return (
    <div className="space-y-8">
      <header className="text-center">
        <h1 className="text-3xl font-black md:text-4xl">בחר את המסלול שלך 🍋</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-ink-300">
          מתחילים בחינם, משדרגים כשבא לכם. בלי התחייבות, ביטול בכל רגע בלחיצה.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {plans.map((plan) => {
          const features: string[] = JSON.parse(plan.features_json || "[]");
          const isPlus = plan.code === "plus";
          const isCurrent = (user?.effective_plan ?? "free") === plan.code;

          return (
            <section
              key={plan.code}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                isPlus ? "border-plus-500/40 bg-gradient-to-b from-plus-600/15 to-ink-850" : "border-white/10 bg-white/[0.03]"
              }`}
              aria-label={`מסלול ${plan.name_he}`}
            >
              {isPlus ? (
                <span className="absolute -top-3 right-6 rounded-full bg-gradient-to-l from-plus-500 to-plus-600 px-3 py-1 text-[11px] font-black text-white">
                  הפופולרי ביותר
                </span>
              ) : null}

              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black">{isPlus ? "⭐ " : ""}{plan.name_he}</h2>
                  {plan.tagline ? <p className="mt-1 text-sm text-ink-300">{plan.tagline}</p> : null}
                </div>
                {isCurrent ? <Badge tone="success">המסלול הנוכחי שלך</Badge> : null}
              </div>

              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-black">{plan.price_ils === 0 ? "₪0" : formatPrice(plan.price_ils)}</span>
                <span className="pb-1 text-sm text-ink-400">/ חודש</span>
                {plan.old_price_ils ? <span className="pb-1 text-sm text-ink-500 line-through">{formatPrice(plan.old_price_ils)}</span> : null}
              </div>

              <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-200">
                <li>✓ {isPlus ? `עד ${plan.max_streams} מסכים במקביל` : "מסך אחד בכל פעם"}</li>
                <li>✓ {isPlus ? `${plan.max_profiles} פרופילים למשפחה` : "2 פרופילים"}</li>
                <li>✓ איכות עד {plan.max_quality}</li>
                <li>{plan.downloads_allowed ? "✓ הורדות לצפייה אופליין" : "✗ בלי הורדות"}</li>
                <li>{plan.ads_enabled ? "• עם פרסומות קצרות" : "✓ בלי פרסומות בכלל"}</li>
                {plan.early_access ? <li>✓ גישה מוקדמת לפרקים חדשים</li> : null}
                {features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>

              <div className="mt-6">
                <UpgradePanel
                  planCode={plan.code}
                  isCurrent={isCurrent}
                  isLoggedIn={Boolean(user)}
                  trialDays={plan.trial_days}
                  priceLabel={plan.price_ils === 0 ? "חינם" : formatPrice(plan.price_ils)}
                  cancelAtPeriodEnd={Boolean(subscription?.cancel_at_period_end)}
                  subscriptionStatus={subscription?.status ?? null}
                  periodEnd={subscription?.current_period_end ?? null}
                />
              </div>
            </section>
          );
        })}
      </div>

      {/* השוואת תכונות */}
      <section className="card-surface rounded-2xl p-5">
        <h2 className="mb-4 text-lg font-bold">השוואה מפורטת</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-ink-300">
              <tr>
                <th className="py-2 text-right">תכונה</th>
                <th className="py-2">חינם</th>
                <th className="py-2 text-plus-400">פלוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ["תוכן חינם", "✓", "✓"],
                ["תוכן פרימיום (פלוס)", "✗", "✓"],
                ["איכות מקסימלית", "720p", "4K + Dolby"],
                ["מסכים במקביל", "1", "4"],
                ["פרופילים", "2", "5"],
                ["הורדות אופליין", "✗", "✓"],
                ["פרסומות", "כן", "ללא"],
                ["גישה מוקדמת", "✗", "✓"],
                ["תמיכה", "דוא״ל", "צ׳אט בעדיפות"],
              ].map(([feature, free, plus]) => (
                <tr key={feature}>
                  <td className="py-2.5 text-ink-200">{feature}</td>
                  <td className="py-2.5 text-center text-ink-300">{free}</td>
                  <td className="py-2.5 text-center font-bold text-plus-400">{plus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* חיובים אחרונים */}
      {payments.length ? (
        <section className="card-surface rounded-2xl p-5">
          <h2 className="mb-3 text-lg font-bold">היסטוריית חיובים</h2>
          <ul className="divide-y divide-white/5 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-ink-300">{new Date(p.created_at).toLocaleDateString("he-IL")}</span>
                <span className="font-mono text-xs text-ink-400" dir="ltr">{p.invoice_no}</span>
                <span className="font-bold">{formatPrice(p.amount, p.currency)}</span>
                <Badge tone={p.status === "paid" ? "success" : "warn"}>{p.status === "paid" ? "שולם" : p.status}</Badge>
              </li>
            ))}
          </ul>
          <Link href="/account/billing" className="mt-3 inline-block text-xs text-lemon-300 hover:underline">
            כל החשבוניות והמנוי שלי ←
          </Link>
        </section>
      ) : null}

      <section className="card-surface rounded-2xl p-5">
        <h2 className="mb-2 text-lg font-bold">שאלות נפוצות</h2>
        <dl className="space-y-3 text-sm">
          {[
            ["אפשר לבטל בכל רגע?", "כן. ביטול בלחיצה אחת באזור האישי — והמנוי נשאר פעיל עד סוף התקופה ששולמה."],
            ["מה קורה לתוכן הפלוס אחרי ביטול?", "המנוי חוזר אוטומטית למסלול חינם וכל תוכן החינם נשאר זמין לך."],
            ["אפשר לשתף את החשבון?", "עד 4 מסכים במקביל במסלול פלוס, עם עד 5 פרופילים אישיים."],
            ["איך אבטל את תקופת הניסיון?", "באזור האישי → המנוי שלי → ביטול. לא נחייב אותך אם ביטלת לפני סוף הניסיון."],
          ].map(([q, a]) => (
            <div key={q}>
              <dt className="font-bold">{q}</dt>
              <dd className="text-ink-300">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
