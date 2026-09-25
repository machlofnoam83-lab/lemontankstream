"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** פעולות תחזוקה ואבטחה: ניקוי, סריקת שלמות ואופטימיזציה */
export function SecurityActions({
  integrity,
  fkViolations,
  canManage,
}: {
  integrity: string;
  fkViolations: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const call = async (action: "prune" | "rescan" | "maintenance" | "optimize") => {
    setBusy(action);
    const res = await apiCall<Record<string, unknown>>("/api/admin/security", { method: "POST", body: { action } });
    setBusy(null);

    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }

    if (action === "prune") {
      const pruned = (res.data as { pruned?: { rateLimits: number; sessions: number } }).pruned;
      toast.push(`נוקו ${pruned?.rateLimits ?? 0} חלונות קצב ו-${pruned?.sessions ?? 0} טוקנים פגי תוקף`, "success");
    } else if (action === "maintenance") {
      const report = (res.data as { report?: { sessions: number; analytics: number; notifications: number } }).report;
      toast.push(
        `תחזוקה הושלמה: ${report?.sessions ?? 0} סשנים, ${report?.analytics ?? 0} רשומות אנליטיקה ו-${report?.notifications ?? 0} התראות נוקו`,
        "success",
      );
    } else if (action === "optimize") {
      const result = (res.data as { result?: { vacuumed: boolean; analyzed: boolean } }).result;
      toast.push(`אופטימיזציה הושלמה (VACUUM: ${result?.vacuumed ? "כן" : "לא"}, ANALYZE: ${result?.analyzed ? "כן" : "לא"})`, "success");
    } else {
      const data = res.data as { integrity?: string; foreignKeyViolations?: number; orphanSessions?: number };
      toast.push(
        `סריקה הושלמה: שלמות=${data.integrity}, הפרות=${data.foreignKeyViolations ?? 0}, סשנים יתומים=${data.orphanSessions ?? 0}`,
        (data.integrity === "ok" && (data.foreignKeyViolations ?? 0) === 0) ? "success" : "error",
      );
    }
    router.refresh();
  };

  return (
    <Card className="p-5">
      <h2 className="text-sm font-bold">🔧 פעולות אבטחה ותחזוקה</h2>
      {!canManage ? (
        <p className="mt-2 text-[0.85rem] text-amber-300">פעולות התחזוקה זמינות לחשבון בעלים בלבד. ניתן לצפות בכל הנתונים למטה.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => call("prune")} loading={busy === "prune"}>
          נקה חלונות קצב וטוקנים שפגו
        </Button>
        <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => call("rescan")} loading={busy === "rescan"}>
          סרוק שלמות מחדש
        </Button>
        <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => call("maintenance")} loading={busy === "maintenance"}>
          הרץ תחזוקה מלאה
        </Button>
        <Button size="sm" variant="ghost" disabled={!canManage} onClick={() => call("optimize")} loading={busy === "optimize"}>
          אופטימיזציה (VACUUM)
        </Button>
        <span className="text-[0.85rem] text-ink-400">
          סטטוס נוכחי: שלמות={integrity}, הפרות מפתח זר={fkViolations}
        </span>
      </div>
    </Card>
  );
}
