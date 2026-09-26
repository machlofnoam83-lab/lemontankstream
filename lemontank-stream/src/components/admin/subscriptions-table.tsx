"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Badge, Button, DataTable, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatPrice } from "@/lib/format";

export type AdminSubscription = {
  id: number;
  user_id: number;
  email: string;
  name: string;
  plan_code: string;
  status: string;
  started_at: string;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: number;
  provider: string;
  paid_total: number;
};

const STATUS_LABEL: Record<string, string> = {
  active: "פעיל",
  trialing: "בניסיון",
  past_due: "בפיגור",
  canceled: "בוטל",
  expired: "הסתיים",
};

/** טבלת מנויים עם פעולות: הארכה ב-30 יום, ביטול מיידי ומעבר לפלוס */
export function SubscriptionsTable({ items }: { items: AdminSubscription[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const act = async (sub: AdminSubscription, action: "extend" | "cancel" | "grant") => {
    setBusy(sub.id);
    const body =
      action === "extend"
        ? { plan_code: "plus", plan_until: new Date(Math.max(Date.now(), sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0) + 30 * 86_400_000).toISOString() }
        : action === "grant"
          ? { plan_code: "plus", plan_until: new Date(Date.now() + 30 * 86_400_000).toISOString() }
          : { plan_code: "free" };

    const res = await apiCall(`/api/users/${sub.user_id}`, { method: "PATCH", body });
    setBusy(null);

    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push(
      action === "cancel" ? "המנוי בוטל והמשתמש עבר למסלול חינם" : action === "extend" ? "המנוי הוארך ב-30 יום" : "ניתן מנוי פלוס ל-30 יום",
      "success",
    );
    router.refresh();
  };

  if (items.length === 0) return <EmptyState title="לא נמצאו מנויים" icon="💳" description="נסה לשנות את הסינון." />;

  return (
    <DataTable head={["#", "משתמש", "מסלול", "סטטוס", "התחלה", "סוף תקופה", "ניסיון", "ספק", "שולם", "פעולות"]}>
      {items.map((sub) => (
        <tr key={sub.id} className="hover:bg-white/[0.03]">
          <td className="px-3 py-2 font-mono text-[0.85rem] text-ink-500">{sub.id}</td>
          <td className="px-3 py-2">
            <span className="block text-xs font-medium">{sub.name}</span>
            <span className="block text-[0.8rem] text-ink-500" dir="ltr">{sub.email}</span>
          </td>
          <td className="px-3 py-2">
            <Badge tone={sub.plan_code === "plus" ? "plus" : "free"}>{sub.plan_code === "plus" ? "פלוס" : "חינם"}</Badge>
          </td>
          <td className="px-3 py-2">
            <Badge tone={sub.status === "active" ? "success" : sub.status === "trialing" ? "info" : sub.status === "past_due" ? "warn" : "danger"}>
              {STATUS_LABEL[sub.status] ?? sub.status}
            </Badge>
            {sub.cancel_at_period_end ? <span className="ms-1 text-[0.8rem] text-amber-300">(יסתיים)</span> : null}
          </td>
          <td className="px-3 py-2 text-[0.85rem] text-ink-400">{formatDate(sub.started_at)}</td>
          <td className="px-3 py-2 text-[0.85rem] text-ink-400">{sub.current_period_end ? formatDate(sub.current_period_end) : "—"}</td>
          <td className="px-3 py-2 text-[0.85rem] text-ink-400">{sub.trial_end ? formatDate(sub.trial_end) : "—"}</td>
          <td className="px-3 py-2 text-[0.85rem] text-ink-500" dir="ltr">{sub.provider}</td>
          <td className="px-3 py-2 text-xs">{formatPrice(Number(sub.paid_total ?? 0))}</td>
          <td className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-1">
              <Button size="sm" variant="ghost" loading={busy === sub.id} onClick={() => act(sub, "extend")}>+30 יום</Button>
              <Button size="sm" variant="ghost" loading={busy === sub.id} onClick={() => act(sub, "grant")}>הענק פלוס</Button>
              {sub.plan_code === "plus" ? (
                <Button size="sm" variant="ghost" loading={busy === sub.id} onClick={() => act(sub, "cancel")}>בטל</Button>
              ) : null}
            </div>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
