import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { ProfilePicker } from "@/components/site/profile-picker";
import { activeProfile, exitRequiresPin, listProfiles, maxProfilesFor } from "@/lib/profiles";
import { getCurrentSession } from "@/lib/session";
import { get } from "@/lib/db";

export const metadata: Metadata = { title: "מי צופה?", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * מסך בחירת פרופיל — "מי צופה?".
 * הבחירה נשמרת על הסשן, ומכאן והלאה כל הקטלוג מסונן לפי הפרופיל.
 */
export default async function ProfilesChooserPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/profiles");

  const profiles = listProfiles(session.user.id);

  const sessionRow = get<{ profile_id: number | null }>("SELECT profile_id FROM sessions WHERE id = ?", [
    session.session.id,
  ]);
  const active = activeProfile(session.user.id, sessionRow?.profile_id ?? null);

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 py-10">
      <h1 className="text-3xl font-black md:text-5xl">מי צופה?</h1>
      <p className="mt-2 text-center text-ink-300">
        כל פרופיל עם היסטוריית צפייה, המלצות ושפה משלו.
        {active?.is_kid ? " את/ה בפרופיל ילדים — התכנים מסוננים לפי גיל." : ""}
      </p>

      <div className="mt-8 w-full max-w-3xl">
        {profiles.length === 0 ? (
          <Card className="p-6 text-center">
            <div className="text-4xl">👋</div>
            <h2 className="mt-2 text-xl font-bold">עוד אין פרופילים</h2>
            <p className="mt-1 text-ink-300">
              פרופיל מאפשר לכל אחד במשפחה לקבל היסטוריה, המלצות ושפה משלו — ופרופיל ילדים מוגבל לגילים מתאימים.
            </p>
            <Link
              href="/account/profiles"
              className="mt-4 inline-block rounded-xl bg-lemon-400 px-5 py-2.5 font-bold text-ink-950"
            >
              יצירת הפרופיל הראשון
            </Link>
          </Card>
        ) : (
          <ProfilePicker profiles={profiles} activeId={active?.id ?? null} exitLocked={exitRequiresPin(active)} />
        )}
      </div>

      {profiles.length < maxProfilesFor(session.user.effective_plan) && (
        <Link
          href="/account/profiles"
          className="mt-8 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-[0.95rem] hover:bg-white/[0.1]"
        >
          ➕ הוספת פרופיל ({profiles.length}/{maxProfilesFor(session.user.effective_plan)})
        </Link>
      )}

      <p className="mt-6 max-w-lg text-center text-[0.85rem] text-ink-400">
        פרופיל ילדים מוגבל אוטומטית לתכנים מתאימים. כדי לצאת מפרופיל ילדים צריך קוד — כך המכשיר נשאר בטוח גם כשאתה לא לידו.
      </p>
    </div>
  );
}
