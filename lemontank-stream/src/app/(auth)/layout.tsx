import Link from "next/link";
import { ToastProvider } from "@/components/ui/toast";

/** פריסת מסכי ההתחברות/הרשמה — ממורכזת, עם רקע קולנועי ממותג */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12">
        {/* רקע קולנועי */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-40 right-1/4 h-[26rem] w-[26rem] rounded-full bg-lemon-400/12 blur-[110px]" />
          <div className="absolute -bottom-48 left-1/4 h-[26rem] w-[26rem] rounded-full bg-plus-500/12 blur-[110px]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-lemon-400/30 to-transparent" />
        </div>

        <Link href="/" className="group relative mb-9 flex items-center gap-3" aria-label="LemonTank Stream — דף הבית">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-lemon-400/30 bg-lemon-400/10 text-2xl shadow-[0_0_30px_-8px_rgba(247,194,43,0.85)] transition-transform duration-300 group-hover:scale-105"
            aria-hidden="true"
          >
            🍋
          </span>
          <span className="text-2xl font-black tracking-tight">
            Lemon<span className="text-gradient">Tank</span>
            <span className="mt-1 block text-[0.85rem] font-bold uppercase tracking-[0.22em] text-ink-400">Stream</span>
          </span>
        </Link>

        <main id="main" className="relative w-full max-w-md">
          {children}
        </main>

        <p className="relative mt-9 text-center text-xs leading-relaxed text-ink-400">
          בהתחברות אתה מאשר את{" "}
          <Link href="/legal/terms" className="text-lemon-300 hover:underline">
            תנאי השימוש
          </Link>{" "}
          ו
          <Link href="/legal/privacy" className="text-lemon-300 hover:underline">
            מדיניות הפרטיות
          </Link>
        </p>

        <p className="relative mt-3 flex items-center gap-1.5 text-[0.85rem] text-ink-500">
          <span aria-hidden="true">🔒</span> חיבור מוצפן · סיסמאות נשמרות ב-scrypt · אימות דו-שלבי זמין
        </p>
      </div>
    </ToastProvider>
  );
}
