"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Field, Spinner } from "@/components/ui/primitives";
import { apiCall } from "@/lib/client/api";

export type RequestRow = {
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
  voted: number;
  mine?: boolean;
};

const KIND_LABEL: Record<string, string> = { movie: "סרט", series: "סדרה", any: "לא משנה" };

export function RequestsBoard({ initial, loggedIn }: { initial: RequestRow[]; loggedIn: boolean }) {
  const [rows, setRows] = useState(initial);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("any");
  const [year, setYear] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const refresh = async () => {
    const res = await apiCall<{ requests: RequestRow[] }>("/api/requests?status=open");
    if (res.ok) setRows(res.data.requests);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await apiCall<{ request: RequestRow }>("/api/requests", {
      method: "POST",
      body: { name, kind, year: year ? Number(year) : null, note: note || null },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setName("");
    setYear("");
    setNote("");
    setFlash("הבקשה נשלחה! אחרים יכולים לחזק אותה 👍");
    window.setTimeout(() => setFlash(""), 4000);
    await refresh();
  };

  const vote = async (row: RequestRow) => {
    const res = await apiCall<{ voted: boolean; votes: number }>(`/api/requests/${row.id}`, { method: "POST" });
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setRows((prev) =>
      prev.map((item) => (item.id === row.id ? { ...item, voted: res.data.voted ? 1 : 0, votes: res.data.votes } : item)),
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">
        {rows.length === 0 && (
          <Card className="p-6 text-center text-ink-300">
            אין בקשות פתוחות. תהיה הראשון לבקש — ואם כותר חסר, הוא יופיע כאן.
          </Card>
        )}
        {rows.map((row) => (
          <Card key={row.id} className="flex items-start gap-4 p-4">
            <button
              type="button"
              onClick={() => (loggedIn ? vote(row) : (window.location.href = "/login?next=/requests"))}
              className={`flex w-16 shrink-0 flex-col items-center rounded-xl border px-2 py-2 transition ${
                row.voted
                  ? "border-lemon-400 bg-lemon-400/20 text-lemon-200"
                  : "border-white/15 bg-white/[0.05] text-ink-200 hover:bg-white/[0.1]"
              }`}
              aria-label={`חזק את הבקשה ${row.name}`}
            >
              <span className="text-xl">▲</span>
              <span className="text-[0.95rem] font-bold">{row.votes}</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold">{row.name}</h3>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.78rem] text-ink-300">
                  {KIND_LABEL[row.kind] ?? row.kind}
                  {row.year ? ` · ${row.year}` : ""}
                </span>
                {row.status !== "open" && (
                  <span className="rounded-full bg-plus-500/20 px-2 py-0.5 text-[0.78rem] text-plus-300">
                    {row.status === "planned" ? "בתכנון" : row.status === "added" ? "נוסף ✓" : "נדחה"}
                  </span>
                )}
              </div>
              {row.note && <p className="mt-1 text-[0.92rem] text-ink-300">{row.note}</p>}
              {row.admin_note && <p className="mt-1 text-[0.88rem] text-lemon-300/90">↳ {row.admin_note}</p>}
              <div className="mt-1 text-[0.8rem] text-ink-500">
                ביקש/ה {row.requester ?? "משתמש"} · {row.created_at.slice(0, 10)}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="h-fit p-4">
        <h2 className="text-lg font-bold">בקשו כותר</h2>
        <p className="mt-1 text-[0.88rem] text-ink-400">
          לא מצאתם סרט או סדרה? בקשו — אנחנו מוסיפים לפי הביקוש.
        </p>
        {loggedIn ? (
          <form onSubmit={submit} className="mt-3 space-y-3">
            <Field label="שם הכותר">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                placeholder="למשל: הכל בכל מקום בבת אחת"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
              />
            </Field>
            <div className="flex gap-2">
              <label className="flex-1 text-[0.85rem] text-ink-300">
                סוג
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-ink-100"
                >
                  <option value="any">לא משנה</option>
                  <option value="movie">סרט</option>
                  <option value="series">סדרה</option>
                </select>
              </label>
              <label className="w-24 text-[0.85rem] text-ink-300">
                שנה
                <input
                  value={year}
                  onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="2024"
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
                />
              </label>
            </div>
            <Field label="למה כדאי? (אופציונלי)">
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="שמעתי שזה מטורף"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
              />
            </Field>
            <Button type="submit" disabled={busy || name.trim().length < 2} className="w-full">
              {busy ? <Spinner /> : "שלח בקשה"}
            </Button>
            {error && <p className="text-[0.88rem] text-red-300">{error}</p>}
            {flash && <p className="text-[0.88rem] text-emerald-300">{flash}</p>}
          </form>
        ) : (
          <Link href="/login?next=/requests" className="mt-3 block rounded-xl bg-lemon-400 px-4 py-2 text-center font-bold text-ink-950">
            התחברו כדי לבקש
          </Link>
        )}

        <div className="mt-4 border-t border-white/10 pt-3 text-[0.82rem] text-ink-400">
          <p className="font-bold text-ink-300">איך זה עובד?</p>
          <ol className="mt-1 list-decimal space-y-1 pr-4">
            <li>אתם מבקשים כותר.</li>
            <li>משתמשים אחרים מחזקים בקשות שמעניינות גם אותם.</li>
            <li>הכותר הכי מבוקש עולה לראש התור — ואתם מקבלים התראה כשהוא נוסף.</li>
          </ol>
        </div>
      </Card>
    </div>
  );
}
