import type { Metadata } from "next";
import { CardsShowcase } from "@/components/admin/features-showcase";
import { FlagsEditor, type Flag } from "@/components/admin/flags-editor";
import { getFeatureFlags } from "@/lib/settings";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "פיצ'רים", robots: { index: false } };
export const dynamic = "force-dynamic";

/** ~70 מתגי פיצ'רים — כל שינוי חל מיד, בלי דיפלוי */
export default function AdminFeaturesPage() {
  const map = getFeatureFlags();
  const flags: Flag[] = Object.entries(map)
    .map(([key, value]) => ({ key, enabled: value.enabled, description: value.description, rollout_pct: value.rollout_pct }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const byStatus = { on: flags.filter((f) => f.enabled).length, off: flags.filter((f) => !f.enabled).length };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">🧩 פיצ'רים ומתגים</h1>
        <p className="mt-1 text-sm text-ink-400">
          {formatNumber(flags.length)} פיצ'רים מוגדרים במערכת · {byStatus.on} פעילים · {byStatus.off} כבויים.
        </p>
      </header>

      <FlagsEditor initial={flags} />

      <CardsShowcase flags={flags} />
    </div>
  );
}
