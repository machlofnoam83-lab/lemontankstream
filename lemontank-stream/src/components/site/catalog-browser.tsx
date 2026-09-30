"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TitleCard } from "./title-card";
import { apiCall } from "@/lib/client/api";
import { Icon } from "@/components/ui/icons";
import { OrnamentRule } from "@/components/ui/ornaments";
import type { TitleCard as TitleCardType } from "@/lib/catalog";

type Genre = { id: number; slug: string; name_he: string; icon: string | null };

const SORTS = [
  { value: "trending", label: "הטרנדים" },
  { value: "newest", label: "החדשים ביותר" },
  { value: "added", label: "נוספו לאחרונה" },
  { value: "popular", label: "הנצפים ביותר" },
  { value: "rating", label: "הדירוג הגבוה" },
  { value: "az", label: "לפי א׳–ת׳" },
  { value: "year", label: "לפי שנה" },
];

/**
 * דפדפן קטלוג — "שולחן החיפוש".
 *
 * סינון, מיון ועימוד מול השרת (שמסנן לפי הרשאת המנוי, כך שמשתמש חינם לא
 * מקבל קישורים לתוכן פלוס). המסננים נראים כמו ידיות עץ ופליז, לא כמו טופס
 * מודרני: ללא פינות עגולות, עם קו תחתון שמצטייר והדגשה בזהב.
 */
