import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";
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
    <div className="card-surface rounded-2xl p-6 md:p-8">
      <h1 className="text-2xl font-black">פתח חשבון 🍋</h1>
      <p className="mt-1 text-sm text-ink-400">
        הרשמה בחינם, בלי כרטיס אשראי. אפשר לשדרג לפלוס בכל שלב ולהתחיל ב-7 ימי ניסיון.
      </p>
      <RegisterForm plans={plans} initialPlan={params.plan === "plus" ? "plus" : "free"} referral={params.ref ?? null} />
    </div>
  );
}
