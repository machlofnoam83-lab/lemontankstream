"use client";

import { useEffect, useRef, useState } from "react";
import { apiCall } from "@/lib/client/api";

type Verdict = {
  ok: boolean;
  score: number;
  level: string;
  problems: string[];
  suggestions: string[];
  breach: { mode: string; pwned: boolean | null; count: number };
};

/**
 * מדד חוזק סיסמה — חי, מול השרת.
 *
 * למה לא לחשב בדפדפן? כי הבדיקה האמיתית כוללת דליפות מידע מוכרות,
 * וזה משהו שרק השרת (עם רשימה מקומית + HIBP) יכול לדעת. הסיסמה נשלחת
 * לבדיקה ונזרקת — היא לא נשמרת ולא נרשמת בשום מקום.
 *
 * הבקשה מושהית (debounce) כדי לא להציף: בדיקה אחת אחרי 400ms מהקלדה.
 */
export function PasswordMeter({
  password,
  email,
  name,
  onVerdict,
}: {
  password: string;
  email?: string;
  name?: string;
  onVerdict?: (ok: boolean) => void;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!password) {
      setVerdict(null);
      onVerdict?.(false);
      return;
    }

    timer.current = setTimeout(async () => {
      const ticket = ++sequence.current;
      setChecking(true);
      const res = await apiCall<Verdict>("/api/auth/password-check", {
        method: "POST",
        body: { password, email: email || undefined, name: name || undefined },
      });
      if (ticket !== sequence.current) return; // תשובה מיושנת — מתעלמים
      setChecking(false);
      if (res.ok) {
        setVerdict(res.data);
        onVerdict?.(res.data.ok);
      }
    }, 400);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, email, name]);

  if (!password) return null;

  const score = verdict?.score ?? 0;
  const steps = Math.max(1, Math.round(score / 20));
  const color =
    score < 25 ? "bg-red-500" : score < 45 ? "bg-orange-500" : score < 70 ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < steps ? color : "bg-white/10"}`} />
        ))}
      </div>
      <p className="text-[0.85rem] text-ink-400">
        חוזק סיסמה:{" "}
        <span className="font-bold text-ink-200">{verdict ? verdict.level : checking ? "בודק…" : "—"}</span>
        {verdict?.breach.pwned ? <span className="mr-2 text-red-400">· נמצאה בהדלפת מידע!</span> : null}
        {verdict?.breach.pwned === false && verdict.breach.mode !== "off" ? (
          <span className="mr-2 text-emerald-400">· לא נמצאה בהדלפות ידועות</span>
        ) : null}
      </p>
      {verdict?.problems.length ? (
        <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-300">
          {verdict.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {verdict && !verdict.problems.length && verdict.suggestions.length ? (
        <p className="text-xs text-ink-500">💡 {verdict.suggestions[0]}</p>
      ) : null}
    </div>
  );
}
