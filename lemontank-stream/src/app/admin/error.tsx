"use client";

import { useEffect } from "react";
import { BurntPage } from "@/components/ui/states";

/** שגיאה במסך ניהול — אותו דף שרוף, אבל הדלת מובילה חזרה למשרד */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[lemontank] admin error", error.digest ?? "", error.message);
  }, [error]);

  return (
    <BurntPage
      title="המשרד לא נפתח"
      hint="הנתונים לא נפגעו — הקריאה עצמה נעצרה. אפשר לנסות שוב."
      onRetry={reset}
      homeHref="/admin"
      homeLabel="למרכז הניהול"
    />
  );
}
