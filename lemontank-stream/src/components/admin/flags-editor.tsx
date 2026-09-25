"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export type Flag = { key: string; enabled: boolean; description: string; rollout_pct: number };

/** מתגי פיצ'רים (Feature Flags) — שליטה חיה בהתנהגות האתר */
export function FlagsEditor({ initial }: { initial: Flag[] }) {
  const router = useRouter();
  const toast = useToast();
  const [flags, setFlags] = useState(initial);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flags;
    return flags.filter((f) => f.key.toLowerCase().includes(q) || f.description.toLowerCase().includes(q));
  }, [flags, query]);

  const toggle = async (flag: Flag) => {
    const next = !flag.enabled;
    setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, enabled: next } : f)));
    setBusy(flag.key);
    const res = await apiCall("/api/features", { method: "PATCH", body: { key: flag.key, enabled: next } });
    setBusy(null);

    if (!res.ok) {
      setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, enabled: flag.enabled } : f)));
      toast.push(res.error.message, "error");
      return;
    }
    setDirty((d) => d + 1);
  };

  const setRollout = (key: string, pct: number) => {
    setFlags((prev) => prev.map((f) => (f.key === key ? { ...f, rollout_pct: pct } : f)));
  };

  const saveRollout = async (flag: Flag) => {
    setBusy(flag.key);
    const res = await apiCall("/api/features", { method: "PATCH", body: { key: flag.key, enabled: flag.enabled, rollout_pct: flag.rollout_pct } });
    setBusy(null);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push(`אחוז התפוצה של ${flag.key} עודכן ל-${flag.rollout_pct}%`, "success");
    router.refresh();
  };

  const enabledCount = flags.filter((f) => f.enabled).length;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">🧩 מתגי מערכת</h2>
          <p className="mt-1 text-xs text-ink-400">
            {enabledCount} מתוך {flags.length} פיצ'רים פעילים{dirty ? ` · ${dirty} שינויים בסשן הזה` : ""}
          </p>
        </div>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש פיצ'ר…" aria-label="חיפוש פיצ'ר" className="w-64" />
      </div>

      <ul className="mt-4 divide-y divide-white/5">
        {filtered.map((flag) => (
          <li key={flag.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-52 flex-1">
              <div className="flex items-center gap-2">
                <span dir="ltr" className="font-mono text-[11px] text-ink-300">{flag.key}</span>
                <Badge tone={flag.enabled ? "success" : "neutral"}>{flag.enabled ? "פעיל" : "כבוי"}</Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-400">{flag.description}</p>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] text-ink-400">
                תפוצה
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={flag.rollout_pct}
                  onChange={(e) => setRollout(flag.key, Number(e.target.value))}
                  className="w-24 accent-lemon-400"
                  aria-label={`אחוז תפוצה ${flag.key}`}
                />
                <span className="w-9 text-end tabular-nums">{flag.rollout_pct}%</span>
              </label>
              {flag.rollout_pct < 100 ? (
                <Button size="sm" variant="ghost" loading={busy === flag.key} onClick={() => saveRollout(flag)}>שמור</Button>
              ) : null}
              <button
                type="button"
                role="switch"
                aria-checked={flag.enabled}
                aria-label={`הפעל/כבה ${flag.key}`}
                onClick={() => toggle(flag)}
                disabled={busy === flag.key}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${flag.enabled ? "bg-lemon-400" : "bg-white/15"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${flag.enabled ? "start-0.5" : "start-5.5"}`} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] text-ink-500">
        תפוצה חלקית משמשת לבדיקות A/B: משתמשים נבחרים באחוזים לפי מזהה יציב. 100% = כולם, 0% = אף אחד.
      </p>
    </Card>
  );
}
