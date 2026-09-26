"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TitleCard } from "./title-card";
import { apiCall } from "@/lib/client/api";
import { Button, EmptyState, Select, SkeletonRow } from "@/components/ui/primitives";
import type { TitleCard as TitleCardType } from "@/lib/catalog";

type Genre = { id: number; slug: string; name_he: string; icon: string | null };

const SORTS = [
  { value: "trending", label: "הטרנדים" },
  { value: "newest", label: "החדשים ביותר" },
  { value: "added", label: "נוספו לאחרונה" },
  { value: "popular", label: "הנצפים ביותר" },
  { value: "rating", label: "הדירוג הגבוה" },
  { value: "az", label: "לפי א'–ת'" },
  { value: "year", label: "לפי שנה" },
];

/**
 * דפדפן קטלוג עם סינון, מיון ועמודים — לקוח בלבד, עם טעינה מהשרת
 * (השרת מסנן לפי הרשאת המנוי, כך שמשתמש חינם לא רואה קישורים לתוכן פלוס).
 */
export function CatalogBrowser({
  kind,
  initialPlan,
  initialGenre,
  title,
  defaultSort = "trending",
  catalogEmpty = false,
}: {
  kind?: "movie" | "series";
  initialPlan?: "free" | "plus";
  initialGenre?: string;
  title: string;
  defaultSort?: string;
  /** הקטלוג ריק לגמרי (לא סינון שלא מצא כלום) — מציגים הסבר אחר */
  catalogEmpty?: boolean;
}) {
  const searchParams = useSearchParams();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [items, setItems] = useState<TitleCardType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string>(initialPlan ?? searchParams.get("plan") ?? "");
  const [genre, setGenre] = useState<string>(initialGenre ?? searchParams.get("genre") ?? "");
  const [sort, setSort] = useState<string>(defaultSort);
  const [year, setYear] = useState<string>("");
  const [q, setQ] = useState<string>(searchParams.get("q") ?? "");
  const [offset, setOffset] = useState(0);
  const limit = 24;

  const query = new URLSearchParams(
    Object.entries({ kind, plan, genre, sort, year, q }).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v) acc[k] = String(v);
      return acc;
    }, {}),
  );

  const load = useCallback(
    async (nextOffset = 0) => {
      setLoading(true);
      const res = await apiCall<{ items: TitleCardType[]; total: number }>(
        `/api/titles?${query.toString()}&limit=${limit}&offset=${nextOffset}`,
      );
      if (res.ok) {
        setItems(nextOffset === 0 ? res.data.items : (prev) => [...prev, ...res.data.items]);
        setTotal(res.data.total);
        setOffset(nextOffset);
      }
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.toString()],
  );

  useEffect(() => {
    apiCall<{ items: Genre[] }>("/api/genres").then((res) => {
      if (res.ok) setGenres(res.data.items);
    });
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 40 }, (_, i) => current + 1 - i);
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="section-heading !text-2xl md:!text-3xl">
            <span className="section-heading-bar" aria-hidden="true" />
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-400">
            {total > 0 ? `${total} כותרים בקטלוג` : "סינון לפי ז'אנר, שנה ומסלול"}
          </p>
        </div>

        {/* בורר מסלול בכפתורי גלולה — מהיר וברור */}
        <div className="flex items-center gap-1.5" role="group" aria-label="סינון לפי מסלול">
          {[
            { value: "", label: "הכול" },
            { value: "free", label: "חינם" },
            { value: "plus", label: "⭐ פלוס" },
          ].map((option) => {
            const active = plan === option.value;
            return (
              <button
                key={option.value || "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setPlan(option.value)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all duration-300 ${
                  active
                    ? option.value === "plus"
                      ? "border-plus-400/50 bg-plus-500/20 text-plus-300 shadow-[0_0_18px_-6px_rgba(139,92,246,0.9)]"
                      : "border-lemon-400/50 bg-lemon-400/15 text-lemon-200 shadow-[0_0_18px_-6px_rgba(247,194,43,0.9)]"
                    : "border-white/12 text-ink-300 hover:border-white/25 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* סרגל סינון */}
      <div className="card-surface flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <Select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="סינון לפי ז'אנר" className="w-auto min-w-40">
          <option value="">כל הז'אנרים</option>
          {genres.map((g) => (
            <option key={g.id} value={g.slug}>
              {g.icon ? `${g.icon} ` : ""}
              {g.name_he}
            </option>
          ))}
        </Select>

        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="מיון" className="w-auto">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="סינון לפי שנה" className="w-auto">
          <option value="">כל השנים</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>

        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש בתוך התוצאות…"
          aria-label="חיפוש בתוך התוצאות"
          className="min-w-44 flex-1 rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm"
        />

        {(plan || genre || year || q) && (
          <Button variant="subtle" size="sm" onClick={() => { setPlan(""); setGenre(""); setYear(""); setQ(""); }}>
            נקה סינון ✕
          </Button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-4">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : items.length === 0 ? (
        catalogEmpty ? (
          <EmptyState
            title="הקטלוג שלנו בהקמה 🍿"
            description="עוד לא הועלו כותרים. פתחו חשבון חינם ותהיו הראשונים לדעת כשהתוכן עולה."
            icon="🎬"
            action={<Link href="/register" className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">פתחו חשבון חינם</Link>}
          />
        ) : (
          <EmptyState
            title="לא נמצאו כותרים"
            description="נסה לשנות את הסינון או לחפש משהו אחר."
            icon="🔍"
            action={<Link href="/" className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">חזרה לעמוד הבית</Link>}
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((item) => (
              <div key={`${item.kind}-${item.id}`} className="flex justify-center">
                <TitleCard item={item} size="md" />
              </div>
            ))}
          </div>

          {items.length < total ? (
            <div className="flex justify-center">
              <Button variant="ghost" loading={loading} onClick={() => void load(offset + limit)}>
                טען עוד ({total - items.length} נותרו)
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
