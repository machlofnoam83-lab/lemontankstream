"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Alert, Button, Checkbox, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { PasswordMeter } from "@/components/auth/password-meter";

type Plan = { code: string; name_he: string; price_ils: number; max_quality: string };

/** טופס הרשמה עם מדד חוזק סיסמה, בחירת מסלול וולידציה בזמן אמת */
export function RegisterForm({ plans, initialPlan = "free", referral }: { plans: Plan[]; initialPlan?: string; referral?: string | null }) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [plan, setPlan] = useState(initialPlan);
  const [ref, setRef] = useState(referral ?? "");
  const [accept, setAccept] = useState(false);
  const [marketing, setMarketing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [passwordOk, setPasswordOk] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProblems([]);

    if (password !== confirm) {
      setError("הסיסמאות אינן זהות");
      return;
    }
    if (password && !passwordOk) {
      setError("הסיסמה לא עומדת במדיניות האבטחה — ראה את ההערות מתחת לשדה הסיסמה");
      return;
    }
    if (!accept) {
      setError("צריך לאשר את תנאי השימוש");
      return;
    }

    setLoading(true);
    const res = await apiCall<{ user: { name: string } }>("/api/auth/register", {
      method: "POST",
      body: { name, email, password, plan, referral: ref || null, marketing, acceptTerms: true },
    });
    setLoading(false);

    if (!res.ok) {
      setError(res.error.message);
      const details = res.error.details as { problems?: string[] } | undefined;
      if (details?.problems) setProblems(details.problems);
      return;
    }

    toast.push(`ברוך הבא ${res.data.user.name}! 🎉`, "success");
    router.push(plan === "plus" ? "/plans" : "/");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error ? (
        <Alert tone="danger">
          {error}
          {problems.length ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <Field label="שם מלא" required htmlFor="name">
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ישראל ישראלי" autoComplete="name" required minLength={2} maxLength={60} />
      </Field>

      <Field label="אימייל" required htmlFor="email">
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" autoComplete="email" required />
      </Field>

      <Field
        label="סיסמה"
        required
        htmlFor="password"
        hint="לפחות 10 תווים, עם ספרה ותו מיוחד. מומלץ גם אות גדולה."
      >
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" autoComplete="new-password" required />
        <PasswordMeter password={password} email={email} name={name} onVerdict={setPasswordOk} />
      </Field>

      <Field label="אימות סיסמה" required htmlFor="confirm" error={confirm && confirm !== password ? "הסיסמאות אינן זהות" : null}>
        <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" dir="ltr" autoComplete="new-password" required />
      </Field>

      {/* בחירת מסלול */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink-200">בחר מסלול</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {plans.map((p) => (
            <label
              key={p.code}
              className={`cursor-pointer rounded-xl border p-3 transition ${
                plan === p.code ? "border-lemon-400 bg-lemon-400/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
            >
              <input type="radio" name="plan" value={p.code} checked={plan === p.code} onChange={() => setPlan(p.code)} className="sr-only" />
              <span className="flex items-center justify-between">
                <span className="font-bold">{p.code === "plus" ? "⭐ פלוס" : "חינם"}</span>
                <span className="text-sm">{p.price_ils === 0 ? "₪0" : `₪${Number(p.price_ils).toFixed(2)}/חודש`}</span>
              </span>
              <span className="mt-1 block text-[0.85rem] text-ink-400">
                {p.code === "plus" ? "כל התוכן, 4K, 4 מסכים, הורדות, בלי פרסומות" : "כל תוכן החינם, 720p, מסך אחד"}
              </span>
            </label>
          ))}
        </div>
        {plan === "plus" ? (
          <p className="text-[0.85rem] text-plus-400">7 ימי ניסיון חינם — אפשר לבטל בכל רגע בלי התחייבות.</p>
        ) : null}
      </fieldset>

      <Field label="קוד הפניה (אופציונלי)" htmlFor="ref">
        <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="LT123456" dir="ltr" maxLength={32} />
      </Field>

      <Checkbox
        label={<span>אני מאשר/ת את <Link href="/legal/terms" className="text-lemon-300 hover:underline">תנאי השימוש</Link> ואת <Link href="/legal/privacy" className="text-lemon-300 hover:underline">מדיניות הפרטיות</Link></span>}
        checked={accept}
        onChange={(e) => setAccept(e.target.checked)}
        required
      />
      <Checkbox label="שלחו לי עדכונים על תוכן חדש ומבצעים" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />

      <Button type="submit" loading={loading} className="w-full" size="lg">
        יצירת חשבון
      </Button>

      <p className="text-center text-sm text-ink-300">
        יש לך כבר חשבון?{" "}
        <Link href="/login" className="font-bold text-lemon-300 hover:underline">התחברות</Link>
      </p>
    </form>
  );
}
