import type { Metadata } from "next";
import { Card } from "@/components/ui/primitives";
import { RequestsBoard } from "@/components/site/requests-board";
import { listRequests, requestStats } from "@/lib/requests";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "בקשו כותר",
  description: "סרט או סדרה שלא קיימים בספרייה? בקשו, חזקו בקשות של אחרים, וקבלו התראה כשהתוכן עולה.",
};
export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const session = await getCurrentSession();
  const rows = listRequests({ userId: session?.user.id ?? null, status: "open", limit: 60 });
  const stats = requestStats();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-3xl font-black md:text-4xl">🗳️ בקשו כותר</h1>
        <p className="mt-2 text-ink-300">
          הספרייה נבנית לפי מה שאתם רוצים לראות. בקשו תוכן, חזקו בקשות של אחרים — ואנחנו עובדים לפי סדר הביקוש.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <div className="text-[0.85rem] text-ink-400">בקשות פתוחות</div>
          <div className="mt-1 text-2xl font-black">{stats.open}</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-[0.85rem] text-ink-400">סה&quot;כ קולות</div>
          <div className="mt-1 text-2xl font-black">{stats.votes}</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-[0.85rem] text-ink-400">נוספו אחרי בקשה</div>
          <div className="mt-1 text-2xl font-black text-lemon-300">{stats.added}</div>
        </Card>
      </div>

      <RequestsBoard initial={rows} loggedIn={Boolean(session)} />
    </div>
  );
}
