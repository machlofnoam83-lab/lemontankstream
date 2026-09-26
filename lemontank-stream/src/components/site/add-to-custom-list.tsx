"use client";

import { useEffect, useState } from "react";
import { apiCall } from "@/lib/client/api";

type ListRow = { id: number; name: string; item_count: number; is_public: number };

/**
 * "הוסף לרשימה" — תפריט קטן שנפתח ליד הכפתור, עם יצירה מהירה של רשימה חדשה.
 * שונה מ"הרשימה שלי" (watchlist): כאן בוחרים **לאיזו** רשימה ואוסף אישי עם שם.
 */
export function AddToCustomList({ titleId, compact = false }: { titleId: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    void (async () => {
      const res = await apiCall<{ lists: ListRow[] }>("/api/lists");
      if (res.ok) setLists(res.data.lists);
      setLoaded(true);
    })();
  }, [open, loaded]);

  const flash = (text: string) => {
    setStatus(text);
    window.setTimeout(() => setStatus(""), 2600);
  };

  const add = async (listId: number, name: string) => {
    setBusy(true);
    const res = await apiCall<{ added: boolean }>(`/api/lists/${listId}/items`, {
      method: "POST",
      body: { action: "add", title_id: titleId },
    });
    setBusy(false);
    if (!res.ok) {
      flash(res.error.message);
      return;
    }
    flash(res.data.added ? `נוסף ל"${name}" ✓` : `כבר קיים ב"${name}"`);
    setLists((prev) => prev.map((row) => (row.id === listId ? { ...row, item_count: row.item_count + (res.data.added ? 1 : 0) } : row)));
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newName.trim().length < 2) return;
    setBusy(true);
    const res = await apiCall<{ list: ListRow }>("/api/lists", { method: "POST", body: { name: newName } });
    setBusy(false);
    if (!res.ok) {
      flash(res.error.message);
      return;
    }
    setNewName("");
    setLists((prev) => [{ ...res.data.list, item_count: 0 }, ...prev]);
    await add(res.data.list.id, res.data.list.name);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          compact
            ? "rounded-lg bg-white/[0.07] px-3 py-1.5 text-[0.85rem] hover:bg-white/[0.14]"
            : "rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/15"
        }
        aria-expanded={open}
      >
        📚 הוסף לרשימה
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-64 rounded-2xl border border-white/12 bg-ink-900/97 p-3 shadow-2xl backdrop-blur-xl">
          <div className="text-[0.85rem] font-bold text-ink-200">הרשימות שלי</div>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {lists.length === 0 && <li className="text-[0.85rem] text-ink-400">אין רשימות עדיין — פתחו אחת למטה.</li>}
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => add(list.id, list.name)}
                  className="w-full rounded-lg px-2 py-1.5 text-right text-[0.9rem] hover:bg-white/[0.08] disabled:opacity-60"
                >
                  {list.is_public ? "🔗 " : "🔒 "}
                  {list.name}
                  <span className="mr-1 text-[0.78rem] text-ink-500">({list.item_count})</span>
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={create} className="mt-2 flex gap-1.5 border-t border-white/10 pt-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="רשימה חדשה…"
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[0.85rem]"
            />
            <button type="submit" disabled={busy || newName.trim().length < 2} className="rounded-lg bg-lemon-400 px-2.5 py-1.5 text-[0.85rem] font-bold text-ink-950 disabled:opacity-50">
              צור
            </button>
          </form>

          {status && <p className="mt-2 text-[0.82rem] text-lemon-300">{status}</p>}
        </div>
      )}
    </div>
  );
}
