import Link from "next/link";
import { ToastProvider } from "@/components/ui/toast";

/** פריסת מסכי ההתחברות/הרשמה — ממורכזת, עם רקע ממותג */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-32 right-1/4 h-96 w-96 rounded-full bg-lemon-400/10 blur-3xl" />
          <div className="absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-plus-500/10 blur-3xl" />
        </div>

        <Link href="/" className="relative mb-8 flex items-center gap-2 text-2xl font-black">
          <span aria-hidden="true">🍋</span> Lemon<span className="text-lemon-400">Tank</span>
        </Link>

        <main id="main" className="relative w-full max-w-md">
          {children}
        </main>

        <p className="relative mt-8 text-center text-xs text-ink-400">
          בהתחברות אתה מאשר את{" "}
          <Link href="/legal/terms" className="text-lemon-300 hover:underline">תנאי השימוש</Link> ו
          <Link href="/legal/privacy" className="text-lemon-300 hover:underline">מדיניות הפרטיות</Link>
        </p>
      </div>
    </ToastProvider>
  );
}
