"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await apiCall<{ message: string; devResetToken?: string }>("/api/auth/password", {
      method: "POST",
      body: { action: "request", email },
    });
    setLoading(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSent(true);
    setDevToken(res.data.devResetToken ?? null);
  };

  if (sent) {
    return (
      <div className="mt-6 space-y-4">
        <Alert tone="success">
          אם הכתובת רשומה אצלנו — נשלח אליה קישור לאיפוס סיסמה. בדוק גם בתיקיית הספאם.
        </Alert>

        {devToken ? (
          <Alert tone="warn">
            <p className="font-bold">מצב פיתוח (אין SMTP מוגדר):</p>
            <p className="mt-1 break-all font-mono text-[0.85rem]" dir="ltr">{devToken}</p>
            <button
              onClick={() => router.push(`/reset-password?token=${encodeURIComponent(devToken)}`)}
              className="mt-2 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black"
            >
              עבור לעמוד האיפוס עם הטוקן
            </button>
          </Alert>
        ) : null}

        <Button variant="ghost" className="w-full" onClick={() => setSent(false)}>
          שלח שוב / כתובת אחרת
        </Button>
        <Link href="/login" className="block text-center text-sm text-lemon-300 hover:underline">
          חזרה להתחברות
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="אימייל" required htmlFor="email">
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" placeholder="you@example.com" required autoFocus />
      </Field>
      <Button type="submit" loading={loading} className="w-full" size="lg">
        שלח קישור לאיפוס
      </Button>
      <Link href="/login" className="block text-center text-sm text-lemon-300 hover:underline">
        חזרה להתחברות
      </Link>
    </form>
  );
}
