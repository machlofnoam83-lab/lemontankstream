import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "שחזור סיסמה", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="card-surface rounded-2xl p-6 md:p-8">
      <h1 className="text-2xl font-black">שכחת סיסמה? 🔑</h1>
      <p className="mt-1 text-sm text-ink-400">
        הזן את כתובת האימייל שלך ונשלח קישור מאובטח לאיפוס. הקישור תקף ל-30 דקות ונשרף לאחר שימוש אחד.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
