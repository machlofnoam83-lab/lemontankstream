"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Button, Card, Checkbox, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export type AdminPlan = {
  code: string;
  name_he: string;
  name_en: string;
  tagline: string | null;
  price_ils: number;
  old_price_ils: number | null;
  currency: string;
  max_streams: number;
  max_profiles: number;
  max_quality: string;
  downloads_allowed: number;
  ads_enabled: number;
  ads_free_bypass: number;
  trial_days: number;
  early_access: number;
  features_json: string;
  badge_color: string;
  is_active: number;
  subscribers?: number;
};

/** עריכת מסלולי המנוי (חינם/פלוס) — מחיר, מגבלות והטבות */
export function PlansEditor({ plans }: { plans: AdminPlan[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, AdminPlan>>(() => Object.fromEntries(plans.map((p) => [p.code, { ...p }])));

  const set = (code: string, key: keyof AdminPlan, value: AdminPlan[keyof AdminPlan]) =>
    setDrafts((prev) => ({ ...prev, [code]: { ...prev[code], [key]: value } }));

  const save = async (plan: AdminPlan) => {
    setBusy(plan.code);
    const res = await apiCall("/api/plans", {
      method: "PATCH",
      body: {
        code: plan.code,
        name_he: plan.name_he,
        tagline: plan.tagline ?? "",
        price_ils: Number(plan.price_ils),
        old_price_ils: plan.old_price_ils ? Number(plan.old_price_ils) : null,
        max_streams: Number(plan.max_streams),
        max_profiles: Number(plan.max_profiles),
        max_quality: plan.max_quality,
        downloads_allowed: Boolean(plan.downloads_allowed),
        ads_enabled: Boolean(plan.ads_enabled),
        ads_free_bypass: Boolean(plan.ads_free_bypass),
        trial_days: Number(plan.trial_days),
        early_access: Boolean(plan.early_access),
        features_json: String(plan.features_json || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        badge_color: plan.badge_color,
        is_active: Boolean(plan.is_active),
      },
    });
    setBusy(null);

    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push("המסלול עודכן — השינוי חל מיד על כל האתר", "success");
    router.refresh();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {plans.map((plan) => {
        const draft = drafts[plan.code] ?? plan;
        return (
          <Card key={plan.code} className="p-5" as="section">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <span className="h-3 w-3 rounded-full" style={{ background: draft.badge_color }} />
                {draft.name_he}
                <span className="text-xs font-normal text-ink-400" dir="ltr">{plan.code}</span>
              </h2>
              <span className="text-xs text-ink-400">{plan.subscribers ?? 0} מנויים</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="שם בעברית" htmlFor={`n-${plan.code}`}>
                <Input id={`n-${plan.code}`} value={draft.name_he} onChange={(e) => set(plan.code, "name_he", e.target.value)} />
              </Field>
              <Field label="סלוגן" htmlFor={`t-${plan.code}`}>
                <Input id={`t-${plan.code}`} value={draft.tagline ?? ""} onChange={(e) => set(plan.code, "tagline", e.target.value)} />
              </Field>
              <Field label="מחיר חודשי (₪, כולל מע״מ)" htmlFor={`p-${plan.code}`}>
                <Input id={`p-${plan.code}`} type="number" step="0.01" value={draft.price_ils} onChange={(e) => set(plan.code, "price_ils", Number(e.target.value))} />
              </Field>
              <Field label="מחיר לפני הנחה (₪, ריק = אין)" htmlFor={`op-${plan.code}`}>
                <Input id={`op-${plan.code}`} type="number" step="0.01" value={draft.old_price_ils ?? ""} onChange={(e) => set(plan.code, "old_price_ils", e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
              <Field label="מסכים במקביל" htmlFor={`ms-${plan.code}`}>
                <Input id={`ms-${plan.code}`} type="number" value={draft.max_streams} onChange={(e) => set(plan.code, "max_streams", Number(e.target.value))} min={1} max={10} />
              </Field>
              <Field label="מקסימום פרופילים" htmlFor={`mp-${plan.code}`}>
                <Input id={`mp-${plan.code}`} type="number" value={draft.max_profiles} onChange={(e) => set(plan.code, "max_profiles", Number(e.target.value))} min={1} max={10} />
              </Field>
              <Field label="איכות מקסימלית" htmlFor={`q-${plan.code}`}>
                <Select id={`q-${plan.code}`} value={draft.max_quality} onChange={(e) => set(plan.code, "max_quality", e.target.value)}>
                  {["480p", "720p", "1080p", "1440p", "4K"].map((q) => <option key={q} value={q}>{q}</option>)}
                </Select>
              </Field>
              <Field label="ימי ניסיון" htmlFor={`tr-${plan.code}`}>
                <Input id={`tr-${plan.code}`} type="number" value={draft.trial_days} onChange={(e) => set(plan.code, "trial_days", Number(e.target.value))} min={0} max={90} />
              </Field>
              <div className="md:col-span-2">
                <Field label="הטבות בתצוגה (שורה לכל הטבה)" htmlFor={`f-${plan.code}`} hint="מוצג בטבלת המסלולים בעמוד /plans">
                  <textarea
                    id={`f-${plan.code}`}
                    value={(() => {
                      try {
                        return (JSON.parse(draft.features_json || "[]") as string[]).join("\n");
                      } catch {
                        return draft.features_json;
                      }
                    })()}
                    onChange={(e) => set(plan.code, "features_json", JSON.stringify(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)))}
                    rows={5}
                    className="w-full rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm"
                  />
                </Field>
              </div>
              <Field label="צבע תג" htmlFor={`c-${plan.code}`}>
                <div className="flex items-center gap-2">
                  <input id={`c-${plan.code}`} type="color" value={draft.badge_color} onChange={(e) => set(plan.code, "badge_color", e.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
                  <Input value={draft.badge_color} onChange={(e) => set(plan.code, "badge_color", e.target.value)} dir="ltr" />
                </div>
              </Field>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Checkbox label="הורדות אופליין" checked={Boolean(draft.downloads_allowed)} onChange={(e) => set(plan.code, "downloads_allowed", e.target.checked ? 1 : 0)} />
              <Checkbox label="הצגת פרסומות" checked={Boolean(draft.ads_enabled)} onChange={(e) => set(plan.code, "ads_enabled", e.target.checked ? 1 : 0)} />
              <Checkbox label="עקיפת פרסומות כשיש מנוי" checked={Boolean(draft.ads_free_bypass)} onChange={(e) => set(plan.code, "ads_free_bypass", e.target.checked ? 1 : 0)} />
              <Checkbox label="גישה מוקדמת לפרקים" checked={Boolean(draft.early_access)} onChange={(e) => set(plan.code, "early_access", e.target.checked ? 1 : 0)} />
              <Checkbox label="המסלול פעיל באתר" checked={Boolean(draft.is_active)} onChange={(e) => set(plan.code, "is_active", e.target.checked ? 1 : 0)} />
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={() => save(draft)} loading={busy === plan.code}>שמור את {draft.name_he}</Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
