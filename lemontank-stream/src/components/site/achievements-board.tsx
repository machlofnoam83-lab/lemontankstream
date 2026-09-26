"use client";

import { useEffect, useState } from "react";
import { Card, Spinner } from "@/components/ui/primitives";

type Badge = {
  code: string;
  name: string;
  icon: string;
  points: number;
  tier: "bronze" | "silver" | "gold" | "legend";
  description: string;
  criterion: { label: string; progress: number; target: number };
  percent: number;
  earned: boolean;
  earned_at: string | null;
};

const TIER_STYLE: Record<Badge["tier"], { ring: string; chip: string; label: string }> = {
  bronze: { ring: "border-orange-400/40 bg-orange-500/10", chip: "text-orange-300", label: "ארד" },
  silver: { ring: "border-slate-300/40 bg-slate-300/10", chip: "text-slate-200", label: "כסף" },
  gold: { ring: "border-lemon-400/50 bg-lemon-400/10", chip: "text-lemon-300", label: "זהב" },
  legend: { ring: "border-plus-400/60 bg-plus-500/15", chip: "text-plus-300", label: "אגדה" },
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) : "";

/**
 * לוח ההישגים — טוען מהשרת (שם נעשה החישוב האמיתי) ומציג התקדמות חיה.
 * כל תג שלא הושג מציג בדיוק מה חסר — זה מה שמוביל לפעולה הבאה.
 */
export function AchievementsBoard({ initial }: { initial?: { earnedCount: number; totalCount: number; points: number } }) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [meta, setMeta] = useState({ points: initial?.points ?? 0, streak: 0, rank: null as number | null, earnedCount: initial?.earnedCount ?? 0, totalCount: initial?.totalCount ?? 0 });
  const [newly, setNewly] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "earned" | "locked">("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/achievements", { cache: "no-store" });
        const body = await res.json();
        if (!alive || !body?.ok) return;
        setBadges(body.data.badges);
        setMeta({
          points: body.data.points,
          streak: body.data.streak,
          rank: body.data.rank,
          earnedCount: body.data.earnedCount,
          totalCount: body.data.totalCount,
        });
        setNewly(body.data.newlyEarned ?? []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-8 text-ink-300">
        <Spinner /> טוען את ההישגים…
      </div>
    );
  }

  const percent = meta.totalCount ? Math.round((meta.earnedCount / meta.totalCount) * 100) : 0;
  const shown = badges.filter((b) => (filter === "earned" ? b.earned : filter === "locked" ? !b.earned : true));
  const nextBadge = badges.filter((b) => !b.earned).sort((a, b) => b.percent - a.percent)[0];

  return (
    <div className="space-y-6">
      {newly.length > 0 && (
        <div className="card-surface flex items-center gap-3 rounded-2xl border-lemon-400/40 p-4">
          <span className="text-2xl">🎉</span>
          <div>
            <div className="font-black text-lemon-300">הרווחת {newly.length} תגים חדשים!</div>
            <div className="text-[0.85rem] text-ink-300">
              {newly.map((code) => badges.find((b) => b.code === code)?.name ?? code).join(" · ")}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">נקודות</div>
          <div className="mt-1 text-3xl font-black text-gradient">{meta.points.toLocaleString("he-IL")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">תגים</div>
          <div className="mt-1 text-3xl font-black">
            {meta.earnedCount}
            <span className="text-lg text-ink-400"> / {meta.totalCount}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-l from-lemon-300 to-lemon-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">רצף צפייה</div>
          <div className="mt-1 text-3xl font-black">
            🔥 {meta.streak}
            <span className="text-lg text-ink-400"> ימים</span>
          </div>
          {meta.rank && <div className="mt-1 text-[0.85rem] text-ink-400">מקום {meta.rank} בטבלה</div>}
        </Card>
      </div>

      {nextBadge && (
        <Card className="border-lemon-400/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.85rem] text-ink-400">הצעד הבא שלך</div>
              <div className="text-lg font-bold">
                {nextBadge.icon} {nextBadge.name}
              </div>
              <div className="text-[0.85rem] text-ink-300">{nextBadge.criterion.label}</div>
            </div>
            <div className="text-left">
              <div className="text-2xl font-black text-lemon-300">
                {nextBadge.criterion.progress}/{nextBadge.criterion.target}
              </div>
              <div className="text-[0.85rem] text-ink-400">+{nextBadge.points} נקודות</div>
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-l from-lemon-300 to-lemon-500" style={{ width: `${nextBadge.percent}%` }} />
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {([
          ["all", `הכול (${badges.length})`],
          ["earned", `הושגו (${meta.earnedCount})`],
          ["locked", `בדרך (${meta.totalCount - meta.earnedCount})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-xl px-3.5 py-2 text-[0.95rem] font-bold transition ${
              filter === key ? "bg-lemon-400 text-ink-950" : "bg-white/[0.07] text-ink-200 hover:bg-white/[0.12]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((badge) => {
          const style = TIER_STYLE[badge.tier];
          return (
            <div
              key={badge.code}
              className={`card-surface rounded-2xl border p-4 transition ${badge.earned ? style.ring : "border-white/10 opacity-80"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${badge.earned ? "bg-white/10" : "bg-white/[0.04] grayscale"}`}>
                    {badge.icon}
                  </span>
                  <div>
                    <div className="font-black">{badge.name}</div>
                    <div className={`text-[0.8rem] ${style.chip}`}>{style.label} · {badge.points} נקודות</div>
                  </div>
                </div>
                {badge.earned && <span className="text-xl text-free-400">✓</span>}
              </div>
              <p className="mt-3 text-[0.9rem] text-ink-300">{badge.description}</p>

              {badge.earned ? (
                <div className="mt-3 text-[0.8rem] text-ink-400">הושג ב-{fmt(badge.earned_at)}</div>
              ) : (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[0.8rem] text-ink-400">
                    <span>{badge.criterion.label}</span>
                    <span>
                      {badge.criterion.progress}/{badge.criterion.target}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-l from-lemon-300/80 to-lemon-500/80" style={{ width: `${badge.percent}%` }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
