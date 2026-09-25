import type { Metadata } from "next";
import { PrivacyControls } from "@/components/site/privacy-controls";
import { Card } from "@/components/ui/primitives";
import { requireUser } from "@/lib/session";
import { count, get } from "@/lib/db";

export const metadata: Metadata = { title: "פרטיות ונתונים", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const user = await requireUser();

  const summary = {
    history: count("SELECT COUNT(*) c FROM watch_progress WHERE user_id = ?", [user.id]),
    comments: count("SELECT COUNT(*) c FROM comments WHERE user_id = ?", [user.id]),
    reviews: count("SELECT COUNT(*) c FROM reviews WHERE user_id = ?", [user.id]),
    sessions: count("SELECT COUNT(*) c FROM sessions WHERE user_id = ?", [user.id]),
    analytics: count("SELECT COUNT(*) c FROM analytics_events WHERE user_id = ?", [user.id]),
  };

  const marketing = get<{ marketing_opt_in: number }>("SELECT marketing_opt_in FROM users WHERE id = ?", [user.id]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black md:text-3xl">🛡️ פרטיות ונתונים</h1>
        <p className="mt-1 text-sm text-ink-400">
          זכות העיון, התיקון והמחיקה שלך. אנחנו אוספים את המינימום הנדרש להפעלת השירות.
        </p>
      </header>

      <Card className="p-5">
        <h2 className="text-sm font-bold">הנתונים השמורים עליך</h2>
        <dl className="mt-3 grid gap-3 text-xs md:grid-cols-5">
          {[
            ["פריטי היסטוריה", summary.history],
            ["תגובות", summary.comments],
            ["ביקורות", summary.reviews],
            ["רשומות סשן", summary.sessions],
            ["אירועי אנליטיקה", summary.analytics],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <dt className="text-ink-400">{label}</dt>
              <dd className="mt-1 text-lg font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <PrivacyControls marketingOptIn={Boolean(marketing?.marketing_opt_in)} />
    </div>
  );
}
