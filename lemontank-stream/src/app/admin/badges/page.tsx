import type { Metadata } from "next";
import { Card, DataTable, StatCard } from "@/components/ui/primitives";
import { BADGES, ensureBadgeCatalog, leaderboard } from "@/lib/gamification";
import { all, count } from "@/lib/db";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "הישגים ותגים", robots: { index: false } };
export const dynamic = "force-dynamic";

const TIER_HE: Record<string, string> = { bronze: "ארד", silver: "כסף", gold: "זהב", legend: "אגדה" };

export default function AdminBadgesPage() {
  ensureBadgeCatalog();

  const earnedByBadge = new Map(
    all<{ badge_code: string; c: number }>(
      "SELECT badge_code, COUNT(*) c FROM user_badges GROUP BY badge_code",
    ).map((row) => [row.badge_code, Number(row.c)]),
  );
  const totalAwards = count("SELECT COUNT(*) c FROM user_badges");
  const players = count("SELECT COUNT(DISTINCT user_id) c FROM user_badges");
  const top = leaderboard(15);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">🏆 הישגים ותגים</h1>
        <p className="mt-1 text-sm text-ink-400">
          {BADGES.length} תגים מוגדרים · {formatNumber(totalAwards)} הענקות · {formatNumber(players)} משתמשים עם הישגים.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="תגים במערכת" value={String(BADGES.length)} />
        <StatCard label="סך הענקות" value={formatNumber(totalAwards)} />
        <StatCard label="משתמשים עם הישג" value={formatNumber(players)} />
      </div>

      <Card className="p-4">
        <h2 className="text-lg font-bold">קטלוג התגים</h2>
        <div className="mt-3">
          <DataTable head={["תג", "דרגה", "נקודות", "תנאי", "הושגו"]}>
            {BADGES.map((badge) => (
              <tr key={badge.code}>
                <td className="px-3 py-2 font-bold">
                  {badge.icon} {badge.name_he}
                </td>
                <td className="px-3 py-2 text-ink-300">{TIER_HE[badge.tier]}</td>
                <td className="px-3 py-2 font-black text-lemon-300">{badge.points}</td>
                <td className="px-3 py-2 text-ink-300">{badge.description}</td>
                <td className="px-3 py-2">{formatNumber(earnedByBadge.get(badge.code) ?? 0)}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-bold">המצטיינים</h2>
        <div className="mt-3">
          <DataTable head={["#", "משתמש", "תגים", "נקודות"]}>
            {top.map((row, index) => (
              <tr key={row.user_id}>
                <td className="px-3 py-2 font-black text-ink-400">{index + 1}</td>
                <td className="px-3 py-2 font-bold">{row.name}</td>
                <td className="px-3 py-2">{row.badges}</td>
                <td className="px-3 py-2 font-black text-lemon-300">{formatNumber(Number(row.points))}</td>
              </tr>
            ))}
          </DataTable>
          {!top.length && <p className="py-6 text-center text-ink-400">עוד אין משתמשים עם הישגים — התגים מוענקים אוטומטית עם פעילות באתר.</p>}
        </div>
      </Card>
    </div>
  );
}
