"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Alert, Button, Checkbox, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type Stage = "credentials" | "twofactor";

/** טופס התחברות עם תמיכה בשלב 2FA, הודעות שגיאה מדויקות וחסימת brute-force */
export function LoginForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await apiCall<{ requires2fa?: boolean; challenge?: string; user?: unknown }>("/api/auth/login", {
      method: "POST",
      body: { email, password, remember },
    });
    setLoading(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }

    if (res.data.requires2fa) {
      setChallenge(res.data.challenge ?? "");
      setStage("twofactor");
      toast.push("שלח את הקוד מאפליקציית האימות 📱", "info");
      return;
    }

    toast.push("התחברת בהצלחה! 🍋", "success");
    router.push(next);
    router.refresh();
  };

  const submitTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await apiCall("/api/auth/login", { method: "POST", body: { email, password, challenge, totp: code, remember } });
    setLoading(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.push("התחברת בהצלחה! 🍋", "success");
    router.push(next);
    router.refresh();
  };

  if (stage === "twofactor") {
    return (
      <form onSubmit={submitTwoFactor} className="mt-6 space-y-4">
        <Alert tone="info">
          החשבון מוגן באימות דו-שלבי. הזן את הקוד בן 6 הספרות מאפליקציית האימות (Google Authenticator / Authy).
        </Alert>
        <Field label="קוד אימות" required htmlFor="totp">
          <Input
            id="totp"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="text-center text-2xl tracking-[0.5em]"
            maxLength={6}
            autoFocus
          />
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button type="submit" loading={loading} className="w-full">אמת והתחבר</Button>
        <button type="button" onClick={() => setStage("credentials")} className="w-full text-center text-xs text-ink-400 hover:text-white">
          חזרה למסך ההתחברות
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="mt-6 space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field label="אימייל" required htmlFor="email">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          dir="ltr"
          required
        />
      </Field>

      <Field label="סיסמה" required htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            dir="ltr"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 hover:text-white"
            aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
          >
            {showPassword ? "הסתר" : "הצג"}
          </button>
        </div>
      </Field>

      <div className="flex items-center justify-between">
        <Checkbox label="זכור אותי" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <Link href="/forgot-password" className="text-xs text-lemon-300 hover:underline">
          שכחתי סיסמה
        </Link>
      </div>

      <Button type="submit" loading={loading} className="w-full" size="lg">
        התחברות
      </Button>

      <p className="text-center text-sm text-ink-300">
        אין לך חשבון?{" "}
        <Link href="/register" className="font-bold text-lemon-300 hover:underline">
          הרשמה חינם
        </Link>
      </p>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center text-[11px] text-ink-400">
        🔒 החיבור מוצפן, הסיסמאות נשמרות כ-scrypt, וכל ניסיון התחברות נרשם ביומן האבטחה.
      </div>
    </form>
  );
}
