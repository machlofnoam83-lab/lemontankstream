"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Button, Card, Checkbox, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** בקרות פרטיות: ייצוא נתונים, מחיקת היסטוריה, ניהול הסכמות, מחיקת חשבון */
export function PrivacyControls({ marketingOptIn }: { marketingOptIn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [marketing, setMarketing] = useState(marketingOptIn);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const exportData = () => {
    window.location.href = "/api/export?type=my-data";
  };

  const deleteHistory = async () => {
    setBusy("history");
    const res = await apiCall("/api/progress", { method: "DELETE", body: { all: true } });
    setBusy(null);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push("היסטוריית הצפייה נמחקה", "success");
    router.refresh();
  };

  const saveMarketing = async (value: boolean) => {
    setMarketing(value);
    const res = await apiCall("/api/users/me", { method: "PATCH", body: { marketing_opt_in: value } }).catch(() => null);
    if (res && !res.ok) toast.push("שמירה נכשלה", "error");
    else toast.push(value ? "נרשמת לעדכונים ✓" : "הוסרת מרשימת התפוצה", "info");
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-bold">📦 ייצוא הנתונים שלי</h2>
        <p className="mt-1 text-xs text-ink-400">
          קובץ JSON מלא: פרטי חשבון, פרופילים, היסטוריית צפייה, רשימות, דירוגים, תשלומים וסשנים. בלי סיסמאות או סודות.
        </p>
        <Button className="mt-3" variant="ghost" onClick={exportData} loading={busy === "export"}>
          הורדת קובץ הנתונים
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold">🧹 מחיקת היסטוריית צפייה</h2>
        <p className="mt-1 text-xs text-ink-400">
          מוחק את כל רשומות ההתקדמות — ההמלצות שלך יתאפסו, אבל החשבון עצמו נשאר.
        </p>
        <Button className="mt-3" variant="danger" onClick={deleteHistory} loading={busy === "history"}>
          מחק את כל ההיסטוריה
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold">📬 הסכמה לדיוור</h2>
        <p className="mt-1 text-xs text-ink-400">אנחנו שולחים עדכוני תוכן בלבד, בלי ספאם. אפשר להסיר בכל רגע.</p>
        <Checkbox
          className="mt-3"
          label="קבל עדכונים על תוכן חדש ומבצעים במייל"
          checked={marketing}
          onChange={(e) => saveMarketing(e.target.checked)}
        />
      </Card>

      <Card className="border-red-500/30 p-5">
        <h2 className="text-sm font-bold text-red-300">🗑️ מחיקת חשבון לצמיתות</h2>
        <p className="mt-1 text-xs text-ink-400">
          הפעולה בלתי הפיכה: החשבון, הפרופילים, ההיסטוריה והרשימות יימחקו. חשבוניות נשמרות בהתאם לדרישות חוק.
          אם יש לך מנוי פלוס פעיל — יש לבטל אותו קודם.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='הקלד "מחק את החשבון" לאישור'
            className="max-w-xs"
            aria-label="אישור מחיקת חשבון"
          />
          <Button
            variant="danger"
            disabled={confirmText.trim() !== "מחק את החשבון"}
            onClick={async () => {
              setBusy("delete");
              const res = await apiCall("/api/users/me", { method: "DELETE", body: { confirm: true } });
              setBusy(null);
              if (!res.ok) {
                toast.push(res.error.message, "error");
                return;
              }
              toast.push("החשבון נמחק. להתראות 👋", "info");
              router.push("/");
              router.refresh();
            }}
            loading={busy === "delete"}
          >
            מחק את החשבון שלי
          </Button>
        </div>
      </Card>
    </div>
  );
}
