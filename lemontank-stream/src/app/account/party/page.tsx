import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { JoinByCode, MyParties } from "@/components/site/party-widgets";
import { myParties } from "@/lib/party";
import { requireUser } from "@/lib/session";
import { count } from "@/lib/db";

export const metadata: Metadata = { title: "צפייה משותפת", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PartyHubPage() {
  const user = await requireUser();
  const parties = myParties(user.id);
  const hosted = count("SELECT COUNT(*) c FROM watch_parties WHERE host_id = ?", [user.id]);
  const joined = count("SELECT COUNT(*) c FROM watch_party_members WHERE user_id = ?", [user.id]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">🎉 צפייה משותפת</h1>
        <p className="mt-1 text-ink-300">
          צופים יחד, מסונכרנים לאותה שנייה. אחד מארח, כולם הולכים אחריו — מושלם לסרט עם חברים או לפרק עם המשפחה.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">חדרים פעילים</div>
          <div className="mt-1 text-3xl font-black">{parties.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">אירחת</div>
          <div className="mt-1 text-3xl font-black">{hosted}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">הצטרפת</div>
          <div className="mt-1 text-3xl font-black">{joined}</div>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="text-xl font-bold">החדרים שלי</h2>
        <div className="mt-3">
          <MyParties initial={parties} />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-xl font-bold">יש לך קוד מחבר?</h2>
        <p className="mb-3 text-[0.9rem] text-ink-400">הדבק אותו כאן ונכנס לחדר מיד</p>
        <JoinByCode />
      </Card>

      <Card className="p-4">
        <h2 className="text-xl font-bold">איך פותחים חדר?</h2>
        <ol className="mt-2 space-y-2 text-[0.95rem] text-ink-300">
          <li>1. נכנסים לדף של סרט או פרק.</li>
          <li>2. לוחצים על <b className="text-plus-200">🎉 ארח צפייה משותפת</b>.</li>
          <li>3. שולחים לחברים את הקישור או הקוד שקיבלתם.</li>
          <li>4. לוחצים Play — ומכאן כולם מסונכרנים איתך.</li>
        </ol>
        <Link href="/movies" className="mt-3 inline-block rounded-xl bg-lemon-400 px-4 py-2 font-bold text-ink-950">
          בחר משהו לצפות בו
        </Link>
      </Card>
    </div>
  );
}
