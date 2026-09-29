import React from "react";
import { Icon, type IconName } from "./icons";

/* ═══════════════════════════════════════════════════════════════════════════
   רכיבי UI משותפים — אתר + פאנל ניהול.
   שפה אחת: חיתוך פינות, מסגרת פליז דקה, משטחי אובסידיאן, טיפוגרפיית ספר.
   כל רכיב זז קצת: כפתור נלחץ פנימה, שדה מצייר קו, מתג מחליק כמו ידית עץ.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────── כפתורים ────────────────────────────────── */

type ButtonVariant = "primary" | "ghost" | "outline" | "danger" | "plus" | "subtle";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-brass-300 via-brass-400 to-brass-600 text-obsidian-950 font-extrabold shadow-[var(--shadow-glow),0_1px_0_0_rgb(255_255_255/0.35)_inset] hover:brightness-[1.06]",
  plus: "bg-gradient-to-b from-oxblood-500 to-oxblood-600 text-parchment-50 font-extrabold border border-brass-400/40 hover:brightness-110",
  ghost:
    "bg-obsidian-900/70 text-parchment-100 border border-brass-400/22 hover:border-brass-300/55 hover:bg-obsidian-850/80 backdrop-blur",
  outline: "bg-transparent text-parchment-100 border border-brass-400/35 hover:border-brass-300/70 hover:bg-brass-400/[0.08]",
  danger: "bg-gradient-to-b from-ember-400 to-ember-500 text-parchment-50 font-bold hover:brightness-110",
  subtle: "bg-transparent text-parchment-300/80 hover:text-parchment-50 hover:bg-brass-400/[0.07]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2.5 gap-2",
  lg: "text-base px-6 py-3.5 gap-2.5",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, icon, className = "", children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`chamfer inline-flex select-none items-center justify-center whitespace-nowrap font-sans transition-all duration-300 [transition-timing-function:var(--ease-ink)] disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/** ספינר בצורת להבה מסתובבת — במקום עיגול טעינה גנרי */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`size-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="3" r="1.6" fill="currentColor" />
    </svg>
  );
}

