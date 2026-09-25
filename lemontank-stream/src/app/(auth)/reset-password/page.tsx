import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "איפוס סיסמה", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return (
    <div className="card-surface rounded-2xl p-6 md:p-8">
      <h1 className="text-2xl font-black">בחירת סיסמה חדשה 🔐</h1>
      <p className="mt-1 text-sm text-ink-400">
        אחרי האיפוס כל המכשירים המחוברים ינותקו אוטומטית — תצטרך להתחבר מחדש בכל מקום.
      </p>
      <ResetPasswordForm token={params.token ?? ""} />
    </div>
  );
}
