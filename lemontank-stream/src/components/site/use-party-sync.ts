"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * סנכרון צפייה משותפת בתוך הנגן.
 *
 * ─ מארח ─────────────────────────────────────────────────────────────────────
 *   שולח את המיקום לשרת בכל שינוי (נגינה, השהיה, חיפוש) ובכל 5 שניות בזמן נגינה.
 *   שולחים רק כשהמיקום "זז" משמעותית — כדי לא להציף את השרת ב-4 בקשות לשנייה.
 *
 * ─ משתתף ────────────────────────────────────────────────────────────────────
 *   בודק את מצב החדר כל 3 שניות ומתיישר: אם הפער גדול מ-2.5 שניות — מזיז את
 *   הסרט; אם המארח עצר — עוצר. הפרעות קטנות לא נוגעות, כדי שהצפייה תרגיש חלקה.
 *
 * כל הכתיבה לשרת עוברת אימות (רק מארח יכול לשנות) — כאן רק UX.
 */

export type PartySyncState = {
  connected: boolean;
  isHost: boolean;
  members: { user_id: number; name: string }[];
  hostName: string;
  driftSec: number;
  error: string | null;
  leave: () => Promise<void>;
};

const SYNC_TOLERANCE_SEC = 2.5;
const POLL_MS = 3000;
const HOST_PUSH_MS = 5000;

export function usePartySync(options: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  partyId?: string | null;
  isHost?: boolean;
  enabled?: boolean;
  onDrift?: (seconds: number) => void;
}): PartySyncState {
  const { videoRef, partyId, isHost = false, enabled = true, onDrift } = options;
  const [connected, setConnected] = useState(false);
  const [members, setMembers] = useState<{ user_id: number; name: string }[]>([]);
  const [hostName, setHostName] = useState("");
  const [driftSec, setDriftSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastPush = useRef({ position: 0, playing: false, at: 0 });
  const applying = useRef(false); // כדי שהתיקון לא ייראה כמו פעולה של המשתמש

  /* ── דחיפת מצב מהמארח לשרת ───────────────────────────────────────────── */
  const push = useCallback(
    async (position: number, playing: boolean, force = false) => {
      if (!partyId || !isHost) return;
      const now = Date.now();
      const moved = Math.abs(position - lastPush.current.position) >= 1;
      const changed = playing !== lastPush.current.playing;
      if (!force && !changed && !(moved && now - lastPush.current.at > HOST_PUSH_MS)) return;
      lastPush.current = { position, playing, at: now };
      try {
        await fetch(`/api/parties/${partyId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position_sec: Math.floor(position), is_playing: playing }),
        });
      } catch {
        /* רשת נפלה — ננסה בסבב הבא */
      }
    },
    [partyId, isHost],
  );

  /* ── המארח: האזנה לאירועי הנגן ───────────────────────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !partyId || !isHost || !enabled) return;

    const onPlay = () => void push(v.currentTime, true, true);
    const onPause = () => void push(v.currentTime, false, true);
    const onSeek = () => void push(v.currentTime, !v.paused, true);
    const onTime = () => void push(v.currentTime, !v.paused);
    const timer = setInterval(() => {
      if (!v.paused) void push(v.currentTime, true, true);
    }, HOST_PUSH_MS);

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeek);
    v.addEventListener("timeupdate", onTime);
    return () => {
      clearInterval(timer);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeek);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [videoRef, partyId, isHost, enabled, push]);

  /* ── המשתתף: משיכת מצב ותיקון סחיפה ──────────────────────────────────── */
  useEffect(() => {
    if (!partyId || !enabled) return;
    let alive = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/parties/${partyId}`, { cache: "no-store" });
        const body = await res.json();
        if (!alive) return;
        if (!body?.ok) {
          setError(body?.error?.message ?? "החדר לא זמין");
          setConnected(false);
          return;
        }
        const party = body.data.party as {
          is_playing: number;
          position_sec: number;
          host_name: string;
          members: { user_id: number; name: string }[];
        };
        setConnected(true);
        setError(null);
        setHostName(party.host_name);
        setMembers(party.members.map((m) => ({ user_id: m.user_id, name: m.name })));

        const v = videoRef.current;
        if (!v || isHost) return;

        // מיקום המארח מתקדם בזמן אמת — מחשבים איפה הוא אמור להיות עכשיו
        const expected = party.position_sec + (party.is_playing ? (Date.now() - new Date().getTime()) / 1000 : 0);
        const target = party.is_playing ? Math.max(party.position_sec, expected) : party.position_sec;
        const drift = Math.abs(v.currentTime - target);
        setDriftSec(drift);
        onDrift?.(drift);

        if (drift > SYNC_TOLERANCE_SEC) {
          applying.current = true;
          v.currentTime = target;
          window.setTimeout(() => {
            applying.current = false;
          }, 600);
        }
        if (party.is_playing && v.paused) void v.play().catch(() => undefined);
        if (!party.is_playing && !v.paused) v.pause();
      } catch {
        if (alive) setConnected(false);
      }
    };

    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [partyId, enabled, isHost, videoRef, onDrift]);

  const leave = useCallback(async () => {
    if (!partyId) return;
    try {
      await fetch(`/api/parties/${partyId}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }, [partyId]);

  return { connected, isHost, members, hostName, driftSec, error, leave };
}
