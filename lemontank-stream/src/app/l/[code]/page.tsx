import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { TitleCard } from "@/components/site/title-card";
import { listItems, publicListByCode } from "@/lib/lists";
import { getMaturityCeiling } from "@/lib/session";

export const metadata: Metadata = { title: "רשימה משותפת", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * רשימה משותפת — נגישה בקישור עם קוד, בלי התחברות.
 * חשיפה מינימלית: שם הרשימה, שם תצוגה של הבעלים, והכותרים שבתוכה.
 */
export default async function SharedListPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.trim().toLowerCase();
  if (!/^[a-f0-9]{12}$/.test(clean)) notFound();

  const list = publicListByCode(clean);
  if (!list) notFound();

  const ceiling = await getMaturityCeiling();
  const items = listItems(list.id, { maturityMax: ceiling });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="text-center">
        <div className="text-[0.9rem] text-ink-400">רשימה משותפת מאת {list.owner_name}</div>
        <h1 className="mt-1 text-3xl font-black md:text-4xl">{list.name}</h1>
        {list.description && <p className="mt-2 text-ink-300">{list.description}</p>}
        <p className="mt-2 text-[0.9rem] text-ink-400">{items.length} כותרים</p>
      </header>

      {items.length === 0 ? (
        <Card className="p-6 text-center text-ink-300">הרשימה ריקה כרגע.</Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((item) => (
            <div key={(item as { item_id: number }).item_id}>
              <TitleCard item={item as never} />
              {(item as { note?: string | null }).note && (
                <p className="mt-1 truncate text-[0.8rem] text-lemon-300/90">📝 {(item as { note?: string }).note}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="text-center">
        <Link href="/" className="rounded-xl bg-lemon-400 px-5 py-2.5 font-bold text-ink-950">
          גם אני רוצה — לדף הבית
        </Link>
      </div>
    </div>
  );
}
