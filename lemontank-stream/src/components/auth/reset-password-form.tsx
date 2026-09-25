"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

export function ResetPasswordForm({ token: initialToken }: { token: string }) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProblems([]);

    if (password !== confirm) {
      setError("הסיסמאות אינן זהות");
      return;
    }

    setLoading(true);
    const res = await apiCall("/api/auth/password", { method: "POST", body: { action: "confirm", token, password } });
    setLoading(false);

    if (!res.ok) {
      setError(res.error.message);
      const details = res.error.details as { problems?: string[] } | undefined;
      if (details?.problems) setProblems(details.problems);
      return;
    }
    router.push("/login?reset=1");
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error ? (
        <Alert tone="danger">
          {error}
          {problems.length ? (
            <ul className="mt-2 list-inside list-disc text-xs">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      {!initialToken ? (
        <Field label="קוד איפוס (מהקישור במייל)" required htmlFor="token">
          <Input id="token" value={token} onChange={(e) => setToken(e.target.value)} dir="ltr" placeholder="הדבק את הטוקן מהמייל" required />
        </Field>
      ) : null}

      <Field label="סיסמה חדשה" required htmlFor="password" hint="לפחות 10 תווים, עם ספרה ותו מיוחד">
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" autoComplete="new-password" required />
      </Field>

      <Field label="אימות סיסמה" required htmlFor="confirm">
        <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" autoComplete="new-password" required />
      </Field>

      <Button type="submit" loading={loading} className="w-full" size="lg">
        החלף סיסמה
      </Button>

      <Link href="/login" className="block text-center text-sm text-lemon-300 hover:underline">
        חזרה להתחברות
      </Link>
    </form>
  );
}
