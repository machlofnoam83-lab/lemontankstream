import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { DustMotes, OrnamentRule } from "@/components/ui/ornaments";
import { Icon } from "@/components/ui/icons";
import { SITE } from "@/lib/i18n";

/**
 * 404 גלובלי — לכתובות שאין להן עמוד בכלל (למשל /xyz123).
 *
 * זו הפריסה היחידה שלא עוברת דרך פריסת האתר, ולכן העמוד הזה עומד בפני עצמו:
 * אותו חומר, אותו נר, אותה דלת.
 */
export const metadata = { title: "לא נמצא" };

export default function GlobalNotFound() {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-14">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(201,154,74,0.14),transparent_66%),radial-gradient(60%_50%_at_50%_100%,rgba(124,36,48,0.12),transparent_70%)]"
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        <DustMotes count={18} />
      </span>

      <main className="relative w-full max-w-xl text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-3 lift lift-hover"
          aria-label={`${SITE.nameHe} — לדף הבית`}
        >
          <LogoMark className="size-11" />
          <Wordmark className="text-2xl" />
        </Link>

        <div className="card-surface chamfer mt-7 p-7">
          <span className="mx-auto flex size-14 items-center justify-center border border-brass-400/25 bg-obsidian-950 text-brass-300/80 chamfer">
            <Icon name="compass" className="size-7 animate-drift" />
          </span>

          <p className="mt-4 font-mono text-[0.72rem] uppercase tracking-[0.26em] text-brass-300/80">
            מחוץ למדפים · 404
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold text-parchment-50">
            הדלת הזאת לא מובילה לשום אולם
          </h1>
          <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-parchment-200/80">
            הכתובת הזאת אינה קיימת בארכיון. יכול להיות שהיא הוקלדה אחרת, או שהמסך הזה נסגר מאז.
          </p>

          <OrnamentRule className="mx-auto my-6 w-40" />

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="btn-primary chamfer lift lift-hover inline-flex items-center gap-2 px-5 py-2.5 font-display text-sm font-bold"
            >
              <Icon name="lantern" className="size-4" />
              חזרה למדף
            </Link>
            <Link
              href="/search"
              className="btn-ghost chamfer lift lift-hover inline-flex items-center gap-2 px-5 py-2.5 font-display text-sm font-bold"
            >
              <Icon name="search" className="size-4" />
              חיפוש בארכיון
            </Link>
          </div>
        </div>

        <p className="mt-6 font-mono text-xs text-parchment-300/40">
          {SITE.nameHe} · הארכיון פתוח
        </p>
      </main>
    </div>
  );
}
