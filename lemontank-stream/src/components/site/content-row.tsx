"use client";

import { useRef } from "react";
import Link from "next/link";
import { TitleCard } from "./title-card";
import { Icon, type IconName } from "@/components/ui/icons";
import type { TitleCard as TitleCardType } from "@/lib/catalog";

type Item = TitleCardType & { percent?: number; episode_id?: number | null };

/**
 * שורת תוכן — מדף בארכיון.
 *
 * הכותרת ב-serif עם קו פליז קצר לפניה, חצים מגולפים שמופיעים בריחוף,
 * ודהייה בקצוות שמרמזת שיש עוד. הרשימה נגללת בגלילה חלקה ובמקלדת (tabIndex).
 */
export function ContentRow({
  title,
  items,
  href,
  variant = "poster",
  showProgress = false,
  ranked = false,
  icon,
}: {
  title: string;
  items: Item[];
  href?: string;
  variant?: "poster" | "wide";
  showProgress?: boolean;
  ranked?: boolean;
  icon?: IconName;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    // RTL: גלילה "קדימה" היא שמאלה, ולכן הסימן מתהפך
    const amount = Math.max(300, el.clientWidth * 0.82) * direction;
    el.scrollBy({ left: direction === 1 ? -amount : amount, behavior: "smooth" });
  };

  if (!items.length) return null;

  const id = `row-${title.replace(/[^\p{L}\p{N}]+/gu, "-")}`;

  return (
    <section className="group/row animate-ink-in relative" aria-labelledby={id}>
      <div className="mb-2 flex items-end justify-between gap-3 px-1">
        <h2 id={id} className="section-heading text-parchment-100">
          <span className="section-heading-bar" aria-hidden="true" />
          {icon ? <Icon name={icon} className="size-5 text-brass-400/90" /> : null}
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {href ? (
            <Link
              href={href}
              className="inline-flex items-center gap-1 border border-brass-400/20 px-3 py-1 text-sm font-bold text-parchment-300 opacity-70 transition-all duration-300 hover:border-brass-300/60 hover:text-brass-200 group-hover/row:opacity-100 focus-visible:opacity-100"
            >
              הצג הכל
              <Icon name="chevron-left" className="size-4" />
            </Link>
          ) : null}
          <div className="hidden gap-1 md:flex">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              className="border border-brass-400/20 bg-obsidian-900/60 p-2 text-parchment-300 opacity-0 transition-all duration-300 hover:border-brass-300/60 hover:text-brass-200 group-hover/row:opacity-100 focus-visible:opacity-100"
              aria-label={`גלול שמאלה ב${title}`}
            >
              <Icon name="chevron-right" className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              className="border border-brass-400/20 bg-obsidian-900/60 p-2 text-parchment-300 opacity-0 transition-all duration-300 hover:border-brass-300/60 hover:text-brass-200 group-hover/row:opacity-100 focus-visible:opacity-100"
              aria-label={`גלול ימינה ב${title}`}
            >
              <Icon name="chevron-left" className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-obsidian-950 to-transparent" aria-hidden="true" />
        <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-obsidian-950 to-transparent" aria-hidden="true" />

        <div ref={scroller} className="row-scroll" tabIndex={0} aria-label={`${title} — רשימת כותרים`}>
          {items.map((item, idx) => (
            <div
              key={`${item.kind}-${item.id}-${idx}`}
              className="row-scroll-item reveal-item"
              style={{ animationDelay: `${Math.min(idx * 55, 500)}ms` }}
            >
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
