"use client";

import { CSRF_COOKIE } from "@/lib/cookies";

/**
 * נגן הווידאו של LemonTank — נגן מותאם אישית עם כל התכונות:
 *   ▶ ניהול מקלדת מלא (רווח, חצים, J/L, 0-9, F, M, K)
 *   ▶ שמירת התקדמות אוטומטית (כל 10 שניות + ביציאה מהדף עם sendBeacon)
 *   ▶ כתוביות מרובות שפות, בחירת איכות, מהירות נגינה, PiP, מסך מלא
 *   ▶ "דלג על פתיח" לפי סימוני פתיח שהוגדרו בפאנל
 *   ▶ חלונית "הפרק הבא" והפעלה אוטומטית
 *   ▶ מסך נעילה לתוכן פלוס (ההגנה האמיתית בשרת — הקישור לא נשלח בכלל)
 *   ▶ נגישות: כפתורים עם aria-label, כתוביות מוצהרות, מיקוד מקלדת
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { readCookie } from "@/lib/client/api";

export type PlayerSource = { label: string; src: string; type?: string };
export type PlayerSubtitle = { label: string; lang: string; src: string; isDefault?: boolean };
export type PlayerEpisode = {
  id: number;
  label: string;
  season: number;
  number: number;
  locked: boolean;
  thumb?: string | null;
};

type Props = {
  titleId: number;
  titleName: string;
  slug: string;
  episodeId?: number | null;
  sources: PlayerSource[];
  subtitles: PlayerSubtitle[];
  poster?: string | null;
  startAtSec?: number;
  locked?: boolean;
  lockReason?: string;
  introStart?: number | null;
  introEnd?: number | null;
  creditsStart?: number | null;
  nextEpisode?: PlayerEpisode | null;
  episodes?: PlayerEpisode[];
  autoplayNext?: boolean;
  preferredSubLang?: string;
  isPlus?: boolean;
};

const AUTOPLAY_OVERLAY_SEC = 25;

export function Player({
  titleId,
  titleName,
  slug,
  episodeId = null,
  sources,
  subtitles,
  poster,
  startAtSec = 0,
  locked = false,
  lockReason,
  introStart,
  introEnd,
  creditsStart,
  nextEpisode,
  episodes = [],
  autoplayNext = true,
  preferredSubLang = "he",
  isPlus = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [srcIndex, setSrcIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(startAtSec);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [subLang, setSubLang] = useState<string>(() => subtitles.find((s) => s.lang === preferredSubLang)?.lang ?? subtitles[0]?.lang ?? "off");
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState<"none" | "speed" | "quality" | "subs">("none");
  const [isFullscreen, setFullscreen] = useState(false);
  const [showNextOverlay, setShowNextOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIntroButton, setShowIntroButton] = useState(false);
  const [ready, setReady] = useState(false);

  const currentSource = sources[srcIndex] ?? sources[0];
  const activeSub = useMemo(() => subtitles.find((s) => s.lang === subLang), [subtitles, subLang]);

  /* ── שמירת התקדמות ────────────────────────────────────────────────────── */
  const saveProgress = useCallback(
    (position: number, total: number, beacon = false) => {
      if (locked || !total || position < 3) return;
      const payload = { title_id: titleId, episode_id: episodeId, position_sec: Math.floor(position), duration_sec: Math.floor(total) };
      if (beacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon("/api/progress", new Blob([JSON.stringify(payload)], { type: "application/json" }));
        return;
      }
      fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": readCookie(CSRF_COOKIE) },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => undefined);
    },
    [titleId, episodeId, locked],
  );

  const track = useCallback(
    (kind: string, meta?: Record<string, unknown>) => {
      if (locked) return;
      fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": readCookie(CSRF_COOKIE) },
        body: JSON.stringify({ kind, title_id: titleId, episode_id: episodeId, meta }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [titleId, episodeId, locked],
  );

  /* ── אתחול: דילוג לנקודת העצירה ───────────────────────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || locked) return;
    const onLoaded = () => {
      setDuration(v.duration || 0);
      setReady(true);
      if (startAtSec > 5 && startAtSec < (v.duration || Infinity) - 15) {
        v.currentTime = startAtSec;
      }
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [srcIndex, startAtSec, locked]);

  /* ── מקלדת ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable) return;
      const v = videoRef.current;
      if (!v) return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          v.paused ? void v.play() : v.pause();
          break;
        case "arrowright":
          e.preventDefault();
          v.currentTime = Math.min((v.duration || 0), v.currentTime + 5);
          break;
        case "arrowleft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case "l":
          v.currentTime = Math.min((v.duration || 0), v.currentTime + 10);
          break;
        case "j":
          v.currentTime = Math.max(0, v.currentTime - 10);
          break;
        case "m":
          v.muted = !v.muted;
          setMuted(v.muted);
          break;
        case "f":
          void toggleFullscreen();
          break;
        case "arrowup":
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.05);
          setVolume(v.volume);
          break;
        case "arrowdown":
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.05);
          setVolume(v.volume);
          break;
        case "c":
          setSubLang((prev) => (prev === "off" ? subtitles[0]?.lang ?? "off" : "off"));
          break;
        case "s":
          void togglePip();
          break;
        default:
          if (/^[0-9]$/.test(e.key) && v.duration) {
            v.currentTime = (Number(e.key) / 10) * v.duration;
          }
      }
      showControlsTemporarily();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitles]);

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      /* דפדפן לא תומך */
    }
  };

  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = document;
      if (doc.pictureInPictureElement) await doc.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* לא נתמך */
    }
  };

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setShowControls(false);
    }, 3200);
  };

  /* ── עדכוני זמן ────────────────────────────────────────────────────────── */
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));

    // כפתור "דלג על פתיח"
    if (introStart != null && introEnd != null) {
      setShowIntroButton(v.currentTime >= introStart && v.currentTime < introEnd - 3);
    }
    // חלונית הפרק הבא
    if (nextEpisode && v.duration) {
      setShowNextOverlay(v.duration - v.currentTime <= AUTOPLAY_OVERLAY_SEC);
    }
  };

  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) saveProgress(v.currentTime, v.duration || 0);
    }, 10_000);
    const onUnload = () => {
      const v = videoRef.current;
      if (v) saveProgress(v.currentTime, v.duration || 0, true);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(id);
      window.removeEventListener("beforeunload", onUnload);
      onUnload();
    };
  }, [saveProgress, locked]);

  /* ── מדיה: שינוי עוצמת קול ─────────────────────────────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      v.muted = muted;
    }
  }, [volume, muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
  }, [rate, srcIndex]);

  /* ─────────────── מסך נעילה לתוכן פלוס ────────────────────────────────── */
  if (locked) {
    return (
      <div className="player-wrap flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-ink-900 via-ink-850 to-plus-600/20 p-6 text-center">
        <div className="text-5xl" aria-hidden="true">⭐</div>
        <h2 className="text-xl font-black">התוכן הזה זמין למנויי פלוס</h2>
        <p className="max-w-md text-sm text-ink-300">{lockReason ?? "שדרגו לפלוס כדי לצפות בסרטים ובסדרות הפרימיום, באיכות 4K וללא פרסומות."}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/plans" className="rounded-xl bg-gradient-to-l from-plus-500 to-plus-600 px-6 py-3 text-sm font-black text-white">
            שדרג לפלוס — ₪19.90/חודש
          </Link>
          <Link href={`/title/${slug}`} className="rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm">
            חזרה לפרטי הסרט
          </Link>
        </div>
        <ul className="mt-2 grid gap-1 text-xs text-ink-300">
          <li>✓ איכות 4K + Dolby</li>
          <li>✓ 4 מסכים במקביל</li>
          <li>✓ הורדות לצפייה אופליין</li>
        </ul>
      </div>
    );
  }

  if (!sources.length) {
    return (
      <div className="player-wrap flex flex-col items-center justify-center gap-3 bg-ink-900 p-6 text-center">
        <div className="text-4xl" aria-hidden="true">🎬</div>
        <h2 className="text-lg font-bold">הווידאו עוד לא הועלה</h2>
        <p className="max-w-md text-sm text-ink-400">
          מנהל המערכת צריך להעלות את קובץ הווידאו (או להדביק קישור) בדף הניהול של הכותר. בינתיים אפשר להתעדכן — נוסיף התראה כשיהיה זמין.
        </p>
        <Link href={`/title/${slug}`} className="rounded-xl border border-white/20 px-4 py-2 text-sm">
          חזרה לפרטי הכותר
        </Link>
      </div>
    );
  }

  const progressPct = duration ? (current / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const remaining = Math.max(0, duration - current);
  const inCredits = creditsStart != null && current >= creditsStart;

  return (
    <div
      ref={wrapRef}
      className="player-wrap group select-none"
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => playing && setShowControls(false)}
      tabIndex={0}
      aria-label={`נגן וידאו — ${titleName}`}
    >
      <video
        ref={videoRef}
        className="h-full w-full bg-black"
        poster={poster ?? undefined}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        onClick={() => {
          const v = videoRef.current;
          if (!v) return;
          v.paused ? void v.play() : v.pause();
        }}
        onPlay={() => {
          setPlaying(true);
          track("play", { episode_id: episodeId, quality: currentSource?.label });
          showControlsTemporarily();
        }}
        onPause={() => {
          setPlaying(false);
          setShowControls(true);
          track("pause");
          const v = videoRef.current;
          if (v) saveProgress(v.currentTime, v.duration || 0);
        }}
        onTimeUpdate={onTimeUpdate}
        onProgress={onTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onEnded={() => {
          track("finish", { completed: true });
          const v = videoRef.current;
          if (v) saveProgress(v.duration, v.duration, true);
          if (autoplayNext && nextEpisode && !nextEpisode.locked) {
            window.location.href = `/watch/${slug}?ep=${nextEpisode.id}&autoplay=1`;
          } else {
            setShowNextOverlay(true);
          }
        }}
        onError={() => {
          if (srcIndex < sources.length - 1) {
            setSrcIndex((i) => i + 1); // נפילה למקור הבא (למשל איכות נמוכה יותר)
            return;
          }
          setError("לא הצלחנו לנגן את הווידאו. ייתכן שהקובץ עדיין נטען או שהפורמט לא נתמך בדפדפן.");
        }}
        onWaiting={() => setReady(false)}
        onCanPlay={() => setReady(true)}
      >
        {activeSub ? (
          <track kind="subtitles" src={activeSub.src} srcLang={activeSub.lang} label={activeSub.label} default />
        ) : null}
      </video>

      {/* שכבת טעינה */}
      {!ready && !error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-lemon-400" />
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
          <span className="text-3xl">⚠️</span>
          <p className="max-w-md text-sm text-ink-200">{error}</p>
          <button onClick={() => { setError(null); videoRef.current?.load(); }} className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">
            נסה שוב
          </button>
        </div>
      ) : null}

      {/* כפתור דלג על פתיח */}
      {showIntroButton ? (
        <button
          onClick={() => {
            const v = videoRef.current;
            if (v && introEnd) v.currentTime = introEnd;
            setShowIntroButton(false);
          }}
          className="absolute bottom-24 left-4 rounded-lg bg-white/95 px-4 py-2 text-sm font-bold text-ink-900 shadow-lg hover:bg-white"
        >
          דלג על הפתיח ⏭
        </button>
      ) : null}

      {/* חלונית הפרק הבא */}
      {showNextOverlay && nextEpisode && !inCredits ? (
        <div className="absolute bottom-24 left-4 w-64 rounded-xl border border-white/15 bg-ink-900/95 p-3 shadow-2xl backdrop-blur">
          <div className="text-[0.85rem] text-ink-300">הבא בתור</div>
          <div className="mt-1 flex items-center gap-2">
            {nextEpisode.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={nextEpisode.thumb} alt="" className="h-10 w-16 rounded object-cover" />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">{nextEpisode.label}</div>
              <div className="text-[0.8rem] text-ink-400">עונה {nextEpisode.season} · פרק {nextEpisode.number}</div>
            </div>
          </div>
          {nextEpisode.locked ? (
            <Link href="/plans" className="mt-2 block rounded-lg bg-plus-500 px-3 py-1.5 text-center text-xs font-bold">
              הפרק הבא זמין בפלוס ⭐
            </Link>
          ) : (
            <Link href={`/watch/${slug}?ep=${nextEpisode.id}`} className="mt-2 block rounded-lg bg-lemon-400 px-3 py-1.5 text-center text-xs font-bold text-ink-900">
              נגן עכשיו
            </Link>
          )}
        </div>
      ) : null}

      {/* אזור בקרה */}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 pb-2 pt-8 transition-opacity ${showControls ? "opacity-100" : "opacity-0"}`}>
        {/* פס התקדמות */}
        <div className="group/seek relative mb-2 h-1.5 w-full cursor-pointer rounded-full bg-white/25" dir="ltr">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={(e) => {
              const v = videoRef.current;
              const t = Number(e.target.value);
              if (v) v.currentTime = t;
              setCurrent(t);
            }}
            onMouseUp={() => { const v = videoRef.current; if (v) saveProgress(v.currentTime, v.duration || 0); }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="מיקום בסרטון"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration)}
            aria-valuenow={Math.floor(current)}
            aria-valuetext={`${formatDuration(current)} מתוך ${formatDuration(duration)}`}
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${bufferedPct}%` }} />
          <div className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-lemon-400" style={{ width: `${progressPct}%` }}>
            <span className="absolute -top-1 left-full h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-lemon-400 opacity-0 transition-opacity group-hover/seek:opacity-100" />
          </div>
          {introStart != null && introEnd != null && duration ? (
            <div
              className="pointer-events-none absolute inset-y-0 rounded-full bg-white/25"
              style={{ left: `${(introStart / duration) * 100}%`, width: `${((introEnd - introStart) / duration) * 100}%` }}
              title="פתיח"
            />
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-white" dir="ltr">
          <button onClick={() => { const v = videoRef.current; if (v) v.paused ? void v.play() : v.pause(); }} aria-label={playing ? "השהה" : "נגן"} className="rounded-lg p-1.5 hover:bg-white/15">
            {playing ? <IconPause /> : <IconPlay />}
          </button>

          <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.max(0, v.currentTime - 10); } }} aria-label="חזור 10 שניות" className="rounded-lg p-1.5 hover:bg-white/15">
            <IconSkipBack />
          </button>
          <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); } }} aria-label="קדם 10 שניות" className="rounded-lg p-1.5 hover:bg-white/15">
            <IconSkipFwd />
          </button>

          <div className="group/vol flex items-center gap-1">
            <button onClick={() => setMuted((m) => !m)} aria-label={muted ? "בטל השתקה" : "השתק"} className="rounded-lg p-1.5 hover:bg-white/15">
              {muted || volume === 0 ? <IconMute /> : <IconVolume />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
              className="h-1 w-0 cursor-pointer accent-lemon-400 transition-all group-hover/vol:w-20"
              aria-label="עוצמת קול"
            />
          </div>

          <span className="px-1 text-xs tabular-nums text-ink-200" dir="rtl">
            {formatDuration(current)} / {formatDuration(duration)} · נשארו {formatDuration(remaining)}
          </span>

          <div className="ms-auto flex items-center gap-1">
            {/* כתוביות */}
            {subtitles.length > 0 ? (
              <div className="relative">
                <button onClick={() => setShowSettings((s) => (s === "subs" ? "none" : "subs"))} aria-label="כתוביות" className="rounded-lg p-1.5 hover:bg-white/15">
                  <IconCaptions />
                </button>
                {showSettings === "subs" ? (
                  <Menu title="כתוביות">
                    <MenuItem active={subLang === "off"} onClick={() => { setSubLang("off"); setShowSettings("none"); }}>כבוי</MenuItem>
                    {subtitles.map((s) => (
                      <MenuItem key={s.lang} active={subLang === s.lang} onClick={() => { setSubLang(s.lang); setShowSettings("none"); }}>
                        {s.label}
                      </MenuItem>
                    ))}
                  </Menu>
                ) : null}
              </div>
            ) : null}

            {/* איכות */}
            <div className="relative">
              <button onClick={() => setShowSettings((s) => (s === "quality" ? "none" : "quality"))} aria-label="איכות" className="rounded-lg p-1.5 hover:bg-white/15">
                <IconSettings />
              </button>
              {showSettings === "quality" ? (
                <Menu title="איכות">
                  {sources.map((s, i) => (
                    <MenuItem key={s.label + i} active={i === srcIndex} onClick={() => { setSrcIndex(i); setShowSettings("none"); }}>
                      {s.label}
                    </MenuItem>
                  ))}
                  {isPlus ? null : <div className="px-3 py-1.5 text-[0.8rem] text-ink-400">איכות 4K זמינה בפלוס ⭐</div>}
                </Menu>
              ) : null}
            </div>

            {/* מהירות */}
            <div className="relative">
              <button onClick={() => setShowSettings((s) => (s === "speed" ? "none" : "speed"))} aria-label="מהירות נגינה" className="rounded-lg px-2 py-1 text-xs hover:bg-white/15">
                {rate}x
              </button>
              {showSettings === "speed" ? (
                <Menu title="מהירות">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <MenuItem key={r} active={rate === r} onClick={() => { setRate(r); setShowSettings("none"); }}>
                      {r}x
                    </MenuItem>
                  ))}
                </Menu>
              ) : null}
            </div>

            <button onClick={togglePip} aria-label="תמונה בתוך תמונה" className="rounded-lg p-1.5 hover:bg-white/15">
              <IconPip />
            </button>
            <button onClick={toggleFullscreen} aria-label={isFullscreen ? "צא ממסך מלא" : "מסך מלא"} className="rounded-lg p-1.5 hover:bg-white/15">
              {isFullscreen ? <IconCompress /> : <IconExpand />}
            </button>
          </div>
        </div>

        {/* רשימת פרקים בנגן */}
        {episodes.length > 1 ? (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1" dir="rtl">
            {episodes.map((ep) => (
              <Link
                key={ep.id}
                href={ep.locked ? "/plans" : `/watch/${slug}?ep=${ep.id}`}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                  ep.id === episodeId ? "border-lemon-400 bg-lemon-400/15 text-lemon-200" : "border-white/10 bg-black/40 text-ink-200 hover:bg-white/10"
                }`}
              >
                {ep.locked ? "⭐" : "▶"} {ep.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────────────── רכיבי עזר ─────────────────────────────── */

function Menu({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute bottom-full left-0 mb-2 w-40 overflow-hidden rounded-xl border border-white/15 bg-ink-900/97 py-1 shadow-2xl backdrop-blur">
      <div className="px-3 py-1 text-[0.8rem] font-bold text-ink-400">{title}</div>
      {children}
    </div>
  );
}

function MenuItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`block w-full px-3 py-1.5 text-right text-xs hover:bg-white/10 ${active ? "text-lemon-300" : "text-white"}`}>
      {active ? "✓ " : ""}
      {children}
    </button>
  );
}

const IconPlay = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
);
const IconPause = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
);
const IconSkipBack = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /><text x="9" y="16" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">10</text>
  </svg>
);
const IconSkipFwd = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /><text x="9" y="16" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">10</text>
  </svg>
);
const IconVolume = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);
const IconMute = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);
const IconCaptions = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h3M14 12h3" />
  </svg>
);
const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7L4 7.2a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 10a2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.6 1z" />
  </svg>
);
const IconPip = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3" y="4" width="18" height="14" rx="2" /><rect x="12" y="10" width="8" height="7" rx="1" fill="currentColor" />
  </svg>
);
const IconExpand = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />
  </svg>
);
const IconCompress = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M9 4v5H4M15 20v-5h5M15 4v5h5M9 20v-5H4" />
  </svg>
);
