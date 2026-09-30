import type { Metadata } from "next";
import { GiftCardsConsole, type GiftCardsData } from "@/components/admin/giftcards-console";
import { giftCardStats, listGiftCards, listRedemptions } from "@/lib/giftcards";
import { outboundConfig, outboundReady, recentOutbound } from "@/lib/notify-out";
import { requirePermission } from "@/lib/rbac";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = { title: "תשלומים וגיפט קארד · ניהול", robots: { index: false } };
export const dynamic = "force-dynamic";

/** קונסולת התשלומים — הנפקת כרטיסים, אישור בקשות תשלום, וערוצי התראות */
export default async function AdminGiftCardsPage() {
  const session = await getCurrentSession();
  requirePermission(session?.user, "billing.read");
  const config = outboundConfig();

  const initial: GiftCardsData = {
    stats: giftCardStats(),
    cards: listGiftCards(200) as GiftCardsData["cards"],
    requests: listRedemptions({ limit: 200 }) as GiftCardsData["requests"],
    pending: listRedemptions({ status: "pending", limit: 100 }) as GiftCardsData["pending"],
    alerts: {
      ready: outboundReady(),
      discord: Boolean(config.discord),
      webhook: Boolean(config.webhook),
      email: config.emailReady,
      recent: recentOutbound(15) as GiftCardsData["alerts"]["recent"],
    },
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">💳 תשלומים וגיפט קארד</h1>
        <p className="mt-1 text-ink-300">
          מסלול תשלום בלי סולק: אתה מנפיק קודים, לקוח מממש ומקבל מנוי. כרטיסים חיצוניים ממתינים
          לאישור שלך, וכל בקשה נשלחת גם להתראה חיצונית (דיסקורד/מייל).
        </p>
      </header>

      <GiftCardsConsole initial={initial} canManage={["admin", "owner"].includes(session?.user.role ?? "")} />
    </div>
  );
}
