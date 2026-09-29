import { ShelfLoading } from "@/components/ui/states";

/** טעינה באזור הניהול — אותו ארכיון, מדפים צפופים יותר */
export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="skeleton h-3 w-28 chamfer-sm" />
        <div className="skeleton h-8 w-64 max-w-full chamfer-sm" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="skeleton relative h-24 chamfer reveal-item"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className="skeleton-shine" />
          </div>
        ))}
      </div>

      <div className="card-surface chamfer p-5">
        <div className="skeleton mb-4 h-5 w-40 chamfer-sm" />
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="skeleton h-9 w-full chamfer-sm reveal-item"
              style={{ animationDelay: `${200 + i * 60}ms` }}
            />
          ))}
        </div>
      </div>

      <p className="text-center font-mono text-[0.72rem] uppercase tracking-[0.24em] text-brass-300/70">
        <span className="animate-lamp">פותחים את המשרד</span>
      </p>
    </div>
  );
}
