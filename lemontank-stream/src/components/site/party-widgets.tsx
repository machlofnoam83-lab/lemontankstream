"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui/primitives";
import { CSRF_COOKIE } from "@/lib/cookies";
import { readCookie } from "@/lib/client/api";

const csrf = () => readCookie(CSRF_COOKIE);

/** הצטרפות לחדר — משמש במסך ההזמנה */
export function PartyJoinCard({ partyId }: { partyId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const join = async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/parties/${partyId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: "{}",
      });
      const body = await res.json();
      if (!body?.ok) {
        setError(body?.error?.message ?? "לא הצלחתי להצטרף");
        setState("error");
        return;
      }
      router.replace(`/party/${partyId}`);
      router.refresh();
    } catch {
      setError("שגיאת רשת — נסה שוב");
      setState("error");
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={join} disabled={state === "loading"} icon={state === "loading" ? <Spinner /> : "🎬"}>
        {state === "loading" ? "מצטרף…" : "הצטרף לצפייה"}
      </Button>
      {state === "error" && <p className="text-[0.9rem] text-red-300">{error}</p>}
    </div>
  );
}

/**
 * כפתור "ארח מסיבה" בדף הכותר/הנגן:
 * פותח חדר חדש ומעביר ישר לחדר — בלי טופס, בלי בחירות.
 */
export function StartPartyButton({
  titleId,
  episodeId = null,
  positionSec = 0,
  label = "ארח צפייה משותפת",
  compact = false,
}: {
  titleId: number;
  episodeId?: number | null;
  positionSec?: number;
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const start = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ title_id: titleId, episode_id: episodeId, position_sec: Math.floor(positionSec) }),
      });
      const body = await res.json();
      if (!body?.ok) {
        setError(body?.error?.message ?? "לא הצלחתי לפתוח חדר");
        setState("error");
        return;
      }
      router.push(`/party/${body.data.party.id}`);
    } catch {
      setError("שגיאת רשת");
      setState("error");
    }
  };

  return (
    <div className={compact ? "inline-flex flex-col" : "flex flex-col gap-1"}>
      <button
        type="button"
        onClick={start}
        disabled={state === "loading"}
        className="inline-flex items-center gap-2 rounded-xl border border-plus-400/40 bg-plus-500/15 px-3.5 py-2 text-[0.95rem] font-bold text-plus-200 transition hover:bg-plus-500/25 disabled:opacity-60"
      >
        {state === "loading" ? <Spinner /> : <span aria-hidden="true">🎉</span>}
        {label}
      </button>
      {state === "error" && <span className="mt-1 text-[0.8rem] text-red-300">{error}</span>}
    </div>
  );
}

/** העתקת קישור ההזמנה — כדי להזמין בקלות */
export function CopyPartyLink({ partyId }: { partyId: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? `/party/${partyId}` : `${window.location.origin}/party/${partyId}`;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }, [link]);

  return (
    <button type="button" onClick={copy} className="rounded-xl bg-white/[0.07] px-3 py-2 text-[0.9rem] hover:bg-white/[0.12]">
      {copied ? "✓ הקישור הועתק" : "העתק קישור הזמנה"}
    </button>
  );
}

/** שיתוף נייד — Web Share API כשקיים, אחרת העתקה */
export function SharePartyButton({ partyId, titleName }: { partyId: string; titleName: string }) {
  const share = async () => {
    const url = `${window.location.origin}/party/${partyId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${titleName} — צפייה משותפת`, text: "בואו נצפה יחד!", url });
        return;
      } catch {
        /* המשתמש ביטל */
      }
    }
    await navigator.clipboard.writeText(url).catch(() => undefined);
  };
  return (
    <button type="button" onClick={share} className="rounded-xl bg-white/[0.07] px-3 py-2 text-[0.9rem] hover:bg-white/[0.12]">
      שיתוף
    </button>
  );
}

/** אזהרה קטנה למי שיוצא מהחדר */
export function LeavePartyButton({ partyId }: { partyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    setBusy(true);
    await fetch(`/api/parties/${partyId}`, { method: "DELETE", headers: { "x-csrf-token": csrf() } }).catch(() => undefined);
    router.push("/account/party");
  };
  return (
    <Button variant="ghost" onClick={leave} disabled={busy}>
      {busy ? "יוצא…" : "יציאה מהחדר"}
    </Button>
  );
}

/** רשימת החדרים הפעילים שלי — נטענת מהשרת */
export function MyParties({ initial }: { initial?: { id: string; title_name: string; members: number; is_host: number }[] }) {
  const [parties, setParties] = useState(initial ?? []);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/parties", { cache: "no-store" });
        const body = await res.json();
        if (alive && body?.ok) setParties(body.data.parties);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initial]);

  if (loading) return <div className="flex items-center gap-2 p-4 text-ink-300"><Spinner /> טוען…</div>;
  if (!parties.length) return <p className="text-ink-400">אין חדרים פעילים. פתחו חדש מדף הכותר — או מהכפתור למטה.</p>;

  return (
    <ul className="space-y-2">
      {parties.map((party) => (
        <li key={party.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.05] p-3">
          <div>
            <div className="font-bold">
              {party.title_name} {party.is_host ? <span className="text-[0.8rem] text-lemon-300">(מארח)</span> : null}
            </div>
            <div className="text-[0.85rem] text-ink-400">
              קוד <span className="font-mono" dir="ltr">{party.id}</span> · {party.members} בחדר
            </div>
          </div>
          <div className="flex gap-2">
            <a href={`/party/${party.id}`} className="rounded-xl bg-lemon-400 px-3.5 py-2 text-[0.9rem] font-bold text-ink-950">
              כניסה
            </a>
            <CopyPartyLink partyId={party.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** הצטרפות לקוד חדר ידני */
export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      setError("קוד קצר מדי");
      return;
    }
    setJoining(true);
    try {
      const res = await fetch(`/api/parties/${clean}/join`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: "{}",
      });
      const body = await res.json();
      if (!body?.ok) {
        setError(body?.error?.message ?? "קוד לא נמצא");
        setJoining(false);
        return;
      }
      router.push(`/party/${clean}`);
    } catch {
      setError("שגיאת רשת");
      setJoining(false);
    }
  };

  return (
    <form onSubmit={join} className="flex flex-wrap items-center gap-2">
      <input
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        placeholder="קוד חדר"
        maxLength={8}
        dir="ltr"
        className="w-40 rounded-xl border border-white/15 bg-black/40 px-3 py-2 font-mono tracking-widest"
      />
      <Button type="submit" disabled={joining}>
        {joining ? "מצטרף…" : "הצטרף לחדר"}
      </Button>
      {error && <span className="text-[0.85rem] text-red-300">{error}</span>}
    </form>
  );
}
