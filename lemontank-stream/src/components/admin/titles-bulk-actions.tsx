"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Button, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** פעולות מרובות על כותרים: שינוי מסלול (חינם/פלוס) בבת אחת, פרסום ומחיקה */
export function TitlesBulkActions({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("plan:plus");

  const selectedIds = (): number[] =>
    Array.from(document.querySelectorAll<HTMLInputElement>('input[name="titleId"]:checked')).map((el) => Number(el.value));

  const run = async () => {
    const ids = selectedIds();
    if (!ids.length) {
      toast.push("בחר לפחות כותר אחד", "error");
      return;
    }

    setBusy(true);
    let ok = 0;

    for (const id of ids) {
      let res;
      if (action === "plan:plus" || action === "plan:free") {
        res = await apiCall(`/api/titles/${id}`, { method: "PATCH", body: { plan_access: action === "plan:plus" ? "plus" : "free" } });
      } else if (action === "publish") {
        res = await apiCall(`/api/titles/${id}`, { method: "PATCH", body: { status: "published" } });
      } else if (action === "draft") {
        res = await apiCall(`/api/titles/${id}`, { method: "PATCH", body: { status: "draft" } });
      } else {
        res = await apiCall(`/api/titles/${id}`, { method: "DELETE" });
      }
      if (res.ok) ok++;
    }

    setBusy(false);
    toast.push(`בוצע על ${ok} מתוך ${ids.length} כותרים`, ok === ids.length ? "success" : "info");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <span className="text-xs text-ink-300">פעולה על הנבחרים:</span>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-auto" aria-label="בחר פעולה">
          <option value="plan:plus">העבר למסלול פלוס ⭐</option>
          <option value="plan:free">העבר למסלול חינם 🆓</option>
          <option value="publish">פרסם באתר</option>
          <option value="draft">החזר לטיוטה</option>
          <option value="delete">מחק (מחיקה רכה)</option>
        </Select>
        <Button size="sm" variant={action === "delete" ? "danger" : "primary"} onClick={run} loading={busy}>
          החל
        </Button>
        <span className="text-[11px] text-ink-500">הפעולה נרשמת ביומן הביקורת עם שם המבצע</span>
      </div>
      {children}
    </div>
  );
}
