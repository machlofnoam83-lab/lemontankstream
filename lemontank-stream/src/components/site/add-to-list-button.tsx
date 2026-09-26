"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";

/** כפתור "הוסף לרשימה שלי" — Optimistic UI עם שחזור במקרה כשל */
export function AddToListButton({
  titleId,
  initial = false,
  compact = false,
  onChange,
}: {
  titleId: number;
  initial?: boolean;
  compact?: boolean;
  onChange?: (inList: boolean) => void;
}) {
  const [inList, setInList] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = !inList;
    setInList(next); // אופטימי — התחושה חלקה גם ברשת איטית
    const res = await apiCall<{ inList: boolean }>("/api/watchlist", {
      method: "POST",
      body: { title_id: titleId, action: next ? "add" : "remove" },
    });
    setBusy(false);
    if (!res.ok) {
      setInList(!next);
      toast.push(res.error.code === "UNAUTHORIZED" ? "צריך להתחבר כדי לשמור לרשימה" : res.error.message, "error");
      if (res.error.code === "UNAUTHORIZED") router.push("/login");
      return;
    }
    toast.push(next ? "נוסף לרשימה ✓" : "הוסר מהרשימה", "success");
    onChange?.(next);
    router.refresh();
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={inList}
      title={inList ? "הסר מהרשימה שלי" : "הוסף לרשימה שלי"}
      className={`inline-flex items-center gap-2 rounded-xl border transition ${
        inList ? "border-lemon-400/60 bg-lemon-400/15 text-lemon-200" : "border-white/20 bg-white/10 text-white hover:bg-white/20"
      } ${compact ? "px-3 py-3 text-sm" : "px-4 py-2.5 text-sm font-semibold"} disabled:opacity-50`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {inList ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 5v14M5 12h14" />}
      </svg>
      {compact ? null : inList ? "ברשימה שלי" : "הוסף לרשימה"}
    </button>
  );
}
