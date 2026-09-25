"use client";

import { useRef, useState } from "react";
import { uploadWithProgress, apiCall } from "@/lib/client/api";
import { Alert, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatBytes } from "@/lib/format";

type Kind = "image" | "video" | "subtitle" | "trailer";

/**
 * מעלה קבצי מדיה לשרת עם פס התקדמות, בדיקות צד-לקוח ורישום הנכס ב-DB.
 * הבדיקה האמיתית (magic bytes, גודל, סוג) מתבצעת בשרת — כאן רק חוויית משתמש.
 */
export function MediaUploader({
  kind,
  titleId,
  episodeId,
  attach,
  label,
  accept,
  hint,
  onUploaded,
  currentUrl,
}: {
  kind: Kind;
  titleId?: number;
  episodeId?: number | null;
  attach?: "poster" | "backdrop" | "trailer" | "thumb" | "video";
  label: string;
  accept: string;
  hint?: string;
  onUploaded?: (result: { id: number; url: string }) => void;
  currentUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(currentUrl ?? null);
  const toast = useToast();

  const pick = () => inputRef.current?.click();

  const upload = async (file: File) => {
    setError(null);
    setProgress(0);

    const extra: Record<string, string> = { kind };
    if (titleId) extra.title_id = String(titleId);
    if (episodeId) extra.episode_id = String(episodeId);
    if (attach) extra.attach = attach;

    const res = await uploadWithProgress<{ asset: { id: number; url: string; bytes: number; mime: string } }>(
      "/api/upload",
      file,
      extra,
      (p) => setProgress(p),
    );

    setProgress(null);

    if (!res.ok) {
      setError(res.error.message);
      toast.push(res.error.message, "error");
      return;
    }

    setUrl(res.data.asset.url);
    toast.push(`הקובץ הועלה בהצלחה (${formatBytes(res.data.asset.bytes)}) ✓`, "success");
    onUploaded?.({ id: res.data.asset.id, url: res.data.asset.url });
  };

  const attachByUrl = async () => {
    const pasted = prompt("הדבק כתובת URL של הקובץ (S3 / CDN / קישור חיצוני):", url ?? "");
    if (!pasted) return;
    if (!/^https?:\/\//.test(pasted) && !pasted.startsWith("/api/media/")) {
      setError("כתובת חייבת להתחיל ב-http/https");
      return;
    }
    setUrl(pasted);

    if (titleId && attach) {
      const res = await apiCall(`/api/titles/${titleId}`, {
        method: "PATCH",
        body: attach === "poster" ? { poster_url: pasted } : attach === "backdrop" ? { backdrop_url: pasted } : { trailer_url: pasted },
      });
      if (!res.ok) setError(res.error.message);
    }
    if (episodeId && (attach === "thumb" || attach === "video")) {
      const res = await apiCall(`/api/episodes/${episodeId}`, {
        method: "PATCH",
        body: attach === "thumb" ? { thumb_url: pasted } : { video_url: pasted },
      });
      if (!res.ok) setError(res.error.message);
    }
    onUploaded?.({ id: 0, url: pasted });
    toast.push("הקישור נשמר", "success");
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-200">{label}</span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={pick} loading={progress !== null} type="button">
            {progress !== null ? `${progress}%` : "העלה קובץ"}
          </Button>
          <Button size="sm" variant="subtle" onClick={attachByUrl} type="button">קישור</Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />

      {hint ? <p className="mt-1 text-[11px] text-ink-400">{hint}</p> : null}

      {progress !== null ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-lemon-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {error ? <div className="mt-2"><Alert tone="danger">{error}</Alert></div> : null}

      {url ? (
        <div className="mt-2 flex items-center gap-2">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="תצוגה מקדימה" className="h-20 w-auto rounded-lg object-cover ring-1 ring-white/10" />
          ) : (
            <span className="truncate rounded-lg bg-black/30 px-2 py-1 font-mono text-[10px] text-ink-300" dir="ltr">{url}</span>
          )}
          <button
            type="button"
            onClick={() => { setUrl(null); onUploaded?.({ id: 0, url: "" }); }}
            className="text-[11px] text-red-300 hover:underline"
          >
            הסר
          </button>
        </div>
      ) : null}
    </div>
  );
}
