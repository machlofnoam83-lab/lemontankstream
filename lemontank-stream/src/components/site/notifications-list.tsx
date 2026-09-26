"use client";

import { useState } from "react";
import Link from "next/link";
import { apiCall } from "@/lib/client/api";
import { Button } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/format";

type Item = { id: number; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

const ICONS: Record<string, string> = {
  welcome: "🎉",
  plan: "⭐",
  billing: "💳",
  content: "🎬",
  episode: "📺",
  security: "🔐",
  info: "ℹ️",
  promo: "🏷️",
};

export function NotificationsList({ items: initial }: { items: Item[] }) {
  const [items, setItems] = useState(initial);
  const unread = items.filter((i) => !i.read_at).length;

  const markAll = async () => {
    await apiCall("/api/notifications", { method: "POST", body: { all: true } });
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
  };

  const markOne = async (id: number) => {
    await apiCall("/api/notifications", { method: "POST", body: { id } });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read_at: new Date().toISOString() } : i)));
  };

  return (
    <div className="space-y-4">
      {unread > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-lemon-400/25 bg-lemon-400/10 px-4 py-3">
          <span className="text-sm text-lemon-200">יש לך {unread} התראות שלא נקראו</span>
          <Button size="sm" variant="ghost" onClick={markAll}>סמן הכל כנקרא</Button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((n) => (
          <li
            key={n.id}
            className={`rounded-2xl border p-4 transition ${n.read_at ? "border-white/8 bg-white/[0.02]" : "border-lemon-400/25 bg-lemon-400/[0.06]"}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden="true">{ICONS[n.kind] ?? "🔔"}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">{n.title}</h2>
                {n.body ? <p className="mt-1 text-xs text-ink-300">{n.body}</p> : null}
                <div className="mt-2 flex items-center gap-3 text-[0.85rem] text-ink-400">
                  <span>{formatRelative(n.created_at)}</span>
                  {n.link ? (
                    <Link href={n.link} onClick={() => markOne(n.id)} className="text-lemon-300 hover:underline">
                      פתח ←
                    </Link>
                  ) : null}
                  {!n.read_at ? (
                    <button onClick={() => markOne(n.id)} className="text-ink-400 hover:text-white">
                      סמן כנקרא
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
