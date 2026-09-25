"use client";

import { useRef } from "react";
import Link from "next/link";
import { TitleCard } from "./title-card";
import type { TitleCard as TitleCardType } from "@/lib/catalog";

type Item = TitleCardType & { percent?: number; episode_id?: number | null };

/** שורת תוכן אופקית עם כפתורי גלילה (RTL-aware) וקישור "הצג הכל" */
export function ContentRow({
  title,
  items,
  href,
  variant = "poster",
  showProgress = false,
  ranked = false,
}: {
  title: string;
  items: Item[];
  href?: string;
  variant?: "poster" | "wide";
  showProgress?: boolean;
  ranked?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const amount = Math.max(280, el.clientWidth * 0.8) * direction;
    el.scrollBy({ left: direction === 1 ? -amount : amount, behavior: "smooth" }); // RTL: ימינה = שלילי
  };

  if (!items.length) return null;

  return (
    <section className="group/row relative" aria-labelledby={`row-${title.replace(/\s/g, "-")}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={`row-${title.replace(/\s/g, "-")}`} className="text-lg font-extrabold md:text-xl">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {href ? (
            <Link href={href} className="text-xs text-lemon-300 hover:text-lemon-200">
              הצג הכל ←
            </Link>
          ) : null}
          <div className="hidden gap-1 md:flex">
            <button
              onClick={() => scrollBy(-1)}
              className="rounded-full border border-white/10 bg-white/5 p-1.5 text-ink-200 hover:bg-white/15"
              aria-label={`גלול שמאלה ב${title}`}
            >
              <Chevron dir="left" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              className="rounded-full border border-white/10 bg-white/5 p-1.5 text-ink-200 hover:bg-white/15"
              aria-label={`גלול ימינה ב${title}`}
            >
              <Chevron dir="right" />
            </button>
          </div>
        </div>
      </div>

      <div ref={scroller} className="row-scroll" tabIndex={0} aria-label={`${title} — רשימת כותרים`}>
        {items.map((item, idx) => (
          <div key={`${item.kind}-${item.id}-${idx}`} className="row-scroll-item relative">
            <TitleCard item={item} size={variant === "wide" ? "wide" : "md"} showProgress={showProgress} rank={ranked ? idx + 1 : undefined} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  const path = dir === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
