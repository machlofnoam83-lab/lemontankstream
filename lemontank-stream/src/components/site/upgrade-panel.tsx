"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";

/** כפתורי ההצטרפות/ביטול/חידוש מנוי — כולל מימוש קופון */
export function UpgradePanel({
  planCode,
  isCurrent,
  isLoggedIn,
  trialDays,
  priceLabel,
  cancelAtPeriodEnd,
  subscriptionStatus,
  periodEnd,
}: {
  planCode: string;
  isCurrent: boolean;
  isLoggedIn: boolean;
  trialDays: number;
  priceLabel: string;
  cancelAtPeriodEnd: boolean;
  subscriptionStatus: string | null;
  periodEnd: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [coupon, setCoupon] = useState("");
  const [showCoupon, setShowCoupon] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const call = async (action: "subscribe" | "trial" | "cancel" | "resume") => {
    if (!isLoggedIn) {
      router.push(`/register?plan=${planCode}`);
      return;
    }
    setLoading(action);
    const res = await apiCall<{ message: string }>("/api/subscriptions", {
      method: "POST",
      body: { action, plan_code: planCode, coupon: coupon || null },
    });
    setLoading(null);

    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push(res.data.message, "success");
    router.refresh();
  };

  // ── מסלול חינם ──
  if (planCode === "free") {
    if (isCurrent || !isLoggedIn) {
      return (
        <Button variant="outline" className="w-full" onClick={() => call("subscribe")} loading={loading === "subscribe"}>
          {isCurrent ? "המסלול הנוכחי שלך" : "התחל בחינם"}
        </Button>
      );
    }
    return (
      <Button variant="outline" className="w-full" onClick={() => call("subscribe")} loading={loading === "subscribe"}>
        חזרה למסלול חינם
      </Button>
    );
  }

  // ── מסלול פלוס, כבר מנוי ──
  if (isCurrent && subscriptionStatus && subscriptionStatus !== "canceled") {
    return (
      <div className="space-y-2">
        {cancelAtPeriodEnd ? (
          <>
            <p className="text-xs text-amber-300">
              המנוי יסתיים ב-{formatDate(periodEnd)} — אפשר לחזור בו בכל רגע.
            </p>
            <Button variant="primary" className="w-full" onClick={() => call("resume")} loading={loading === "resume"}>
              חדש את המנוי 🔄
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs text-emerald-300">המנוי פעיל {periodEnd ? `עד ${formatDate(periodEnd)}` : ""}</p>
            <Button variant="ghost" className="w-full" onClick={() => call("cancel")} loading={loading === "cancel"}>
              ביטול המנוי
            </Button>
          </>
        )}
      </div>
    );
  }

  // ── הצטרפות לפלוס ──
  return (
    <div className="space-y-2">
      {trialDays > 0 ? (
        <Button variant="plus" className="w-full" size="lg" onClick={() => call("trial")} loading={loading === "trial"}>
          התחל {trialDays} ימי ניסיון חינם
        </Button>
      ) : null}

      <Button variant={trialDays > 0 ? "ghost" : "plus"} className="w-full" onClick={() => call("subscribe")} loading={loading === "subscribe"}>
        {isLoggedIn ? `הצטרף לפלוס · ${priceLabel}/חודש` : `הרשמה ושדרוג · ${priceLabel}/חודש`}
      </Button>

      {showCoupon ? (
        <div className="flex gap-2">
          <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="קוד קופון" dir="ltr" maxLength={40} />
          <Button variant="outline" onClick={() => call("subscribe")} loading={loading === "subscribe"}>
            מימוש
          </Button>
        </div>
      ) : (
        <button onClick={() => setShowCoupon(true)} className="w-full text-center text-xs text-ink-400 hover:text-lemon-300">
          יש לך קוד קופון?
        </button>
      )}
    </div>
  );
}
