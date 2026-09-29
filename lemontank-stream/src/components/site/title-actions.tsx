"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import { deviceFingerprint, deviceLabel } from "@/lib/client/device";
import { Icon } from "@/components/ui/icons";

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
    <div className="inline-flex overflow-hidden border border-brass-400/22 chamfer">
      <button
        onClick={() => send("like")}
        aria-pressed={like}
        aria-label="אהבתי"
        className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm transition ${
          like ? "bg-verdigris-500/20 text-verdigris-300" : "bg-obsidian-900/50 text-parchment-200 hover:bg-brass-400/10"
        }`}
      >
        <Icon name="heart" className="size-4" />
        <span className="hidden sm:inline">אהבתי</span>
      </button>
      <button
        onClick={() => send("dislike")}
        aria-pressed={dislike}
        aria-label="לא אהבתי"
        className={`inline-flex items-center gap-1.5 border-r border-brass-400/20 px-3 py-2.5 text-sm transition ${
          dislike ? "bg-ember-500/20 text-ember-300" : "bg-obsidian-900/50 text-parchment-200 hover:bg-brass-400/10"
        }`}
      >
        <Icon name="close" className="size-4" />
        <span className="hidden sm:inline">לא אהבתי</span>
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
    else toast.push(`דירגת ${stars}/10`, "success");
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
          className={`leading-none transition-transform duration-300 [transition-timing-function:var(--ease-ink)] ${
            n <= shown ? "scale-110 text-brass-300" : "scale-100 text-obsidian-600 hover:text-brass-500"
          }`}
        >
          <Icon name="star" className="size-5" strokeWidth={n <= shown ? 2 : 1.2} />
        </button>
      ))}
      {value ? <span className="ms-2 font-mono text-xs text-parchment-300/70 tabular-nums">{value}/10</span> : null}
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
      toast.push("הקישור הועתק ללוח", "success");
    } catch {
      toast.push("השיתוף בוטל", "info");
    }
  };

  return (
    <button
      onClick={share}
      className="inline-flex items-center gap-2 border border-brass-400/22 bg-obsidian-900/50 px-3 py-2.5 text-sm text-parchment-200 chamfer transition hover:border-brass-300/60 hover:text-parchment-50"
      aria-label="שיתוף"
    >
      <Icon name="feather" className="size-4" />
      <span className="hidden sm:inline">שיתוף</span>
    </button>
  );
}

/**
 * הורדה — נבדקת גם בשרת (מסלול, סימון הכותר, ותוקף הטוקן).
 * הטוקן נשמר במרכז ההורדות; אין קישור קבוע שאפשר להעביר הלאה לנצח.
 */
export function DownloadButton({ titleId, episodeId, allowed }: { titleId: number; episodeId?: number | null; allowed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const toast = useToast();

  const start = async () => {
    if (!allowed) {
      toast.push("הורדות זמינות למנויי פלוס בלבד", "info");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ download: { quality: string }; note: string }>("/api/downloads", {
      method: "POST",
      body: {
        title_id: titleId,
        episode_id: episodeId ?? null,
        quality: "1080p",
        device_fingerprint: deviceFingerprint(),
        device_label: deviceLabel(),
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    setSaved(true);
    toast.push(`נשמר בהורדות · ${res.data.download.quality}`, "success");
  };

  return (
    <button
      onClick={start}
      disabled={busy || saved}
      className={`chamfer inline-flex items-center gap-2 border px-3 py-2.5 text-sm transition ${
        allowed
          ? "border-brass-400/22 bg-obsidian-900/50 text-parchment-200 hover:border-brass-300/60 hover:text-parchment-50"
          : "border-brass-400/12 bg-obsidian-900/30 text-parchment-300/50"
      } disabled:opacity-60`}
      aria-label="הורדה לצפייה אופליין"
    >
      <Icon name={saved ? "check" : "download"} className="size-4" />
      <span className="hidden sm:inline">{saved ? "נשמר" : allowed ? "הורדה" : "הורדה (פלוס)"}</span>
    </button>
  );
}
