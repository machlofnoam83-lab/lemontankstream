import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { DustMotes, OrnamentRule } from "@/components/ui/ornaments";

/* ═══════════════════════════════════════════════════════════════════════════
   מצבי ביניים — טעינה, שגיאה, ורשומה שלא נמצאה.

   הכלל: גם כשהאתר לא מצליח להראות תוכן, הוא עדיין נראה כמו המקום הזה —
   ארכיון עם מדפים, נר דולק ודיו רטוב. אין מסך לבן, אין "משהו השתבש".
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * מדף טעינה — שורת כותרים שמצטיירת לפי סדר, כל כותר כמו ספר שממתין.
 * שורת העשן מתחת ממשיכה לנשום כל עוד הנתונים בדרך.
 */
export function ShelfLoading({ rows = 2, perRow = 6 }: { rows?: number; perRow?: number }) {
  return (
    <div className="space-y-9" aria-busy="true" aria-label="טוען את הארכיון">
      {/* כותרת שמצטיירת */}
      <div className="space-y-3">
        <div className="skeleton h-7 w-52 chamfer-sm" />
        <div className="skeleton h-3 w-80 max-w-full chamfer-sm" />
      </div>

      {Array.from({ length: rows }).map((_, row) => (
        <section key={row} className="reveal-item" style={{ animationDelay: `${row * 120}ms` }}>
          <div className="mb-3 flex items-center gap-3">
            <div className="skeleton size-5 rounded-full" />
            <div className="skeleton h-4 w-36 chamfer-sm" />
            <span className="h-px flex-1 bg-gradient-to-l from-brass-400/25 to-transparent" />
          </div>

          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: perRow }).map((_, i) => (
              <div
                key={i}
                className="reveal-item w-[132px] shrink-0 sm:w-[164px]"
                style={{ animationDelay: `${row * 120 + i * 55}ms` }}
              >
                <div className="skeleton relative aspect-[2/3] w-full chamfer">
                  <span className="skeleton-shine" />
                </div>
                <div className="skeleton mt-2 h-3 w-4/5 chamfer-sm" />
                <div className="skeleton mt-1.5 h-2.5 w-1/3 chamfer-sm" />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* נר שממתין בסוף המסך */}
      <p className="flex items-center justify-center gap-2 pt-2 font-mono text-[0.72rem] uppercase tracking-[0.24em] text-brass-300/70">
        <span className="animate-lamp" style={{ animationDelay: "0ms" }}>
          ◈
        </span>
        <span className="animate-lamp" style={{ animationDelay: "0.18s" }}>
          ◈
        </span>
        <span className="animate-lamp" style={{ animationDelay: "0.36s" }}>
          ◈
        </span>
        <span className="ms-1">פותחים את המגירה</span>
      </p>
    </div>
  );
}

/** שלד לעמוד תוכן בודד (כותר, פרק, ערוץ) */
export function PageLoading({ label = "טוען" }: { label?: string }) {
  return (
    <div className="animate-fade-in space-y-6" aria-busy="true" aria-label={label}>
      <div className="framed chamfer relative overflow-hidden bg-obsidian-850">
        <div className="relative grid gap-6 p-5 md:grid-cols-[220px_1fr] md:p-7">
          <div className="skeleton relative aspect-[2/3] w-full max-w-[220px] chamfer">
            <span className="skeleton-shine" />
          </div>
          <div className="space-y-3 self-center">
            <div className="skeleton h-3 w-24 chamfer-sm" />
            <div className="skeleton h-9 w-3/4 chamfer-sm" />
            <div className="skeleton h-3 w-full chamfer-sm" />
            <div className="skeleton h-3 w-5/6 chamfer-sm" />
            <div className="flex gap-2 pt-2">
              <div className="skeleton h-11 w-36 chamfer" />
              <div className="skeleton h-11 w-28 chamfer" />
            </div>
          </div>
        </div>
      </div>
      <p className="text-center font-mono text-[0.72rem] uppercase tracking-[0.24em] text-brass-300/70">
        <span className="animate-lamp">{label}</span>
        <span className="animate-lamp" style={{ animationDelay: "0.2s" }}>
          .
        </span>
        <span className="animate-lamp" style={{ animationDelay: "0.4s" }}>
          .
        </span>
      </p>
    </div>
  );
}

/**
 * דף שנשרף — מסך שגיאה.
 *
 * לא "אופס! משהו השתבש". קצה של דף חרוך, גיצים מרחפים, ומתחתיו שתי דלתות
 * יציאה: לנסות שוב, או לחזור למדף. `onRetry` מגיע מ-error.tsx של Next.
 */
export function BurntPage({
  title = "הדף הזה עלה באש",
  hint = "הקריאה נעצרה באמצע. הנר נשאר דלוק — אפשר לנסות שוב.",
  onRetry,
  homeHref = "/",
  homeLabel = "חזרה למדף",
  children,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative mx-auto max-w-2xl py-10" role="alert">
      <div className="framed chamfer relative overflow-hidden bg-obsidian-900">
        {/* קצה חרוך */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(70%_120%_at_50%_0%,rgba(217,102,58,0.28),transparent_72%)]"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          <DustMotes count={14} />
        </span>

        <div className="relative px-6 py-10 text-center md:px-10">
          <span className="mx-auto flex size-14 items-center justify-center border border-ember-400/40 bg-ember-500/10 text-ember-400 chamfer">
            <Icon name="flame" className="size-7 animate-flicker" />
          </span>

          <h1 className="mt-4 font-display text-2xl font-bold text-parchment-50 md:text-3xl">{title}</h1>
          <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-parchment-200/80">{hint}</p>

          <OrnamentRule className="mx-auto my-6 w-40" />

          <div className="flex flex-wrap items-center justify-center gap-3">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="btn-primary chamfer lift lift-hover inline-flex items-center gap-2 px-5 py-2.5 font-display text-sm font-bold"
              >
                <Icon name="refresh" className="size-4" />
                לנסות שוב
              </button>
            ) : null}
            <Link
              href={homeHref}
              className="btn-ghost chamfer lift lift-hover inline-flex items-center gap-2 px-5 py-2.5 font-display text-sm font-bold"
            >
              <Icon name="lantern" className="size-4" />
              {homeLabel}
            </Link>
          </div>

          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * רשומה שאינה במרשם — 404.
 * דף פנקס עם שורה שאין בה כלום, וקו שנמשך מתחתיה.
 */
export function EntryNotFound({
  title = "הרשומה הזאת אינה במרשם",
  hint = "הקישור אולי התיישן, או שהשם שונה מאז. אפשר לחפש לפי שם, או לחזור למדפים.",
  links,
  children,
}: {
  title?: string;
  hint?: string;
  links?: { href: string; label: string; icon?: IconName }[];
  children?: React.ReactNode;
}) {
  const fallback: { href: string; label: string; icon: IconName }[] = [
    { href: "/movies", label: "סרטים", icon: "film" },
    { href: "/series", label: "סדרות", icon: "reel" },
    { href: "/genres", label: "ז׳אנרים", icon: "compass" },
    { href: "/search", label: "חיפוש", icon: "search" },
  ];

  return (
    <section className="relative mx-auto max-w-3xl py-10">
      <div className="card-surface chamfer relative overflow-hidden p-6 text-center md:p-10">
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          <DustMotes count={12} />
        </span>

        <span className="relative mx-auto flex size-16 items-center justify-center border border-brass-400/25 bg-obsidian-950 text-brass-300/80 chamfer">
          <Icon name="scroll" className="size-8" />
        </span>

        <p className="mt-4 font-mono text-[0.72rem] uppercase tracking-[0.26em] text-brass-300/80">
          מרשם הארכיון · 404
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold text-parchment-50 md:text-3xl">{title}</h1>
        <p className="mx-auto mt-2 max-w-lg text-base leading-relaxed text-parchment-200/80">{hint}</p>

        {/* שורה ריקה בפנקס — הקו נמשך מתחתיה */}
        <div className="mx-auto mt-6 max-w-md">
          <div className="flex items-baseline justify-between gap-3 border-b border-brass-400/20 pb-1">
            <span className="font-display text-sm text-parchment-300/50">שם הכותר</span>
            <span className="font-mono text-xs text-parchment-300/30">—</span>
          </div>
          <span
            aria-hidden="true"
            className="mt-1 block h-px origin-right animate-draw bg-gradient-to-l from-brass-400/60 to-transparent"
          />
        </div>

        <OrnamentRule className="mx-auto my-7 w-44" />

        <div className="flex flex-wrap items-center justify-center gap-3">
          {(links ?? fallback).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="btn-ghost chamfer lift lift-hover inline-flex items-center gap-2 px-4 py-2.5 font-display text-sm font-bold"
            >
              {l.icon ? <Icon name={l.icon} className="size-4" /> : null}
              {l.label}
            </Link>
          ))}
        </div>

        {children}
      </div>
    </section>
  );
}
