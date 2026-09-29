"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Icon } from "@/components/ui/icons";

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
      <form onSubmit={submit} role="search" className="relative group/search">
        <Icon
          name="search"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-brass-300/70 transition-colors group-focus-within/search:text-brass-200"
        />
        <input
          type="search"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          placeholder={compact ? "חיפוש…" : "חפש סרט או סדרה…"}
          aria-label="חיפוש סרטים וסדרות"
          className={`field-ink !py-2 pr-9 pl-3 text-sm transition focus:field-ink-focus [&::placeholder]:text-parchment-300/45 ${
            compact ? "md:w-52" : ""
          }`}
        />
        {loading ? (
          <span className="absolute left-3 top-1/2 flex -translate-y-1/2 gap-0.5" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span key={index} className="size-1 rounded-full bg-brass-300 animate-lamp" style={{ animationDelay: `${index * 140}ms` }} />
            ))}
          </span>
        ) : null}
      </form>

      {open && items.length > 0 ? (
        <div className="absolute top-full z-50 mt-2 w-full min-w-[20rem] overflow-hidden border border-brass-400/25 bg-obsidian-900/98 shadow-[0_30px_70px_-30px_rgba(0,0,0,1)] backdrop-blur-xl animate-ink-in chamfer">
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.map((it) => (
              <li key={`${it.kind}-${it.id}`}>
                <Link
                  href={`/title/${it.slug}`}
                  onClick={() => setOpen(false)}
                  className="reveal-item flex items-center gap-3 px-3 py-2 transition hover:bg-brass-400/[0.07]"
                >
                  <span className="h-12 w-9 shrink-0 overflow-hidden border border-brass-400/20 bg-obsidian-800 text-[0.75rem]">
                    {it.poster_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.poster_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="poster-fallback h-full w-full text-[0.7rem]">{it.name_he}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-sm font-bold text-parchment-100">{it.name_he}</span>
                    <span className="block text-[0.85rem] text-parchment-300/65">
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
            className="flex w-full items-center justify-center gap-1.5 border-t border-brass-400/20 bg-obsidian-900/60 px-3 py-2 text-xs text-brass-200 transition hover:bg-brass-400/[0.08]"
          >
            <Icon name="search" className="size-3.5" />
            הצג את כל התוצאות עבור "{q}"
          </button>
        </div>
      ) : null}
    </div>
  );
}
