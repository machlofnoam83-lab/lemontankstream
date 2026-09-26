import type { Metadata } from "next";
import { PlansEditor, type AdminPlan } from "@/components/admin/plans-editor";
import { all } from "@/lib/db";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "מסלולי מנוי", robots: { index: false } };
export const dynamic = "force-dynamic";

/** עריכת מסלולי המנוי — הקובעים מחירים, איכות, מסכים במקביל והורדות */
export default async function AdminPlansPage() {
  const plans = all<AdminPlan>(
    `SELECT p.code, p.name_he, p.name_en, p.tagline, p.price_ils, p.old_price_ils, p.currency, p.max_streams, p.max_profiles,
            p.max_quality, p.downloads_allowed, p.ads_enabled, p.ads_free_bypass, p.trial_days, p.early_access,
            p.features_json, p.badge_color, p.is_active,
            (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_code = p.code AND s.status IN ('active','trialing')) AS subscribers
     FROM plans p ORDER BY p.sort_order ASC`,
  );

  const totalPlus = plans.find((p) => p.code === "plus")?.subscribers ?? 0;
  const mrr = plans.reduce((sum, p) => sum + Number(p.price_ils) * Number(p.subscribers ?? 0), 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">💎 מסלולי מנוי</h1>
          <p className="mt-1 text-sm text-ink-400">
            שתי הרמות: חינם (עם פרסומות) ופלוס (הכול פתוח). מה שקובע את ההבדל בפועל הוא שדה ההרשאה בכל כותר ופרק.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-xl bg-white/[0.04] px-3 py-2">מנויי פלוס: <b>{formatNumber(Number(totalPlus))}</b></span>
          <span className="rounded-xl bg-white/[0.04] px-3 py-2">הכנסה חודשית (MRR): <b>₪{mrr.toFixed(2)}</b></span>
        </div>
      </header>

      <PlansEditor plans={plans} />

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-xs text-ink-400">
        <h2 className="mb-2 text-sm font-bold text-ink-100">איך נקבע מה חינם ומה פלוס?</h2>
        <ol className="list-inside list-decimal space-y-1">
          <li>בכל כותר (סרט/סדרה) ובכל פרק יש שדה <b className="text-ink-200">הרשאה</b>: חינם / פלוס / "בירושה".</li>
          <li>"בירושה" בפרק = נופל להרשאה של העונה; "בירושה" בעונה = נופל להרשאה של הסדרה.</li>
          <li>מנוי חינם רואה רק תוכן חינם — האכיפה בשרת, לא בממשק.</li>
          <li>צוות (עורך ומעלה) רואה הכול לצורכי בדיקה.</li>
        </ol>
      </section>
    </div>
  );
}
