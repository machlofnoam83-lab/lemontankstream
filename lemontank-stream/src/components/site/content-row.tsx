"use client";

import { useRef } from "react";
import Link from "next/link";
import { TitleCard } from "./title-card";
import type { TitleCard as TitleCardType } from "@/lib/catalog";

type Item = TitleCardType & { percent?: number; episode_id?: number | null };

/**
 * שורת תוכן קולנועית — כותרת עם פס לימוני, כפתורי גלילה שמופיעים בריחוף,
 * ודהייה בקצוות שמסמנת שיש עוד תוכן.
 */
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
    const amount = Math.max(300, el.clientWidth * 0.82) * direction;
    el.scrollBy({ left: direction === 1 ? -amount : amount, behavior: "smooth" }); // RTL: ימינה = שלילי
  };

  if (!items.length) return null;

  const id = `row-${title.replace(/[^\p{L}\p{N}]+/gu, "-")}`;

  return (
    <section className="group/row relative" aria-labelledby={id}>
      <div className="mb-1 flex items-end justify-between gap-3 px-1">
        <h2 id={id} className="section-heading">
          <span className="section-heading-bar" aria-hidden="true" />
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {href ? (
            <Link
              href={href}
              className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-ink-300 opacity-0 transition-all duration-300 hover:border-lemon-400/40 hover:text-lemon-300 group-hover/row:opacity-100 focus-visible:opacity-100"
            >
              הצג הכל ←
            </Link>
          ) : null}
          <div className="hidden gap-1 md:flex">
            <button
              onClick={() => scrollBy(-1)}
              className="rounded-full border border-white/10 bg-white/[0.05] p-2 text-ink-200 opacity-0 transition-all duration-300 hover:bg-white/[0.14] hover:text-white group-hover/row:opacity-100 focus-visible:opacity-100"
              aria-label={`גלול שמאלה ב${title}`}
            >
              <Chevron dir="left" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              className="rounded-full border border-white/10 bg-white/[0.05] p-2 text-ink-200 opacity-0 transition-all duration-300 hover:bg-white/[0.14] hover:text-white group-hover/row:opacity-100 focus-visible:opacity-100"
              aria-label={`גלול ימינה ב${title}`}
            >
              <Chevron dir="right" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        {/* דהייה בקצוות — רמז לגלילה */}
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-ink-950 to-transparent" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-ink-950 to-transparent" aria-hidden="true" />

        <div ref={scroller} className="row-scroll" tabIndex={0} aria-label={`${title} — רשימת כותרים`}>
          {items.map((item, idx) => (
            <div key={`${item.kind}-${item.id}-${idx}`} className="row-scroll-item">
              <TitleCard
                item={item}
                size={variant === "wide" ? "wide" : "md"}
                showProgress={showProgress}
                rank={ranked ? idx + 1 : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  const path = dir === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
