"use client";

import { useState } from "react";
import { Card, Spinner } from "@/components/ui/primitives";
import { apiCall } from "@/lib/client/api";

export type AdminRequestRow = {
  id: number;
  name: string;
  kind: string;
  year: number | null;
  note: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  votes: number;
  requester: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  open: "פתוחה",
  planned: "בתכנון",
  added: "נוסף",
  declined: "נדחה",
};

/**
 * קונסולת בקשות תוכן לאדמין.
 * "נוסף" שולח התראה לכל מי שהצביע — שווה להשתמש בזה כשיוצרים את הכותר.
 */
export function RequestsConsole({ initial, stats }: { initial: AdminRequestRow[]; stats: Record<string, number> }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [filter, setFilter] = useState("open");
  const [message, setMessage] = useState("");
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const reload = async (status: string) => {
    setFilter(status);
    const res = await apiCall<{ requests: AdminRequestRow[] }>(`/api/admin/requests?status=${status}`);
    if (res.ok) setRows(res.data.requests);
  };

  const update = async (row: AdminRequestRow, status: string) => {
    setBusy(row.id);
    const res = await apiCall(`/api/admin/requests`, {
      method: "PATCH",
      body: { id: row.id, status, admin_note: noteFor === row.id ? note : undefined },
    });
    setBusy(null);
    if (!res.ok) {
      setMessage(res.error.message);
      return;
    }
    setMessage(
      status === "added"
        ? `"${row.name}" סומן כנוסף — נשלחה התראה לכל המצביעים ✅`
        : `"${row.name}" עודכן ל${STATUS_LABEL[status]}`,
    );
    window.setTimeout(() => setMessage(""), 5000);
    setNoteFor(null);
    setNote("");
    await reload(filter);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          ["open", `פתוחות (${stats.open})`],
          ["planned", `בתכנון (${stats.planned})`],
          ["added", `נוספו (${stats.added})`],
          ["declined", `נדחו (${stats.declined})`],
          ["all", "הכל"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => reload(value)}
            className={`rounded-full px-4 py-1.5 text-[0.9rem] ${
              filter === value ? "bg-lemon-400 font-bold text-ink-950" : "bg-white/[0.07] hover:bg-white/[0.12]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <div className="rounded-xl border border-lemon-400/40 bg-lemon-400/10 p-3 text-[0.92rem]">{message}</div>}

      {rows.length === 0 ? (
        <Card className="p-6 text-center text-ink-300">אין בקשות בסינון הזה.</Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-white/[0.05] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-lemon-400/20 px-2 py-0.5 font-black text-lemon-200">{row.votes} קולות</span>
                    <h3 className="text-lg font-bold">{row.name}</h3>
                    <span className="text-[0.82rem] text-ink-400">
                      {row.kind === "movie" ? "סרט" : row.kind === "series" ? "סדרה" : "לא משנה"}
                      {row.year ? ` · ${row.year}` : ""} · {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </div>
                  {row.note && <p className="mt-1 text-[0.9rem] text-ink-300">{row.note}</p>}
                  <div className="mt-1 text-[0.8rem] text-ink-500">
                    {row.requester ?? "משתמש"} · {row.created_at.slice(0, 10)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {busy === row.id && <Spinner />}
                  <button type="button" onClick={() => { setNoteFor(row.id); setNote(row.admin_note ?? ""); }} className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-[0.85rem] hover:bg-white/[0.14]">
                    הערת אדמין
                  </button>
                  <button type="button" onClick={() => update(row, "planned")} className="rounded-lg bg-sky-500/20 px-3 py-1.5 text-[0.85rem] text-sky-100 hover:bg-sky-500/30">
                    בתכנון
                  </button>
                  <button type="button" onClick={() => update(row, "added")} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[0.85rem] text-emerald-100 hover:bg-emerald-500/30">
                    נוסף ✓
                  </button>
                  <button type="button" onClick={() => update(row, "declined")} className="rounded-lg px-3 py-1.5 text-[0.85rem] text-red-300 hover:bg-red-500/10">
                    דחה
                  </button>
                </div>
              </div>
              {noteFor === row.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="למה נדחה / מתי צפוי לעלות"
                    className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2"
                  />
                  <button type="button" onClick={() => update(row, row.status === "open" ? "planned" : row.status)} className="rounded-xl bg-lemon-400 px-4 py-2 font-bold text-ink-950">
                    שמור
                  </button>
                </div>
              )}
              {row.admin_note && noteFor !== row.id && (
                <p className="mt-2 text-[0.85rem] text-lemon-300/90">הערה: {row.admin_note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
