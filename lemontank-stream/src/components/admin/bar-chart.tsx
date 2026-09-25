import { formatNumber } from "@/lib/format";

export type Bar = { label: string; value: number; sub?: string };

/**
 * גרף עמודות CSS טהור (בלי ספריות ובלי JavaScript בצד הלקוח) —
 * נטען עם ה-HTML ולכן מהיר ובטוח ל-CSP.
 */
export function BarChart({
  data,
  height = 120,
  tone = "lemon",
  valueLabel = (v: number) => formatNumber(v),
}: {
  data: Bar[];
  height?: number;
  tone?: "lemon" | "plus" | "emerald";
  valueLabel?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const colors: Record<string, string> = {
    lemon: "bg-lemon-400",
    plus: "bg-plus-400",
    emerald: "bg-emerald-400",
  };

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label={`גרף: ${data.length} נקודות`}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="group flex h-full flex-1 flex-col items-center justify-end">
            <span className="mb-1 hidden text-[0.8rem] text-ink-300 group-hover:block">{valueLabel(d.value)}</span>
            <div
              className={`w-full rounded-t-md ${colors[tone]} transition-all group-hover:opacity-80`}
              style={{ height: `${Math.max(d.value > 0 ? 4 : 0, (d.value / max) * 100)}%` }}
              title={`${d.label}: ${valueLabel(d.value)}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {data.map((d, i) => (
          <span key={`l-${d.label}-${i}`} className="flex-1 truncate text-center text-[0.75rem] text-ink-500">{d.label}</span>
        ))}
      </div>
      {data[0]?.sub ? <p className="mt-2 text-[0.85rem] text-ink-400">{data[0].sub}</p> : null}
    </div>
  );
}
