"use client";

import { useEffect } from "react";
import { BurntPage } from "@/components/ui/states";

/**
 * שגיאה בעמוד אתר. Next מעביר `error` ו-`reset`.
 * אנחנו לא מציגים את ה-digest למשתמש — הוא נכתב ליומן האבטחה בלבד —
 * אבל נותנים לו דרך אחת קדימה ושתי דלתות יציאה.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // נכתב ליומן הדפדפן בלבד; השרת כבר רשם את האירוע בצד שלו.
    console.error("[lemontank] site error", error.digest ?? "", error.message);
  }, [error]);

  return (
    <BurntPage
      title="הדף הזה עלה באש"
      hint="הקריאה נעצרה באמצע הדרך. הנר נשאר דלוק — אפשר לנסות שוב, או לחזור למדפים."
      onRetry={reset}
      homeHref="/"
      homeLabel="חזרה למדף"
    />
  );
}
