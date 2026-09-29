/**
 * עיטורים — הרכיבים שהופכים עמוד מ"אתר" ל"חפץ".
 *
 * כל אחד מהם קטן בכוונה: פס הפרדה, חותם, כותרת עם קו נמשך, פינת מסגרת.
 * הם מופיעים במרווחים קבועים ויוצרים קצב חזותי אחיד בכל האתר.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/** קו הפרדה עם יהלום במרכזו — כמו בדפוס ישן */
export function OrnamentRule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-brass-600/60 to-brass-500/70" />
      <span className="flex items-center gap-1.5 text-brass-400/80">
        <span className="size-1 rotate-45 bg-brass-400/70" />
        <span className="size-1.5 rotate-45 border border-brass-300/80" />
        <span className="size-1 rotate-45 bg-brass-400/70" />
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-brass-600/60 to-brass-500/70" />
    </div>
  );
}

/** כותרת סקשן: קו פליז קצר, כותרת ב-serif, וקישור "הצג הכל" בצד */
export function SectionHeading({
  title,
  icon,
  href,
  hrefLabel = "הצג הכל",
  count,
}: {
  title: string;
  icon?: IconName;
  href?: string;
  hrefLabel?: string;
  count?: number;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="section-heading text-parchment-100">
        <span className="section-heading-bar" aria-hidden="true" />
        {icon ? <Icon name={icon} className="size-5 text-brass-400/90" /> : null}
        <span>{title}</span>
        {typeof count === "number" && count > 0 ? (
          <span className="font-sans text-sm font-normal text-ink-400 tabular-nums">({count})</span>
        ) : null}
      </h2>
      {href ? (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1 text-sm font-bold text-brass-300 transition hover:text-brass-200"
        >
          {hrefLabel}
          <Icon name="chevron-left" className="size-4 transition-transform group-hover:-translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}

/** חותם שעווה קטן — לסמן תוכן "נדיר"/פלוס */
export function WaxSeal({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`wax-seal ${className}`} title={label}>
      <Icon name="crown" className="size-4" />
    </span>
  );
}

/** כרטיס עם פינות חרוטות ומסגרת כפולה */
export function OrnateCard({
  children,
  className = "",
  as = "div",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  glow?: boolean;
}) {
  const Tag = as;
  return (
    <Tag
      className={`card-surface chamfer relative p-5 ${glow ? "ring-glow" : ""} ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[5px] border border-brass-400/10 chamfer"
      />
      {children}
    </Tag>
  );
}

/** פינות מסגרת — ארבעה סימני פינה דקים */
export function CornerMarks({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      <span className="absolute right-0 top-0 size-3 border-r border-t border-brass-400/50" />
      <span className="absolute left-0 top-0 size-3 border-l border-t border-brass-400/50" />
      <span className="absolute bottom-0 right-0 size-3 border-b border-r border-brass-400/50" />
      <span className="absolute bottom-0 left-0 size-3 border-b border-l border-brass-400/50" />
    </span>
  );
}

/** אבק מרחף — נצנוצים עדינים ברקע של במה */
export function DustMotes({ count = 12, className = "" }: { count?: number; className?: string }) {
  const seeds = Array.from({ length: count }, (_, index) => index);
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {seeds.map((seed) => {
        const left = (seed * 37) % 100;
        const delay = (seed * 0.7) % 9;
        const duration = 7 + ((seed * 1.3) % 6);
        const size = seed % 3 === 0 ? 2 : 1;
        return (
          <span
            key={seed}
            className="absolute rounded-full bg-brass-200/70 animate-dust"
            style={{
              left: `${left}%`,
              bottom: `${(seed * 11) % 40}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
    </span>
  );
}

/** תווית קטנה בסגנון חריטה */
export function EngravedLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-brass-500/25 bg-obsidian-900/60 px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-brass-300/90 ${className}`}
    >
      {children}
    </span>
  );
}

/** מסגרת פוסטר עם חיתוך פינה וזוהר עדין */
export function ArtFrame({
  src,
  alt,
  className = "",
  ratio = "aspect-[16/7]",
  priority = false,
  overlay = true,
}: {
  src: string;
  alt: string;
  className?: string;
  ratio?: string;
  priority?: boolean;
  overlay?: boolean;
}) {
  return (
    <span className={`relative block overflow-hidden ${ratio} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="size-full object-cover animate-drift"
      />
      {overlay ? (
        <>
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian-950 via-obsidian-950/25 to-transparent" />
          <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-brass-400/15" />
        </>
      ) : null}
    </span>
  );
}
