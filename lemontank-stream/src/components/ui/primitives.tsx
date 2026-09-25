import React from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   רכיבי UI משותפים — אתר + פאנל ניהול
   שפה עיצובית אחת: זכוכית כהה, פינות מעוגלות, זוהר לימוני, מעברים חלקים.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────── כפתורים ────────────────────────────────── */

type ButtonVariant = "primary" | "ghost" | "outline" | "danger" | "plus" | "subtle";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-lemon-300 to-lemon-400 text-ink-950 font-extrabold hover:brightness-105 shadow-[0_10px_34px_-12px_rgba(247,194,43,0.75)] hover:shadow-[0_16px_40px_-12px_rgba(247,194,43,0.85)]",
  plus:
    "bg-gradient-to-l from-plus-500 to-plus-600 text-white font-extrabold hover:brightness-110 shadow-[0_10px_30px_-12px_rgba(139,92,246,0.9)]",
  ghost: "bg-white/[0.08] text-white hover:bg-white/[0.14] border border-white/15 backdrop-blur-md",
  outline: "bg-transparent text-white border border-white/25 hover:bg-white/10 hover:border-white/40",
  danger: "bg-red-600/90 text-white hover:bg-red-500 font-bold shadow-[0_10px_30px_-14px_rgba(239,68,68,0.9)]",
  subtle: "bg-transparent text-ink-300 hover:text-white hover:bg-white/[0.06]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 rounded-lg gap-1.5",
  md: "text-sm px-4 py-2.5 rounded-xl gap-2",
  lg: "text-base px-6.5 py-3.5 rounded-2xl gap-2.5",
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
      className={`inline-flex select-none items-center justify-center whitespace-nowrap transition-all duration-300 [transition-timing-function:var(--ease-cinema)] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97] ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
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
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink-200">
        {label} {required ? <span className="text-lemon-400">*</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-400">{hint}</p> : null}
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-white/10 bg-ink-900/70 px-3.5 py-2.5 text-sm text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] placeholder:text-ink-500 transition-all duration-200 focus:border-lemon-400/70 focus:bg-ink-900 focus:shadow-[0_0_0_4px_rgba(247,194,43,0.12)] disabled:opacity-60";

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
    <select {...rest} className={`${inputBase} appearance-none bg-[length:12px] pl-8 ${className}`}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={`inline-flex cursor-pointer select-none items-center gap-2 text-sm text-ink-200 ${className}`}>
      <input type="checkbox" {...rest} className="h-4 w-4 rounded border-white/20 bg-ink-900 accent-lemon-400" />
      <span>{label}</span>
    </label>
  );
}

/** מתג הפעלה/כיבוי — לפאנל הניהול */
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
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-3.5 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{label}</div>
        {description ? <div className="mt-0.5 text-xs leading-relaxed text-ink-400">{description}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-all duration-300 ${
          checked ? "border-lemon-400/60 bg-lemon-400 shadow-[0_0_18px_-4px_rgba(247,194,43,0.9)]" : "border-white/10 bg-ink-700"
        } disabled:opacity-50`}
      >
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all duration-300 [transition-timing-function:var(--ease-cinema)] ${
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
    neutral: "bg-white/[0.08] text-ink-200 border-white/12",
    plus: "bg-plus-500/20 text-plus-300 border-plus-500/45",
    free: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
    success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/35",
    danger: "bg-red-500/15 text-red-300 border-red-500/35",
    info: "bg-sky-500/15 text-sky-300 border-sky-500/35",
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function PlanBadge({ plan, className = "" }: { plan: string; className?: string }) {
  return plan === "plus" ? (
    <span className={`badge-plus inline-flex items-center gap-1 ${className}`}>⭐ פלוס</span>
  ) : (
    <span className={`badge-free inline-flex items-center gap-1 ${className}`}>חינם</span>
  );
}

/* ─────────────────────────────── כרטיסים ──────────────────────────────── */

export function Card({ children, className = "", as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: React.ElementType }) {
  return <Tag className={`card-surface rounded-[18px] ${className}`}>{children}</Tag>;
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
        <h2 className="section-heading">
          <span className="section-heading-bar" aria-hidden="true" />
          {icon}
          {children}
        </h2>
        {subtitle ? <p className="mt-1.5 text-sm text-ink-400">{subtitle}</p> : null}
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
    neutral: { value: "text-white", tile: "bg-white/[0.06] text-ink-200" },
    plus: { value: "text-plus-300", tile: "bg-plus-500/15 text-plus-300" },
    warn: { value: "text-amber-300", tile: "bg-amber-500/15 text-amber-300" },
    danger: { value: "text-red-300", tile: "bg-red-500/15 text-red-300" },
    success: { value: "text-emerald-300", tile: "bg-emerald-500/15 text-emerald-300" },
  };
  const c = tones[tone];
  return (
    <Card className="group relative overflow-hidden p-4 transition-colors duration-300 hover:border-white/15">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-ink-300">{label}</span>
        {icon ? (
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm transition-transform duration-300 group-hover:scale-105 ${c.tile}`} aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <div className={`mt-2.5 text-[26px] font-black leading-none tracking-tight ${c.value}`}>{value}</div>
      {hint ? <div className="mt-1.5 text-[11px] text-ink-400">{hint}</div> : null}
    </Card>
  );
}

/* ───────────────────────────── ריק / טעינה ───────────────────────────── */

export function EmptyState({ title, description, action, icon = "🎬" }: { title: string; description?: string; action?: React.ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-white/12 bg-white/[0.02] px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-3xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-lg font-black">{title}</h3>
      {description ? <p className="max-w-md text-sm leading-relaxed text-ink-400">{description}</p> : null}
      {action}
    </div>
  );
}

export function SkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton aspect-[2/3] w-40 shrink-0 rounded-2xl">
          <div className="skeleton-shine" />
        </div>
      ))}
    </div>
  );
}

export function Alert({ tone = "info", children, className = "" }: { tone?: "info" | "warn" | "danger" | "success"; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "bg-sky-500/10 border-sky-500/30 text-sky-200",
    warn: "bg-amber-500/10 border-amber-500/30 text-amber-200",
    danger: "bg-red-500/10 border-red-500/30 text-red-200",
    success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-200",
  } as const;
  return <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]} ${className}`}>{children}</div>;
}

/** טבלת ניהול — כותרת דביקה, ריחוף ברור, מסגרת מעודנת */
export function DataTable({ head, children, className = "" }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-2xl border border-white/8 panel-ink ${className}`}>
      <table className="admin-table">
        <thead className="sticky top-0 z-10 bg-ink-850/95 text-[11px] uppercase tracking-wide text-ink-300 backdrop-blur">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 text-right font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06] [&>tr]:transition-colors [&>tr:hover]:bg-white/[0.035]">{children}</tbody>
      </table>
    </div>
  );
}