/* ─────────────────────────────── שדות ─────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="field-label">
        {label} {required ? <span className="text-brass-300">*</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-parchment-300/60">{hint}</p> : null}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-ember-300 animate-ink-in" role="alert">
          <Icon name="warn" className="size-3.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputBase =
  "field-ink w-full transition [&::placeholder]:text-parchment-300/35 focus:field-ink-focus disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...rest },
  ref,
) {
  return <input ref={ref} {...rest} className={`${inputBase} ${className}`} />;
});

export function Textarea({ className = "", ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${inputBase} min-h-24 resize-y leading-relaxed ${className}`} />;
}

export function Select({ className = "", children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`field-ink appearance-none bg-[length:12px] transition focus:field-ink-focus ${className}`}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={`inline-flex cursor-pointer select-none items-center gap-2 text-sm text-parchment-200/85 ${className}`}>
      <span className="relative flex size-5 items-center justify-center">
        <input
          type="checkbox"
          {...rest}
          className="peer size-5 appearance-none border border-brass-400/35 bg-obsidian-950 transition checked:border-brass-300 checked:bg-brass-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass-300/60"
        />
        <Icon
          name="check"
          className="pointer-events-none absolute size-3.5 scale-50 text-obsidian-950 opacity-0 transition peer-checked:scale-100 peer-checked:opacity-100"
          strokeWidth={3}
        />
      </span>
      <span>{label}</span>
    </label>
  );
}

/** מתג הפעלה/כיבוי — ידית פליז שנעה על מסילה חשוכה */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-brass-400/10 py-3.5 last:border-0">
      <div className="min-w-0">
        <div className="font-display text-sm font-bold text-parchment-100">{label}</div>
        {description ? <div className="mt-0.5 text-xs leading-relaxed text-parchment-300/65">{description}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 border transition-all duration-400 [transition-timing-function:var(--ease-ink)] ${
          checked
            ? "border-brass-300/70 bg-gradient-to-l from-brass-400 to-brass-500 shadow-[0_0_18px_-6px_rgba(201,154,74,0.95)]"
            : "border-brass-400/20 bg-obsidian-800"
        } disabled:opacity-50`}
      >
        <span
          className={`absolute top-[3px] size-4 bg-parchment-100 shadow transition-all duration-400 [transition-timing-function:var(--ease-ink)] ${
            checked ? "right-[26px]" : "right-[3px]"
          }`}
        />
      </button>
    </div>
  );
}

/* ─────────────────────────────── תגיות ────────────────────────────────── */

export function Badge({ children, tone = "neutral", className = "" }: { children: React.ReactNode; tone?: "neutral" | "plus" | "free" | "warn" | "danger" | "success" | "info"; className?: string }) {
  const tones: Record<string, string> = {
    neutral: "bg-obsidian-800/70 text-parchment-200 border-brass-400/20",
    plus: "bg-oxblood-500/20 text-parchment-100 border-oxblood-500/50",
    free: "bg-verdigris-500/15 text-verdigris-300 border-verdigris-400/40",
    success: "bg-verdigris-500/15 text-verdigris-300 border-verdigris-400/40",
    warn: "bg-brass-500/15 text-brass-200 border-brass-400/40",
    danger: "bg-oxblood-600/25 text-ember-300 border-oxblood-500/50",
    info: "bg-obsidian-800/70 text-parchment-200 border-brass-400/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap border px-2.5 py-0.5 font-mono text-[0.78rem] font-bold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function PlanBadge({ plan, className = "" }: { plan: string; className?: string }) {
  return plan === "plus" ? (
    <span className={`badge-plus inline-flex items-center gap-1 ${className}`}>
      <Icon name="crown" className="size-3" />
      פלוס
    </span>
  ) : (
    <span className={`badge-free inline-flex items-center gap-1 ${className}`}>
      <Icon name="check" className="size-3" />
      חינם
    </span>
  );
}

/* ─────────────────────────────── כרטיסים ──────────────────────────────── */

export function Card({ children, className = "", as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: React.ElementType }) {
  return <Tag className={`card-surface chamfer ${className}`}>{children}</Tag>;
}

export function SectionTitle({
  children,
  action,
  icon,
  subtitle,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h2 className="section-heading text-parchment-100">
          <span className="section-heading-bar" aria-hidden="true" />
          {icon}
          {children}
        </h2>
        {subtitle ? <p className="mt-1.5 text-sm text-parchment-300/70">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "warn" | "danger" | "success" | "plus";
  icon?: React.ReactNode;
}) {
  const tones: Record<string, { value: string; tile: string }> = {
    neutral: { value: "text-parchment-50", tile: "border-brass-400/25 bg-brass-400/[0.06] text-brass-300" },
    plus: { value: "text-parchment-50", tile: "border-oxblood-500/45 bg-oxblood-500/15 text-parchment-200" },
    warn: { value: "text-brass-200", tile: "border-brass-400/40 bg-brass-500/12 text-brass-200" },
    danger: { value: "text-ember-300", tile: "border-oxblood-500/50 bg-oxblood-600/20 text-ember-300" },
    success: { value: "text-verdigris-300", tile: "border-verdigris-400/40 bg-verdigris-500/12 text-verdigris-300" },
  };
  const toneStyles = tones[tone];
  return (
    <Card className="group lift relative overflow-hidden p-4 hover:lift-hover hover:border-brass-300/45">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-parchment-300/70">{label}</span>
        {icon ? (
          <span className={`flex size-8 items-center justify-center border text-sm chamfer transition-transform duration-400 [transition-timing-function:var(--ease-ink)] group-hover:-translate-y-0.5 ${toneStyles.tile}`} aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <div className={`mt-2.5 font-display text-[1.7rem] font-bold leading-none tracking-tight tabular-nums ${toneStyles.value}`}>{value}</div>
      {hint ? <div className="mt-1.5 text-[0.82rem] text-parchment-300/60">{hint}</div> : null}
    </Card>
  );
}

/* ───────────────────────────── ריק / טעינה ───────────────────────────── */

/**
 * מצב ריק — "מדף שמחכה".
 * מקבל שם אייקון מהמערכת (IconName) או תו בודד; הכל באותה מסגרת חרוטה.
 */
export function EmptyState({
  title,
  description,
  action,
  icon = "film",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: IconName | "";
}) {
  return (
    <div className="card-surface chamfer relative mx-auto flex max-w-2xl flex-col items-center justify-center gap-3 px-6 py-14 text-center animate-ink-in">
      <span aria-hidden="true" className="pointer-events-none absolute inset-[6px] border border-brass-400/10" />
      <span className="flex size-16 items-center justify-center border border-brass-400/30 bg-brass-400/[0.06] text-brass-300 chamfer" aria-hidden="true">
        <Icon name={(icon || "film") as IconName} className="size-7" />
      </span>
      <h3 className="font-display text-xl font-bold text-parchment-50">{title}</h3>
      {description ? <p className="max-w-md text-sm leading-relaxed text-parchment-200/75">{description}</p> : null}
      {action}
    </div>
  );
}

export function SkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className="skeleton aspect-[2/3] w-40 shrink-0 chamfer" style={{ animationDelay: `${index * 80}ms` }} />
      ))}
    </div>
  );
}

export function Alert({ tone = "info", children, className = "" }: { tone?: "info" | "warn" | "danger" | "success"; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-brass-400/30 bg-brass-400/[0.07] text-parchment-200",
    warn: "border-brass-500/45 bg-brass-500/12 text-brass-200",
    danger: "border-oxblood-500/55 bg-oxblood-600/20 text-parchment-100",
    success: "border-verdigris-400/45 bg-verdigris-500/12 text-verdigris-300",
  } as const;
  const icons = { info: "info", warn: "warn", danger: "warn", success: "check" } as const;
  return (
    <div className={`flex items-start gap-2.5 border px-4 py-3 text-sm leading-relaxed chamfer animate-ink-in ${tones[tone]} ${className}`}>
      <Icon name={icons[tone]} className="mt-0.5 size-4 shrink-0 opacity-85" />
      <span>{children}</span>
    </div>
  );
}

/** טבלת ניהול — כותרת דביקה, ריחוף ברור, מסגרת פליז דקה */
export function DataTable({ head, children, className = "" }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={`panel-ink overflow-x-auto border border-brass-400/18 chamfer ${className}`}>
      <table className="admin-table">
        <thead className="sticky top-0 z-10 bg-obsidian-850/95 font-mono text-[0.72rem] uppercase tracking-[0.14em] text-brass-300/80 backdrop-blur">
          <tr>
            {head.map((cell, index) => (
              <th key={index} className="whitespace-nowrap px-4 py-3 text-right font-bold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brass-400/10 [&>tr]:transition-colors [&>tr:hover]:bg-brass-400/[0.04]">{children}</tbody>
      </table>
    </div>
  );
}
