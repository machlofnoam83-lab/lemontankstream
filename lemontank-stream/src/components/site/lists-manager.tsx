"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Field, Spinner, Switch } from "@/components/ui/primitives";
import { apiCall } from "@/lib/client/api";

export type UserListRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_public: number;
  share_code: string | null;
  item_count: number;
  preview: string | null;
  created_at: string;
};

export type ListItemRow = {
  item_id: number;
  note: string | null;
  id: number;
  slug: string;
  name_he: string;
  year: number | null;
  poster_url: string | null;
  kind: string;
  plan_access: string;
};

/**
 * ניהול הרשימות שלי: יצירה, עריכה, שיתוף, והוספה מהקטלוג.
 */
export function ListsManager({ initial }: { initial: UserListRow[] }) {
  const [lists, setLists] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [items, setItems] = useState<ListItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const refresh = async () => {
    const res = await apiCall<{ lists: UserListRow[] }>("/api/lists");
    if (res.ok) setLists(res.data.lists);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await apiCall<{ list: UserListRow }>("/api/lists", {
      method: "POST",
      body: { name, description: description || null, is_public: isPublic },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setName("");
    setDescription("");
    setIsPublic(false);
    setCreating(false);
    await refresh();
  };

  const togglePublic = async (list: UserListRow) => {
    const res = await apiCall(`/api/lists/${list.id}`, { method: "PATCH", body: { is_public: !list.is_public } });
    if (res.ok) await refresh();
  };

  const remove = async (list: UserListRow) => {
    if (!window.confirm(`למחוק את "${list.name}"? הפעולה אינה הפיכה.`)) return;
    const res = await apiCall(`/api/lists/${list.id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  };

  const open = async (list: UserListRow) => {
    if (openId === list.id) {
      setOpenId(null);
      return;
    }
    setOpenId(list.id);
    setLoadingItems(true);
    const res = await apiCall<{ items: ListItemRow[] }>(`/api/lists/${list.id}/items`);
    setLoadingItems(false);
    if (res.ok) setItems(res.data.items);
  };

  const removeItem = async (listId: number, titleId: number) => {
    const res = await apiCall(`/api/lists/${listId}/items`, { method: "POST", body: { action: "remove", title_id: titleId } });
    if (res.ok) {
      setItems((prev) => prev.filter((item) => item.id !== titleId));
      await refresh();
    }
  };

  const copyShare = async (list: UserListRow) => {
    const url = `${window.location.origin}/l/${list.share_code}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(list.id);
    window.setTimeout(() => setCopied(null), 2200);
  };

  return (
    <div className="space-y-4">
      {!creating ? (
        <Button onClick={() => setCreating(true)}>➕ רשימה חדשה</Button>
      ) : (
        <Card className="p-4">
          <form onSubmit={create} className="space-y-3">
            <Field label="שם הרשימה">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                placeholder="למשל: לסופש עם החברה"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
              />
            </Field>
            <Field label="תיאור (אופציונלי)">
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="מה משותף לכל הסרטים כאן?"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
              />
            </Field>
            <Switch
              checked={isPublic}
              onChange={setIsPublic}
              label="רשימה משותפת"
              description="מאפשר לשלוח קישור לחברים — בלי שיראו את החשבון שלך"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || name.trim().length < 2}>
                {busy ? <Spinner /> : "צור רשימה"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                ביטול
              </Button>
            </div>
            {error && <p className="text-[0.9rem] text-red-300">{error}</p>}
          </form>
        </Card>
      )}

      {lists.length === 0 && !creating && (
        <p className="text-ink-400">עוד אין רשימות. צור אחת כדי לארגן מה לצפות — ולשתף עם חברים.</p>
      )}

      {lists.map((list) => (
        <Card key={list.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">{list.name}</h2>
                {list.is_public ? (
                  <span className="rounded-full bg-plus-500/20 px-2.5 py-1 text-[0.8rem] text-plus-300">משותפת 🔗</span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.8rem] text-ink-300">פרטית</span>
                )}
                <span className="text-[0.85rem] text-ink-400">{list.item_count} כותרים</span>
              </div>
              {list.description && <p className="mt-1 text-[0.9rem] text-ink-300">{list.description}</p>}
              {list.preview && <p className="mt-1 text-[0.85rem] text-ink-500">{list.preview}{list.item_count > 3 ? " …" : ""}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => open(list)} className="rounded-xl bg-white/[0.07] px-3 py-2 text-[0.9rem] hover:bg-white/[0.12]">
                {openId === list.id ? "סגור" : "הצג כותרים"}
              </button>
              <button type="button" onClick={() => togglePublic(list)} className="rounded-xl bg-white/[0.07] px-3 py-2 text-[0.9rem] hover:bg-white/[0.12]">
                {list.is_public ? "הפוך לפרטית" : "שתף"}
              </button>
              {list.is_public && list.share_code && (
                <button type="button" onClick={() => copyShare(list)} className="rounded-xl bg-lemon-400 px-3 py-2 text-[0.9rem] font-bold text-ink-950">
                  {copied === list.id ? "✓ הועתק" : "העתק קישור"}
                </button>
              )}
              <Link href={`/movies`} className="rounded-xl bg-white/[0.07] px-3 py-2 text-[0.9rem] hover:bg-white/[0.12]">
                הוסף כותרים
              </Link>
              <button type="button" onClick={() => remove(list)} className="rounded-xl px-3 py-2 text-[0.9rem] text-red-300 hover:bg-red-500/10">
                מחק
              </button>
            </div>
          </div>

          {openId === list.id && (
            <div className="mt-4 border-t border-white/10 pt-4">
              {loadingItems ? (
                <div className="flex items-center gap-2 text-ink-300"><Spinner /> טוען…</div>
              ) : items.length === 0 ? (
                <p className="text-ink-400">
                  הרשימה ריקה. אפשר להוסיף כותרים מדפי הסרטים — או מכפתור &quot;הוסף לרשימה&quot; בדף הכותר.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {items.map((item) => (
                    <li key={item.item_id} className="flex items-center gap-3 rounded-xl bg-white/[0.05] p-2">
                      {item.poster_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.poster_url} alt="" className="h-14 w-10 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-14 w-10 items-center justify-center rounded-lg bg-white/10">🎬</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <Link href={`/title/${item.slug}`} className="block truncate font-bold hover:text-lemon-300">
                          {item.name_he}
                        </Link>
                        <div className="text-[0.8rem] text-ink-400">
                          {item.year} · {item.kind === "series" ? "סדרה" : "סרט"}
                        </div>
                        {item.note && <div className="truncate text-[0.8rem] text-lemon-300/90">📝 {item.note}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(list.id, item.id)}
                        className="rounded-lg px-2 py-1 text-[0.85rem] text-red-300 hover:bg-red-500/10"
                        aria-label={`הסר את ${item.name_he}`}
                      >
                        הסר
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
