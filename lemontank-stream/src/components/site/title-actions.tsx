"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";

/** לייק / דיסלייק — נשמר בטבלת watchlist עם kind ייעודי */
export function LikeButtons({ titleId, initialLike = false, initialDislike = false }: { titleId: number; initialLike?: boolean; initialDislike?: boolean }) {
  const [like, setLike] = useState(initialLike);
  const [dislike, setDislike] = useState(initialDislike);
  const toast = useToast();
  const router = useRouter();

  const send = async (kind: "like" | "dislike") => {
    const isLike = kind === "like";
    const active = isLike ? like : dislike;
    setLike(isLike ? !active : false);
    setDislike(!isLike ? !active : false);
    const res = await apiCall("/api/watchlist", { method: "POST", body: { title_id: titleId, action: active ? "remove" : "add", kind } });
    if (!res.ok) {
      setLike(initialLike);
      setDislike(initialDislike);
      toast.push(res.error.message, "error");
      if (res.error.code === "UNAUTHORIZED") router.push("/login");
    } else {
      router.refresh();
    }
  };

  return (
    <div className="inline-flex overflow-hidden rounded-xl border border-white/15">
      <button
        onClick={() => send("like")}
        aria-pressed={like}
        aria-label="אהבתי"
        className={`px-3 py-2.5 text-sm transition ${like ? "bg-emerald-500/25 text-emerald-300" : "bg-white/5 text-white hover:bg-white/15"}`}
      >
        👍 <span className="hidden sm:inline">אהבתי</span>
      </button>
      <button
        onClick={() => send("dislike")}
        aria-pressed={dislike}
        aria-label="לא אהבתי"
        className={`border-r border-white/15 px-3 py-2.5 text-sm transition ${dislike ? "bg-red-500/25 text-red-300" : "bg-white/5 text-white hover:bg-white/15"}`}
      >
        👎
      </button>
    </div>
  );
}

/** הערכת כוכבים 1–10 */
export function StarRating({ titleId, initial }: { titleId: number; initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial ?? null);
  const [hover, setHover] = useState<number | null>(null);
  const toast = useToast();

  const set = async (stars: number) => {
    setValue(stars);
    const res = await apiCall("/api/ratings", { method: "POST", body: { title_id: titleId, stars } });
    if (!res.ok) toast.push(res.error.message, "error");
    else toast.push(`דירגת ${stars}/10 ⭐`, "success");
  };

  const shown = hover ?? value ?? 0;

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="דירוג הכותר">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} מתוך 10`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          onClick={() => set(n)}
          className={`text-lg leading-none transition ${n <= shown ? "text-lemon-400" : "text-ink-600 hover:text-lemon-600"}`}
        >
          ★
        </button>
      ))}
      {value ? <span className="ms-2 text-xs text-ink-300">{value}/10</span> : null}
    </div>
  );
}

/** שיתוף: Web Share API עם נפילה ל-copy link */
export function ShareButton({ title, slug }: { title: string; slug: string }) {
  const toast = useToast();
  const url = typeof window !== "undefined" ? `${window.location.origin}/title/${slug}` : `/title/${slug}`;

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `צפו ב-${title} ב-LemonTank Stream`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.push("הקישור הועתק ללוח ✓", "success");
    } catch {
      toast.push("השיתוף בוטל", "info");
    }
  };

  return (
    <button onClick={share} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/15" aria-label="שיתוף">
      🔗 <span className="hidden sm:inline">שיתוף</span>
    </button>
  );
}

/** הורדה — זמין למנויי פלוס בלבד (הגם בצד השרת) */
export function DownloadButton({ titleId, episodeId, allowed }: { titleId: number; episodeId?: number | null; allowed: boolean }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const start = async () => {
    if (!allowed) {
      toast.push("הורדות זמינות למנויי פלוס בלבד ⭐", "info");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ url: string }>("/api/downloads", { method: "POST", body: { title_id: titleId, episode_id: episodeId ?? null } });
    setBusy(false);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    window.location.href = res.data.url;
  };

  return (
    <button
      onClick={start}
      disabled={busy}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
        allowed ? "border-white/15 bg-white/5 hover:bg-white/15" : "border-white/10 bg-white/[0.03] text-ink-300"
      } disabled:opacity-50`}
      aria-label="הורדה לצפייה אופליין"
    >
      ⬇️ <span className="hidden sm:inline">{allowed ? "הורדה" : "הורדה (פלוס)"}</span>
    </button>
  );
}
