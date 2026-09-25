import type { Metadata } from "next";
import { ProfilesManager } from "@/components/site/profiles-manager";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "פרופילים", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const user = await requireUser();
  const profiles = all<{
    id: number;
    name: string;
    avatar_url: string | null;
    color: string;
    is_kid: number;
    maturity_limit: string;
    lang_audio: string;
    lang_subs: string;
    has_pin: number;
  }>(
    `SELECT id, name, avatar_url, color, is_kid, maturity_limit, lang_audio, lang_subs, (pin_hash IS NOT NULL) AS has_pin
     FROM profiles WHERE user_id = ? ORDER BY sort_order, id`,
    [user.id],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black md:text-3xl">👨‍👩‍👧 פרופילים</h1>
        <p className="mt-1 text-sm text-ink-400">
          כל פרופיל עם המלצות, היסטוריית צפייה ושפה משלו. פרופיל ילדים מוגבל לתכנים לגיל הרך/ילדים בלבד.
        </p>
      </header>
      <ProfilesManager initialProfiles={profiles} maxProfiles={user.effective_plan === "plus" ? 5 : 2} isPlus={user.effective_plan === "plus"} />
    </div>
  );
}
