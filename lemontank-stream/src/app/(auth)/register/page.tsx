import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";
import { Icon } from "@/components/ui/icons";
import { get } from "@/lib/db";

export const metadata: Metadata = { title: "הרשמה חינם", description: "פתח חשבון חינם ב-LemonTank Stream — סרטים וסדרות בעברית" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ plan?: string; ref?: string }> }) {
  const params = await searchParams;
  const plans = (
    [
      { code: "free", name_he: "חינם", price_ils: 0, max_quality: "720p" },
    ] as { code: string; name_he: string; price_ils: number; max_quality: string }[]
  ).concat(
    (() => {
      try {
        const plus = get<{ code: string; name_he: string; price_ils: number; max_quality: string }>(
          "SELECT code, name_he, price_ils, max_quality FROM plans WHERE code = 'plus'",
        );
        return plus ? [plus] : [];
      } catch {
        return [];
      }
    })(),
  );

  return (
    <div className="card-surface chamfer relative animate-ink-in p-6 md:p-8">
      <span aria-hidden="true" className="pointer-events-none absolute inset-[6px] border border-brass-400/10 chamfer" />

      <div className="relative">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-brass-300/80">הרשמה</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-2xl font-bold text-parchment-50 md:text-3xl">
          <Icon name="quill" className="size-6 text-brass-300" />
          פתיחת חשבון
        </h1>
        <p className="mt-1.5 text-sm text-parchment-200/75">
          בחינם, בלי כרטיס אשראי. אפשר לשדרג לפלוס בכל שלב ולהתחיל ב־7 ימי ניסיון.
        </p>

        <RegisterForm plans={plans} initialPlan={params.plan === "plus" ? "plus" : "free"} referral={params.ref ?? null} />
      </div>
    </div>
  );
}