export function CatalogBrowser({
  kind,
  initialPlan,
  initialGenre,
  title,
  defaultSort = "trending",
  catalogEmpty = false,
  hideHeading = false,
}: {
  kind?: "movie" | "series";
  initialPlan?: "free" | "plus";
  initialGenre?: string;
  title: string;
  defaultSort?: string;
  /** הקטלוג ריק לגמרי (לא סינון שלא מצא כלום) — מציגים הסבר אחר */
  catalogEmpty?: boolean;
  /** כשהעמוד כבר הציג כותרת משלו (למשל עמוד ז'אנר עם באנר) */
  hideHeading?: boolean;
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

  const hasFilter = Boolean(plan || genre || year || q);

  return (
    <div className="space-y-6">
      {hideHeading ? null : (
        <header className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="section-heading text-parchment-100 md:!text-3xl">
              <span className="section-heading-bar" aria-hidden="true" />
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-parchment-300/70">
              {total > 0 ? `${total} כותרים בקטלוג` : "סינון לפי ז'אנר, שנה ומסלול"}
            </p>
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="סינון לפי מסלול">
            {[
              { value: "", label: "הכול", icon: null },
              { value: "free", label: "חינם", icon: "check" as const },
              { value: "plus", label: "פלוס", icon: "crown" as const },
            ].map((option) => {
              const active = plan === option.value;
              return (
                <button
                  key={option.value || "all"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPlan(option.value)}
                  className={`inline-flex items-center gap-1.5 border px-3.5 py-1.5 font-display text-sm transition-all duration-300 ${
                    active
                      ? option.value === "plus"
                        ? "border-oxblood-500/70 bg-oxblood-500/20 text-parchment-50"
                        : option.value === "free"
                          ? "border-verdigris-400/60 bg-verdigris-400/15 text-verdigris-300"
                          : "border-brass-300/60 bg-brass-400/12 text-brass-200"
                      : "border-brass-400/18 text-parchment-300/75 hover:border-brass-400/45 hover:text-parchment-100"
                  }`}
                >
                  {option.icon ? <Icon name={option.icon} className="size-3.5" /> : null}
                  {option.label}
                </button>
              );
            })}
          </div>
        </header>
      )}

      {/* סרגל סינון */}
      <div className="card-surface chamfer flex flex-wrap items-center gap-2.5 p-3.5">
        <label className="flex items-center gap-2">
          <Icon name="tag" className="size-4 text-brass-300/80" />
          <span className="sr-only">סינון לפי ז'אנר</span>
          <select
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
            aria-label="סינון לפי ז'אנר"
            className="field-ink w-auto min-w-40 !py-2 text-sm"
          >
            <option value="">כל הז'אנרים</option>
            {genres.map((option) => (
              <option key={option.id} value={option.slug}>
                {option.name_he}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <Icon name="list" className="size-4 text-brass-300/80" />
          <span className="sr-only">מיון</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="מיון"
            className="field-ink w-auto !py-2 text-sm"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <Icon name="calendar" className="size-4 text-brass-300/80" />
          <span className="sr-only">סינון לפי שנה</span>
          <select
            value={year}
            onChange={(event) => setYear(event.target.value)}
            aria-label="סינון לפי שנה"
            className="field-ink w-auto !py-2 text-sm"
          >
            <option value="">כל השנים</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <span className="relative flex min-w-44 flex-1 items-center">
          <Icon name="search" className="pointer-events-none absolute right-3 size-4 text-brass-300/70" />
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="חיפוש בתוך התוצאות…"
            aria-label="חיפוש בתוך התוצאות"
            className="field-ink !py-2 pr-10 text-sm transition focus:field-ink-focus"
          />
        </span>

        {hasFilter ? (
          <button
            type="button"
            onClick={() => {
              setPlan("");
              setGenre("");
              setYear("");
              setQ("");
            }}
            className="inline-flex items-center gap-1.5 border border-brass-400/25 px-3 py-2 text-sm text-parchment-300/85 chamfer transition hover:border-ember-400/50 hover:text-ember-200 animate-ink-in"
          >
            <Icon name="close" className="size-4" />
            נקה סינון
          </button>
        ) : null}
      </div>

      {loading && items.length === 0 ? (
        <ShelfSkeleton />
      ) : items.length === 0 ? (
        catalogEmpty ? (
          <EmptyNote
            icon="lantern"
            title="הארכיון עוד מתמלא"
            description="עוד לא הועלו כותרים. פתחו חשבון חינם ותהיו הראשונים לדעת כשהתוכן עולה."
            cta={{ href: "/register", label: "פתחו חשבון חינם" }}
          />
        ) : (
          <EmptyNote
            icon="search"
            title="לא נמצאו כותרים"
            description="נסו לשנות את הסינון או לחפש משהו אחר."
            cta={{ href: "/", label: "חזרה לעמוד הבית" }}
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((item, index) => (
              <div
                key={`${item.kind}-${item.id}`}
                className="reveal-item flex justify-center"
                style={{ animationDelay: `${Math.min(index * 40, 520)}ms` }}
              >
                <TitleCard item={item} size="md" />
              </div>
            ))}
          </div>

          {items.length < total ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void load(offset + limit)}
                disabled={loading}
                className="inline-flex items-center gap-2 border border-brass-400/30 px-6 py-3 font-display text-sm text-parchment-100 chamfer transition hover:border-brass-300/70 hover:bg-brass-400/[0.07] disabled:opacity-50"
              >
                <Icon name="download" className="size-4" />
                טען עוד ({total - items.length} נותרו)
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** שלד טעינה — מדפים ריקים שמנצנצים בעדינות */
function ShelfSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="flex gap-3.5 overflow-hidden">
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={index}
              className="skeleton h-64 w-44 shrink-0 chamfer"
              style={{ animationDelay: `${index * 90}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyNote({
  icon,
  title,
  description,
  cta,
}: {
  icon: "lantern" | "search";
  title: string;
  description: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="card-surface chamfer relative mx-auto max-w-xl p-8 text-center animate-ink-in">
      <span aria-hidden="true" className="pointer-events-none absolute inset-[6px] border border-brass-400/10" />
      <span className="mx-auto flex size-14 items-center justify-center border border-brass-400/30 bg-brass-400/[0.06] text-brass-300 chamfer" aria-hidden="true">
        <Icon name={icon} className="size-6" />
      </span>
      <h2 className="mt-4 font-display text-xl font-bold text-parchment-50">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-parchment-200/75">{description}</p>
      <OrnamentRule className="my-5" />
      <Link href={cta.href} className="btn-primary sheen text-sm">
        <Icon name="arrow-left" className="size-4" />
        {cta.label}
      </Link>
    </div>
  );
}
