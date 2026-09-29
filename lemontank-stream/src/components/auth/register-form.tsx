"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icons";
import { OrnamentRule } from "@/components/ui/ornaments";
import { PasswordMeter } from "@/components/auth/password-meter";

type Plan = { code: string; name_he: string; price_ils: number; max_quality: string };

/**
 * טופס הרשמה — "כרטיס חבר בארכיון".
 *
 * בחירת המסלול היא שני כרטיסים שנבחרים בתנועה (המסגרת מצטיירת, לא "מדליקה
 * ניאון"), מדד הסיסמה מגיב בזמן אמת, וכל שגיאה מנמנעת בעדינות ומוצגת בעברית.
 */
export function RegisterForm({
  plans,
  initialPlan = "free",
  referral,
}: {
  plans: Plan[];
  initialPlan?: string;
  referral?: string | null;
}) {
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
  const [shake, setShake] = useState(0);
  const [passwordOk, setPasswordOk] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setProblems([]);

    const stop = (message: string) => {
      setError(message);
      setShake((n) => n + 1);
    };

    if (password !== confirm) return stop("הסיסמאות אינן זהות");
    if (password && !passwordOk) return stop("הסיסמה לא עומדת במדיניות האבטחה — ראו את ההערות מתחת לשדה הסיסמה");
    if (!accept) return stop("צריך לאשר את תנאי השימוש");

    setLoading(true);
    const res = await apiCall<{ user: { name: string } }>("/api/auth/register", {
      method: "POST",
      body: { name, email, password, plan, referral: ref || null, marketing, acceptTerms: true },
    });
    setLoading(false);

    if (!res.ok) {
      const details = res.error.details as { problems?: string[] } | undefined;
      if (details?.problems) setProblems(details.problems);
      return stop(res.error.message);
    }

    toast.push(`ברוך הבא ${res.data.user.name} — הארכיון פתוח.`, "success");
    router.push(plan === "plus" ? "/plans" : "/");
    router.refresh();
  };

  const confirmMismatch = Boolean(confirm) && confirm !== password;

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div key={shake} className={`space-y-5 ${error ? "animate-shake" : ""}`}>
        {error ? (
          <div className="field-error animate-shake" role="alert">
            <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-ember-400" />
            <div>
              <p>{error}</p>
              {problems.length ? (
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[0.85rem] text-parchment-200/85">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        <Field icon="user" label="שם מלא">
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="ישראל ישראלי"
            autoComplete="name"
            required
            minLength={2}
            maxLength={60}
            className="field-ink transition focus:field-ink-focus"
          />
        </Field>

        <Field icon="mail" label="אימייל">
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            dir="ltr"
            autoComplete="email"
            required
            className="field-ink transition focus:field-ink-focus"
          />
        </Field>

        <Field icon="lock" label="סיסמה" hint="לפחות 10 תווים, עם ספרה ותו מיוחד. מומלץ גם אות גדולה.">
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            dir="ltr"
            autoComplete="new-password"
            required
            className="field-ink transition focus:field-ink-focus"
          />
          <PasswordMeter password={password} email={email} name={name} onVerdict={setPasswordOk} />
        </Field>

        <Field icon="key" label="אימות סיסמה" error={confirmMismatch ? "הסיסמאות אינן זהות" : null}>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="••••••••"
            dir="ltr"
            autoComplete="new-password"
            required
            aria-invalid={confirmMismatch ? true : undefined}
            className={`field-ink transition focus:field-ink-focus ${confirmMismatch ? "border-oxblood-500/70" : ""}`}
          />
        </Field>

        {/* בחירת מסלול — כרטיסים שנבחרים */}
        <fieldset className="space-y-2">
          <legend className="field-label">
            <Icon name="tag" className="size-4 text-brass-300/90" />
            בחרו מסלול
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {plans.map((option, index) => {
              const selected = plan === option.code;
              return (
                <label
                  key={option.code}
                  style={{ animationDelay: `${index * 70}ms` }}
                  className={`group relative block cursor-pointer reveal-item border p-3.5 chamfer lift ${
                    selected
                      ? "border-brass-300/70 bg-brass-400/[0.09] shadow-[0_0_30px_-18px_rgba(201,154,74,0.95)]"
                      : "border-brass-400/18 bg-obsidian-900/45 hover:border-brass-400/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={option.code}
                    checked={selected}
                    onChange={() => setPlan(option.code)}
                    className="sr-only"
                  />
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-display text-base font-bold text-parchment-100">
                      <Icon name={option.code === "plus" ? "crown" : "lantern"} className="size-4 text-brass-300" />
                      {option.code === "plus" ? "פלוס" : "חינם"}
                    </span>
                    <span className="font-mono text-sm text-brass-200 tabular-nums">
                      {option.price_ils === 0 ? "₪0" : `₪${Number(option.price_ils).toFixed(2)}/חודש`}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[0.85rem] leading-relaxed text-parchment-300/75">
                    {option.code === "plus"
                      ? "כל התוכן, 4K, 4 מסכים, הורדות, בלי פרסומות"
                      : "כל תוכן החינם, 720p, מסך אחד"}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 bottom-0 h-px origin-right bg-gradient-to-l from-transparent via-brass-300 to-transparent transition-transform duration-500 [transition-timing-function:var(--ease-ink)] ${
                      selected ? "scale-x-100" : "scale-x-0"
                    }`}
                  />
                </label>
              );
            })}
          </div>
          {plan === "plus" ? (
            <p className="flex items-center gap-2 text-sm text-brass-200 animate-ink-in">
              <Icon name="hourglass" className="size-4" />
              7 ימי ניסיון חינם — אפשר לבטל בכל רגע, בלי התחייבות.
            </p>
          ) : null}
        </fieldset>

        <Field icon="gift" label="קוד הפניה (אופציונלי)">
          <input
            id="ref"
            value={ref}
            onChange={(event) => setRef(event.target.value.toUpperCase())}
            placeholder="LT123456"
            dir="ltr"
            maxLength={32}
            className="field-ink font-mono transition focus:field-ink-focus"
          />
        </Field>

        <div className="space-y-2.5">
          <Check label="אני מאשר/ת את תנאי השימוש ומדיניות הפרטיות" checked={accept} onChange={setAccept} required>
            <Link href="/legal/terms" className="text-brass-300 underline decoration-dotted underline-offset-4 hover:text-brass-200">
              תנאי השימוש
            </Link>
            {" ו"}
            <Link href="/legal/privacy" className="text-brass-300 underline decoration-dotted underline-offset-4 hover:text-brass-200">
              מדיניות הפרטיות
            </Link>
          </Check>
          <Check label="שלחו לי עדכונים על תוכן חדש ומבצעים" checked={marketing} onChange={setMarketing} />
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn-primary sheen w-full text-base disabled:opacity-60">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span>פותח חשבון</span>
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span key={index} className="size-1.5 rounded-full bg-obsidian-950/70 animate-lamp" style={{ animationDelay: `${index * 160}ms` }} />
              ))}
            </span>
          </span>
        ) : (
          <>
            <Icon name="key" className="size-5" />
            יצירת חשבון
          </>
        )}
      </button>

      <OrnamentRule />

      <p className="text-center font-display text-sm text-parchment-300/85">
        יש לך כבר חשבון?{" "}
        <Link href="/login" className="font-bold text-brass-300 transition hover:text-brass-200">
          התחברות
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  icon,
  hint,
  error,
  children,
}: {
  label: string;
  icon: "user" | "mail" | "lock" | "key" | "gift";
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">
        <Icon name={icon} className="size-4 text-brass-300/90" />
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[0.82rem] text-parchment-300/60">{hint}</span> : null}
      {error ? (
        <span className="mt-1 flex items-center gap-1.5 text-[0.85rem] text-ember-300 animate-ink-in" role="alert">
          <Icon name="warn" className="size-3.5" />
          {error}
        </span>
      ) : null}
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
  required,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  required?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-parchment-200/85">
      <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          required={required}
          className="peer size-5 appearance-none border border-brass-400/35 bg-obsidian-950 transition checked:border-brass-300 checked:bg-brass-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass-300/60"
        />
        <Icon
          name="check"
          className="pointer-events-none absolute size-3.5 scale-50 text-obsidian-950 opacity-0 transition peer-checked:scale-100 peer-checked:opacity-100"
          strokeWidth={3}
        />
      </span>
      <span>
        {label}
        {children ? <span className="block"> {children}</span> : null}
      </span>
    </label>
  );
}
