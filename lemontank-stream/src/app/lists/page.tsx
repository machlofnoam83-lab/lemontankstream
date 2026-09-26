import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { ListsManager } from "@/components/site/lists-manager";
import { myLists } from "@/lib/lists";
import { requireUser } from "@/lib/session";
import { count } from "@/lib/db";

export const metadata: Metadata = { title: "הרשימות שלי", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const user = await requireUser();
  const lists = myLists(user.id);
  const shared = lists.filter((l) => l.is_public).length;
  const totalItems = lists.reduce((sum, l) => sum + Number(l.item_count ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-3xl font-black">📚 הרשימות שלי</h1>
        <p className="mt-1 text-ink-300">
          אוספים אישיים עם שם, הערות ושיתוף — לארגן מה לראות, למי, ומתי.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">רשימות</div>
          <div className="mt-1 text-2xl font-black">{lists.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">כותרים באוספים</div>
          <div className="mt-1 text-2xl font-black">{totalItems}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">משותפות</div>
          <div className="mt-1 text-2xl font-black">{shared}</div>
        </Card>
      </div>

      <ListsManager initial={lists} />

      <Card className="p-4">
        <h2 className="text-lg font-bold">איך מוסיפים כותרים?</h2>
        <p className="mt-1 text-[0.95rem] text-ink-300">
          נכנסים לדף של סרט או סדרה ולוחצים על <b>הוסף לרשימה</b>. אפשר לבחור לאיזו רשימה, ולהוסיף הערה אישית
          (למשל: &quot;דקה 40 — הסצנה שצריך לראות&quot;). יש לך {totalItems} כותרים באוספים.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/movies" className="rounded-xl bg-lemon-400 px-4 py-2 font-bold text-ink-950">לסרטים</Link>
          <Link href="/series" className="rounded-xl bg-white/[0.07] px-4 py-2 font-bold hover:bg-white/[0.12]">לסדרות</Link>
        </div>
      </Card>
    </div>
  );
}
