import React from "react";

/* ────────────────────────────── כפתורים ────────────────────────────────── */

type ButtonVariant = "primary" | "ghost" | "outline" | "danger" | "plus" | "subtle";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-lemon-400 text-ink-900 hover:bg-lemon-300 font-bold shadow-[0_8px_30px_-10px_rgba(245,179,1,0.6)]",
  plus: "bg-gradient-to-l from-plus-500 to-plus-600 text-white hover:brightness-110 font-bold",
  ghost: "bg-white/10 text-white hover:bg-white/20 border border-white/10",
  outline: "bg-transparent text-white border border-white/25 hover:bg-white/10",
  danger: "bg-red-600/90 text-white hover:bg-red-500 font-semibold",
  subtle: "bg-transparent text-ink-300 hover:text-white hover:bg-white/5",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 rounded-lg gap-1.5",
  md: "text-sm px-4 py-2.5 rounded-xl gap-2",
  lg: "text-base px-6 py-3.5 rounded-2xl gap-2.5",
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
      className={`inline-flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-200">
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
  "w-full rounded-xl bg-ink-900/80 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-ink-400 transition-colors focus:border-lemon-400/70 focus:bg-ink-900 disabled:opacity-60";

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
    <label className={`inline-flex items-center gap-2 text-sm text-ink-200 cursor-pointer select-none ${className}`}>
      <input type="checkbox" {...rest} className="h-4 w-4 rounded border-white/20 bg-ink-900 text-lemon-400 accent-lemon-400" />
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
    <div className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">{label}</div>
        {description ? <div className="text-xs text-ink-400 mt-0.5">{description}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-lemon-400" : "bg-ink-600"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "right-0.5" : "right-5.5"}`} style={{ insetInlineStart: checked ? "1.375rem" : "0.125rem" }} />
      </button>
    </div>
  );
}

/* ─────────────────────────────── תגיות ────────────────────────────────── */

export function Badge({ children, tone = "neutral", className = "" }: { children: React.ReactNode; tone?: "neutral" | "plus" | "free" | "warn" | "danger" | "success" | "info"; className?: string }) {
  const tones: Record<string, string> = {
    neutral: "bg-white/10 text-ink-200 border-white/10",
    plus: "bg-plus-500/20 text-plus-400 border-plus-500/40",
    free: "bg-emerald-500/15 text-emerald-400 border-emerald-500/35",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/35",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/35",
    danger: "bg-red-500/15 text-red-400 border-red-500/35",
    info: "bg-sky-500/15 text-sky-300 border-sky-500/35",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}>
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
  return <Tag className={`card-surface rounded-2xl ${className}`}>{children}</Tag>;
}

export function SectionTitle({
  children,
  action,
  icon,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="text-lg md:text-2xl font-extrabold flex items-center gap-2">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "neutral", icon }: { label: string; value: React.ReactNode; hint?: string; tone?: "neutral" | "warn" | "danger" | "success"; icon?: React.ReactNode }) {
  const colors: Record<string, string> = {
    neutral: "text-white",
    warn: "text-amber-300",
    danger: "text-red-400",
    success: "text-emerald-400",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-300">{label}</span>
        {icon}
      </div>
      <div className={`mt-2 text-2xl font-extrabold ${colors[tone]}`}>{value}</div>
      {hint ? <div className="text-[11px] text-ink-400 mt-1">{hint}</div> : null}
    </Card>
  );
}

/* ───────────────────────────── ריק / טעינה ───────────────────────────── */

export function EmptyState({ title, description, action, icon = "🎬" }: { title: string; description?: string; action?: React.ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
      <div className="text-4xl" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      {description ? <p className="max-w-md text-sm text-ink-400">{description}</p> : null}
      {action}
    </div>
  );
}

export function SkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton h-64 w-44 shrink-0 rounded-xl">
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
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]} ${className}`}>{children}</div>;
}

/** טבלת ניהול עם עיצוב אחיד */
export function DataTable({ head, children, className = "" }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-white/10 ${className}`}>
      <table className="admin-table">
        <thead className="bg-white/[0.04] text-ink-300">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}
