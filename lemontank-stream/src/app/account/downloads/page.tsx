import type { Metadata } from "next";
import Link from "next/link";
import { DownloadsManager } from "@/components/site/downloads-manager";
import { downloadStats, myDownloads } from "@/lib/downloads";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "הורדות ומכשירים", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
  const user = await requireUser();
  const downloads = myDownloads(user.id);
  const stats = downloadStats(user.id);
  const isPlus = user.effective_plan === "plus";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-3xl font-black">📥 הורדות ומכשירים</h1>
        <p className="mt-1 text-ink-300">
          הורדות לצפייה בלי אינטרנט. כל הורדה בתוקף 48 שעות ומקושרת למכשיר — אפשר לנהל הכל מכאן.
        </p>
      </header>

      {!isPlus && (
        <div className="rounded-2xl border border-lemon-400/40 bg-lemon-400/10 p-4">
          <div className="font-bold">הורדות הן תכונת פלוס</div>
          <p className="mt-1 text-[0.92rem] text-ink-200">
            מנוי פלוס פותח הורדות, 4K ומסכים במקביל. <Link href="/plans" className="font-bold text-lemon-300 underline">לשדרוג</Link>
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white/[0.05] p-4 text-center">
          <div className="text-2xl font-black">{stats.active}</div>
          <div className="text-[0.85rem] text-ink-400">הורדות פעילות</div>
        </div>
        <div className="rounded-2xl bg-white/[0.05] p-4 text-center">
          <div className="text-2xl font-black">{stats.total}</div>
          <div className="text-[0.85rem] text-ink-400">סה&quot;כ הורדות</div>
        </div>
        <div className="rounded-2xl bg-white/[0.05] p-4 text-center">
          <div className="text-2xl font-black">{stats.devices}</div>
          <div className="text-[0.85rem] text-ink-400">מכשירים רשומים</div>
        </div>
      </div>

      <DownloadsManager initial={downloads} planLabel={isPlus ? "מנוי פלוס — עד 8 מכשירים" : "מנוי חינם — עד 3 מכשירים"} />
    </div>
  );
}
