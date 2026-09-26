import type { Metadata } from "next";
import Link from "next/link";
import { RedeemPanel } from "@/components/site/redeem-panel";
import { userRedemptions } from "@/lib/giftcards";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "מימוש גיפט קארד",
  description: "מממשים כרטיס מתנה ומקבלים מנוי פלוס — בלי כרטיס אשראי.",
};
export const dynamic = "force-dynamic";

/** מסך מימוש כרטיס מתנה — מסלול התשלום בלי סולק */
export default async function RedeemPage() {
  const session = await getCurrentSession();
  const rows = session ? userRedemptions(session.user.id) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl font-black">🎁 גיפט קארד</h1>
        <p className="mt-1 text-ink-300">
          שילמת בכרטיס מתנה? הזן את הקוד כאן ותקבל מנוי פלוס. אפשר לשלם גם בכרטיס שנקנה בחנות —
          הקוד עובר לאישור אנושי כדי שאף אחד לא ינצל כרטיס שכבר נוצל.
        </p>
      </header>

      {!session ? (
        <div className="card-surface rounded-2xl p-5">
          <p className="text-sm text-ink-300">
            כדי לממש כרטיס צריך חשבון — כך המנוי נשמר על שמך.
          </p>
          <div className="mt-3 flex gap-3">
            <Link href="/login?next=/redeem" className="rounded-xl bg-lemon-400 px-4 py-2 font-bold text-ink-950">
              התחברות
            </Link>
            <Link href="/register" className="rounded-xl bg-white/[0.08] px-4 py-2 font-bold">
              פתיחת חשבון חינם
            </Link>
          </div>
        </div>
      ) : null}

      <RedeemPanel initial={rows} signedIn={Boolean(session)} />
    </div>
  );
}
