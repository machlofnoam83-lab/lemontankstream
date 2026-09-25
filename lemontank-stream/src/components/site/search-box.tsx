"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";

type Suggestion = { id: number; slug: string; name_he: string; kind: "movie" | "series"; year: number | null; poster_url: string | null; plan_access: string };

/** חיפוש חי עם השלמה אוטומטית בעברית (debounce + ביטול בקשות) */
export function SearchBox({ compact = false, autoFocus = false }: { compact?: boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await apiCall<{ items: Suggestion[] }>(`/api/search?q=${encodeURIComponent(q.trim())}&limit=8`, { signal: controller.signal });
      setLoading(false);
      if (res.ok) {
        setItems(res.data.items);
        setOpen(true);
      }
    }, 260);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 1) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={submit} role="search" className="relative">
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          placeholder={compact ? "חיפוש…" : "חפש סרט או סדרה…"}
          aria-label="חיפוש סרטים וסדרות"
          className={`w-full rounded-full border border-white/15 bg-ink-900/90 py-2 pr-9 pl-3 text-sm placeholder:text-ink-400 focus:border-lemon-400/70 ${compact ? "md:w-52" : ""}`}
        />
        {loading ? <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">…</span> : null}
      </form>

      {open && items.length > 0 ? (
        <div className="absolute top-full z-50 mt-2 w-full min-w-[20rem] overflow-hidden rounded-xl border border-white/10 bg-ink-850/98 shadow-2xl backdrop-blur">
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.map((it) => (
              <li key={`${it.kind}-${it.id}`}>
                <Link
                  href={`/title/${it.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-white/5"
                >
                  <span className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-800 text-[9px]">
                    {it.poster_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.poster_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="poster-fallback h-full w-full text-[8px]">{it.name_he}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.name_he}</span>
                    <span className="block text-[11px] text-ink-400">
                      {it.kind === "movie" ? "סרט" : "סדרה"} {it.year ? `· ${it.year}` : ""}
                    </span>
                  </span>
                  {it.plan_access === "plus" ? <span className="badge-plus">פלוס</span> : <span className="badge-free">חינם</span>}
                </Link>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              setOpen(false);
              router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
            className="w-full border-t border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-lemon-300 hover:bg-white/10"
          >
            הצג את כל התוצאות עבור "{q}" ←
          </button>
        </div>
      ) : null}
    </div>
  );
}
