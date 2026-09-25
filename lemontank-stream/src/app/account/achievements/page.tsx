import type { Metadata } from "next";
import { Card, DataTable } from "@/components/ui/primitives";
import { AchievementsBoard } from "@/components/site/achievements-board";
import { badgeProgress, leaderboard, syncBadges, userPoints } from "@/lib/gamification";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "ההישגים שלי", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const user = await requireUser();
  syncBadges(user.id);

  const badges = badgeProgress(user.id);
  const earned = badges.filter((b) => b.earned).length;
  const top = leaderboard(10);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">🏆 ההישגים שלי</h1>
        <p className="mt-1 text-ink-300">
          כל צפייה, דירוג וביקורת מקדמים אותך. {earned} מתוך {badges.length} תגים הושגו · {userPoints(user.id).toLocaleString("he-IL")} נקודות
        </p>
      </header>

      <AchievementsBoard initial={{ earnedCount: earned, totalCount: badges.length, points: userPoints(user.id) }} />

      <Card className="p-4">
        <h2 className="text-xl font-bold">טבלת המצטיינים</h2>
        <p className="mb-3 text-[0.85rem] text-ink-400">הצופים עם הכי הרבה נקודות באתר</p>
        <DataTable head={["#", "משתמש", "תגים", "נקודות"]}>
          {top.map((row, index) => (
            <tr key={row.user_id} className={row.user_id === user.id ? "bg-lemon-400/10" : undefined}>
              <td className="px-3 py-2 font-black text-ink-400">
                {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
              </td>
              <td className="px-3 py-2 font-bold">
                {row.name}
                {row.user_id === user.id && <span className="ms-2 text-[0.8rem] text-lemon-300">(אתה)</span>}
              </td>
              <td className="px-3 py-2 text-ink-300">{row.badges}</td>
              <td className="px-3 py-2 font-black text-lemon-300">{Number(row.points).toLocaleString("he-IL")}</td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </div>
  );
}
