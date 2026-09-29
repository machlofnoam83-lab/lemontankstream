"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icons";
import { OrnamentRule } from "@/components/ui/ornaments";

type Stage = "credentials" | "twofactor";

/**
 * טופס התחברות — "הדלת נפתחת".
 *
 * כל פרט זז, אבל במידה: התווית נוגעת למעלה, קו פליז מצטייר מתחת לשדה במיקוד,
 * שגיאה מנמנעת (לחימה, לא קפיצה), כפתור השליחה נושא ברק שחולף, ובמצב טעינה
 * שלוש נקודות מהבהבות כמו להבה. בכניסה מוצלחת עוברת דלת אור על המסך — רגע
 * אחד לפני המעבר, כמו אור שנכנס לחדר.
 *
 * נגישות: תוויות אמיתיות (label), aria-invalid, aria-describedby, ומיקוד
 * אוטומטי לשדה הקוד בשלב 2FA.
 */
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
  const [opening, setOpening] = useState(false);
  const [shake, setShake] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "twofactor") codeRef.current?.focus();
  }, [stage]);

  const fail = (message: string) => {
    setError(message);
    setShake((n) => n + 1);
  };

  const enter = () => {
    // רגע של "אור בדלת" לפני המעבר — ואז ניווט
    setOpening(true);
    setTimeout(() => {
      router.push(next);
      router.refresh();
    }, 620);
  };

  const submitCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const res = await apiCall<{ requires2fa?: boolean; challenge?: string; user?: unknown }>("/api/auth/login", {
      method: "POST",
      body: { email, password, remember },
    });
    setLoading(false);

    if (!res.ok) {
      fail(res.error.message);
      return;
    }

    if (res.data.requires2fa) {
      setChallenge(res.data.challenge ?? "");
      setStage("twofactor");
      toast.push("הזן את הקוד מאפליקציית האימות", "info");
      return;
    }

    toast.push("נכנסת. ברוך הבא לארכיון.", "success");
    enter();
  };

  const submitTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const res = await apiCall("/api/auth/login", {
      method: "POST",
      body: { email, password, challenge, totp: code, remember },
    });
    setLoading(false);

    if (!res.ok) {
      fail(res.error.message);
      setCode("");
      return;
    }
    toast.push("אומת. הדלת נפתחה.", "success");
    enter();
  };

  return (
    <div className="relative">
      {opening ? (
        <span
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[80] bg-[radial-gradient(60%_50%_at_50%_50%,rgba(240,217,168,0.5),transparent_72%)] animate-door"
        />
      ) : null}

      {stage === "twofactor" ? (
        <form onSubmit={submitTwoFactor} className="mt-6 space-y-5">
          <div key={shake} className={`space-y-5 ${error ? "animate-shake" : ""}`}>
            <div className="flex items-start gap-2.5 border border-brass-400/25 bg-brass-400/[0.06] px-4 py-3 text-sm text-parchment-200 chamfer">
              <Icon name="key" className="mt-0.5 size-4 shrink-0 text-brass-300" />
              <p>
                החשבון מוגן באימות דו־שלבי. הקלד את הקוד בן שש הספרות מאפליקציית האימות
                (Google Authenticator / Authy / 1Password).
              </p>
            </div>

            <fieldset>
              <legend className="field-label">
                <Icon name="shield-check" className="size-4 text-brass-300" />
                קוד אימות
              </legend>
              <div className="relative">
                {/* שישה חריצים שמראים את ההתקדמות — הקלט עצמו שקוף מעליהם */}
                <div className="pointer-events-none grid grid-cols-6 gap-2" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, index) => {
                    const char = code[index] ?? "";
                    const isActive = code.length === index;
                    return (
                      <span
                        key={index}
                        className={`code-cell ${char ? "text-parchment-50" : "text-parchment-300/25"} ${
                          isActive ? "code-cell-active" : ""
                        }`}
                      >
                        {char || "•"}
                      </span>
                    );
                  })}
                </div>
                <input
                  ref={codeRef}
                  id="totp"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-label="קוד אימות דו-שלבי"
                  aria-invalid={error ? true : undefined}
                  className="absolute inset-0 size-full cursor-text opacity-0"
                />
              </div>
            </fieldset>

            {error ? (
              <p className="field-error animate-shake" role="alert">
                <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-ember-400" />
                {error}
              </p>
            ) : null}
          </div>

          <button type="submit" disabled={loading} className="btn-primary sheen w-full text-base disabled:opacity-60">
            {loading ? <LampDots label="מאמת" /> : (
              <>
                <Icon name="unlock" className="size-5" />
                אמת והתחבר
              </>
            )}
          </button>

          <OrnamentRule />

          <button
            type="button"
            onClick={() => {
              setStage("credentials");
              setCode("");
              setError(null);
            }}
            className="mx-auto flex items-center gap-1.5 font-display text-sm text-parchment-300/80 transition hover:text-brass-200"
          >
            <Icon name="arrow-right" className="size-4" />
            חזרה למסך ההתחברות
          </button>
        </form>
      ) : (
        <form onSubmit={submitCredentials} className="mt-6 space-y-5">
          <div key={shake} className={`space-y-5 ${error ? "animate-shake" : ""}`}>
            {error ? (
              <p className="field-error animate-shake" role="alert">
                <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-ember-400" />
                {error}
              </p>
            ) : null}

            <Field icon="mail" label="אימייל">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                dir="ltr"
                required
                aria-invalid={error ? true : undefined}
                className="field-ink transition focus:field-ink-focus"
              />
            </Field>

            <Field icon="lock" label="סיסמה">
              <span className="relative block">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  dir="ltr"
                  required
                  aria-invalid={error ? true : undefined}
                  className="field-ink w-full pl-20 transition focus:field-ink-focus"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-1 border border-brass-400/20 px-2 py-1 font-mono text-[0.72rem] text-parchment-300/80 transition hover:border-brass-300/60 hover:text-brass-200"
                  aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} className="size-3.5" />
                  {showPassword ? "הסתר" : "הצג"}
                </button>
              </span>
            </Field>

            <div className="flex items-center justify-between gap-3">
              <label className="group flex cursor-pointer items-center gap-2 text-sm text-parchment-200/85">
                <span className="relative flex size-5 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    className="peer size-5 appearance-none border border-brass-400/35 bg-obsidian-950 transition checked:border-brass-300 checked:bg-brass-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass-300/60"
                  />
                  <Icon
                    name="check"
                    className="pointer-events-none absolute size-3.5 scale-50 text-obsidian-950 opacity-0 transition peer-checked:scale-100 peer-checked:opacity-100"
                    strokeWidth={3}
                  />
                </span>
                זכור אותי
              </label>
              <Link
                href="/forgot-password"
                className="font-display text-sm text-brass-300 underline decoration-brass-400/40 decoration-dotted underline-offset-4 transition hover:text-brass-200 hover:decoration-brass-300"
              >
                שכחתי סיסמה
              </Link>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary sheen w-full text-base disabled:opacity-60">
            {loading ? <LampDots label="מתחבר" /> : (
              <>
                <Icon name="door" className="size-5" />
                התחברות
              </>
            )}
          </button>

          <OrnamentRule />

          <p className="text-center font-display text-sm text-parchment-300/85">
            אין לך חשבון?{" "}
            <Link href="/register" className="font-bold text-brass-300 transition hover:text-brass-200">
              הרשמה חינם
            </Link>
          </p>

          <p className="flex items-center justify-center gap-2 border border-brass-400/15 bg-obsidian-900/40 px-4 py-3 text-center text-[0.82rem] text-parchment-300/70 chamfer">
            <Icon name="shield-check" className="size-4 shrink-0 text-verdigris-400" />
            החיבור מוצפן · הסיסמאות נשמרות ב־scrypt · כל ניסיון התחברות נרשם ביומן האבטחה
          </p>
        </form>
      )}
    </div>
  );
}

/** שדה עם תווית חרות ואייקון — נשמר כאן כדי שכל מסכי הכניסה ייראו אותו דבר */
function Field({ label, icon, children }: { label: string; icon: "mail" | "lock"; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">
        <Icon name={icon} className="size-4 text-brass-300/90" />
        {label}
      </span>
      {children}
    </label>
  );
}

/** שלוש נקודות שמהבהבות כמו להבה — מצב טעינה בלי ספינר גנרי */
function LampDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{label}</span>
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 rounded-full bg-obsidian-950/70 animate-lamp"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
    </span>
  );
}
