import Link from "next/link";
import { ToastProvider } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icons";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { DustMotes } from "@/components/ui/ornaments";
import { artFile } from "@/lib/art";

/**
 * פריסת מסכי הכניסה — "הדלת בארכיון".
 *
 * במסכים רחבים: טור אמנות משמאל (הציור שנוצר במיוחד, אם קיים) וטור הטופס
 * מימין; במסכים צרים נשאר רק הטופס. אין הילות ניאון ואין גרדיאנטים סגולים —
 * אבן, פליז ואור נר.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const door = artFile("auth-door.jpg");

  return (
    <ToastProvider>
      <div className="relative min-h-dvh">
        {/* רקע: אבן חשוכה עם אור נר בפינה */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <span className="absolute inset-0 bg-[radial-gradient(90%_70%_at_78%_18%,rgba(201,154,74,0.16),transparent_62%),radial-gradient(70%_60%_at_12%_88%,rgba(124,36,48,0.12),transparent_60%)]" />
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-brass-500/40 to-transparent" />
          <DustMotes count={16} />
        </div>

        <div className="relative mx-auto grid min-h-dvh max-w-[1400px] items-center gap-10 px-4 py-10 lg:grid-cols-[1.05fr_minmax(24rem,30rem)] lg:py-14">
          {/* טור האמנות — נעלם במסכים צרים */}
          <div className="hidden lg:block">
            <div className="framed chamfer relative h-[min(72vh,40rem)] overflow-hidden bg-obsidian-950">
              {door ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={door} alt="" className="absolute inset-0 size-full object-cover animate-drift" />
              ) : (
                <span className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_10%,rgba(201,154,74,0.22),transparent_70%),linear-gradient(170deg,#1a1712,#0a0806)]" />
              )}
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian-950 via-obsidian-950/35 to-transparent" />
              <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-brass-400/15" />

              <div className="absolute inset-x-0 bottom-0 space-y-3 p-8">
                <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-brass-300/80">LemonTank · Archive</p>
                <h2 className="font-display text-3xl font-bold leading-tight text-parchment-50">
                  כל סרט וכל סדרה,
                  <br />
                  במקום אחד שקט.
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-parchment-200/80">
                  חשבון אחד, פרופילים לכל בני הבית, ומסלול חינם מלכתחילה. בלי פרסומות קופצות,
                  בלי הפתעות בחשבון.
                </p>
                <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm text-parchment-200/85">
                  {[
                    { icon: "shield-check" as const, label: "סיסמאות ב-scrypt" },
                    { icon: "key" as const, label: "אימות דו-שלבי" },
                    { icon: "users" as const, label: "עד 5 פרופילים בפלוס" },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center gap-1.5">
                      <Icon name={item.icon} className="size-4 text-brass-300" />
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* טור הטופס */}
          <div className="mx-auto w-full max-w-md lg:mx-0">
            <Link href="/" className="group mb-7 flex items-center gap-3" aria-label="LemonTank Stream — דף הבית">
              <span className="transition-transform duration-500 [transition-timing-function:var(--ease-ink)] group-hover:-translate-y-0.5">
                <LogoMark className="size-11" />
              </span>
              <Wordmark />
            </Link>

            <main id="main">{children}</main>

            <p className="mt-7 text-center text-xs leading-relaxed text-parchment-300/60">
              בהתחברות אתה מאשר את{" "}
              <Link href="/legal/terms" className="text-brass-300 underline decoration-dotted underline-offset-4 hover:text-brass-200">
                תנאי השימוש
              </Link>{" "}
              ו
              <Link href="/legal/privacy" className="text-brass-300 underline decoration-dotted underline-offset-4 hover:text-brass-200">
                מדיניות הפרטיות
              </Link>
            </p>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
