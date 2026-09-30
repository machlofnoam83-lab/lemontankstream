import type { Metadata } from "next";
import Link from "next/link";
import { all, get } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatPrice } from "@/lib/format";
import { UpgradePanel } from "@/components/site/upgrade-panel";
import { Icon } from "@/components/ui/icons";
import { OrnamentRule } from "@/components/ui/ornaments";
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
      <header className="text-center animate-ink-in">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-brass-300/80">מנויים</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-parchment-50 md:text-5xl">
          בחרו את <span className="text-brass-300">המסלול</span> שלכם
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-parchment-200/80">
          מתחילים בחינם, משדרגים כשבא לכם. בלי התחייבות, ביטול בכל רגע בלחיצה.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {["7 ימי ניסיון חינם", "ביטול בכל רגע", "תשלום מאובטח", "ללא פרסומות בפלוס"].map((chip, index) => (
            <span
              key={chip}
              style={{ animationDelay: `${index * 60}ms` }}
              className="reveal-item inline-flex items-center gap-1.5 border border-brass-400/20 bg-brass-400/[0.05] px-3 py-1.5 font-mono text-[0.72rem] text-parchment-200/85"
            >
              <Icon name="check" className="size-3.5 text-verdigris-400" strokeWidth={3} />
              {chip}
            </span>
          ))}
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {plans.map((plan) => {
          const features: string[] = JSON.parse(plan.features_json || "[]");
          const isPlus = plan.code === "plus";
          const isCurrent = (user?.effective_plan ?? "free") === plan.code;

          return (
            <section
              key={plan.code}
              className={`chamfer reveal-item relative flex flex-col overflow-hidden p-7 lift hover:lift-hover ${
                isPlus
                  ? "border border-oxblood-500/45 bg-gradient-to-b from-oxblood-600/[0.22] to-obsidian-900/75 shadow-[0_40px_90px_-50px_rgba(124,36,48,0.95)]"
                  : "card-surface"
              }`}
              aria-label={`מסלול ${plan.name_he}`}
            >
              {isPlus ? (
                <>
                  <div className="pointer-events-none absolute -right-20 -top-24 size-56 rounded-full bg-oxblood-600/25 blur-3xl" aria-hidden="true" />
                  <span className="absolute top-0 right-7 inline-flex items-center gap-1.5 border border-brass-300/50 border-t-0 bg-gradient-to-b from-oxblood-500 to-oxblood-600 px-3.5 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-parchment-50 shadow-[0_10px_30px_-12px_rgba(124,36,48,1)]">
                    <Icon name="crown" className="size-3.5" />
                    הפופולרי ביותר
                  </span>
                </>
              ) : null}

              <div className="flex items-start justify-between">
                <div>
                  <h2 className={`font-display text-2xl font-bold ${isPlus ? "text-parchment-50" : "text-parchment-100"}`}>{plan.name_he}</h2>
                  {plan.tagline ? <p className="mt-1 text-sm text-parchment-300/70">{plan.tagline}</p> : null}
                </div>
                {isCurrent ? <Badge tone="success">המסלול הנוכחי שלך</Badge> : null}
              </div>

              <div className="mt-6 flex items-end gap-2.5">
                <span className={`font-display text-5xl font-bold tracking-tight tabular-nums ${isPlus ? "text-brass-200" : "text-parchment-50"}`}>
                  {plan.price_ils === 0 ? "₪0" : formatPrice(plan.price_ils)}
                </span>
                <span className="pb-1.5 text-sm text-parchment-300/70">/ חודש</span>
                {plan.old_price_ils ? (
                  <span className="pb-1.5 text-sm text-parchment-300/45 line-through">{formatPrice(plan.old_price_ils)}</span>
                ) : null}
              </div>

              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-parchment-200/85">
                {[
                  isPlus ? `עד ${plan.max_streams} מסכים במקביל` : "מסך אחד בכל פעם",
                  isPlus ? `${plan.max_profiles} פרופילים למשפחה` : "2 פרופילים",
                  `איכות עד ${plan.max_quality}`,
                  { text: plan.downloads_allowed ? "הורדות לצפייה אופליין" : "בלי הורדות", ok: Boolean(plan.downloads_allowed) },
                  { text: plan.ads_enabled ? "עם פרסומות קצרות" : "בלי פרסומות בכלל", ok: !plan.ads_enabled },
                  ...(plan.early_access ? ["גישה מוקדמת לפרקים חדשים"] : []),
                  ...features,
                ].map((raw) => {
                  const item = typeof raw === "string" ? { text: raw, ok: true } : raw;
                  return (
                    <li key={item.text} className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center border ${
                          item.ok
                            ? isPlus
                              ? "border-brass-400/45 bg-brass-400/10 text-brass-200"
                              : "border-verdigris-400/45 bg-verdigris-500/12 text-verdigris-300"
                            : "border-parchment-300/20 bg-obsidian-800/60 text-parchment-300/50"
                        }`}
                        aria-hidden="true"
                      >
                        <Icon name={item.ok ? "check" : "close"} className="size-3" strokeWidth={3} />
                      </span>
                      <span className={item.ok ? "" : "text-parchment-300/55"}>{item.text}</span>
                    </li>
                  );
                })}
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
      <section className="panel-ink chamfer relative overflow-hidden">
        <h2 className="section-heading px-5 pt-5 !text-base text-parchment-100">
          <span className="section-heading-bar" aria-hidden="true" />
          השוואה מפורטת
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-obsidian-900/70 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-brass-300/80">
              <tr>
                <th className="px-5 py-3 text-right font-bold">תכונה</th>
                <th className="px-4 py-3 font-bold">חינם</th>
                <th className="px-4 py-3 font-bold text-brass-200">פלוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brass-400/10 [&>tr:hover]:bg-brass-400/[0.04]">
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
                  <td className="px-5 py-3.5 font-display font-bold text-parchment-100">{feature}</td>
                  <td className="px-4 py-3.5 text-center text-parchment-300/75">
                    <FeatureMark value={free} />
                  </td>
                  <td className="px-4 py-3.5 text-center font-bold text-brass-200">
                    <FeatureMark value={plus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* חיובים אחרונים */}
      {payments.length ? (
        <section className="card-surface chamfer p-5">
          <h2 className="mb-3 text-lg font-bold">היסטוריית חיובים</h2>
          <ul className="divide-y divide-brass-400/12 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-parchment-300/75">{new Date(p.created_at).toLocaleDateString("he-IL")}</span>
                <span className="font-mono text-xs text-parchment-300/60" dir="ltr">{p.invoice_no}</span>
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

      <section className="card-surface chamfer p-5">
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
              <dd className="text-parchment-200/85">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/** סימון ✓ / ✗ בטבלת ההשוואה — אייקונים חרותים במקום תווים */
function FeatureMark({ value }: { value: string }) {
  if (value === "✓") return <Icon name="check" className="mx-auto size-4 text-verdigris-400" strokeWidth={3} />;
  if (value === "✗") return <Icon name="close" className="mx-auto size-4 text-parchment-300/35" strokeWidth={2} />;
  return <span className="font-mono">{value}</span>;
}
