"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui/primitives";
import { apiCall } from "@/lib/client/api";

export type PickerProfile = {
  id: number;
  name: string;
  avatar_url: string | null;
  color: string;
  is_kid: number;
  maturity_limit: string;
  has_pin: number;
};

/**
 * מסך "מי צופה?" — כמו בטלוויזיה חכמה.
 *
 * אם הפרופיל נעול ב-PIN (או שיוצאים מפרופיל ילדים) — נפתחת בקשת קוד.
 * הקוד נבדק **בשרת**; כאן רק אוספים אותו ומציגים שגיאה יפה.
 */
export function ProfilePicker({
  profiles,
  activeId,
  exitLocked = false,
  compact = false,
}: {
  profiles: PickerProfile[];
  activeId: number | null;
  /** האם יציאה מהפרופיל הנוכחי דורשת קוד */
  exitLocked?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [pinFor, setPinFor] = useState<PickerProfile | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const doSwitch = async (profile: PickerProfile, withPin?: string) => {
    setBusy(profile.id);
    setError("");
    const res = await apiCall<{ profile: PickerProfile }>("/api/profiles/switch", {
      method: "POST",
      body: { id: profile.id, pin: withPin },
    });
    setBusy(null);

    if (!res.ok) {
      if (res.error.code === "PIN_REQUIRED" || res.error.code === "PIN_INVALID") {
        setPinFor(profile);
        setError(res.error.code === "PIN_INVALID" ? "קוד שגוי — נסה שוב" : "");
        return;
      }
      setError(res.error.message);
      return;
    }
    setPinFor(null);
    setPin("");
    router.refresh();
    if (!compact) router.push("/");
  };

  const onPick = (profile: PickerProfile) => {
    if (profile.id === activeId) return;
    // הפרופיל נעול, או שאנחנו בפרופיל ילדים ויוצאים ממנו → מבקשים קוד
    if (profile.has_pin || exitLocked) {
      setPinFor(profile);
      setError("");
      return;
    }
    void doSwitch(profile);
  };

  const submitPin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!pinFor || pin.length !== 4) return;
    void doSwitch(pinFor, pin);
  };

  return (
    <div className={compact ? "flex flex-wrap gap-2" : "flex flex-wrap justify-center gap-4"}>
      {profiles.map((profile) => {
        const isActive = profile.id === activeId;
        return (
          <button
            key={profile.id}
            type="button"
            onClick={() => onPick(profile)}
            disabled={busy !== null}
            className={`group flex flex-col items-center gap-2 rounded-2xl p-3 transition ${
              isActive ? "bg-white/10 ring-2 ring-lemon-400" : "hover:bg-white/[0.07]"
            }`}
          >
            <span
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-ink-950 md:h-20 md:w-20 md:text-3xl"
              style={{ background: profile.color || "#f7c22b" }}
            >
              {busy === profile.id ? <Spinner /> : profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="h-full w-full rounded-2xl object-cover" />
              ) : (
                profile.name.charAt(0)
              )}
            </span>
            <span className="text-[0.95rem] font-bold">{profile.name}</span>
            <span className="flex items-center gap-1 text-[0.8rem] text-ink-400">
              {profile.is_kid ? "🧒 ילדים" : "👤 רגיל"}
              {profile.has_pin ? <span title="מוגן בקוד">🔒</span> : null}
              {isActive ? <span className="text-lemon-300">· פעיל</span> : null}
            </span>
          </button>
        );
      })}

      {pinFor && (
        <form
          onSubmit={submitPin}
          className="w-full rounded-2xl border border-lemon-400/30 bg-ink-900/80 p-4 text-center"
        >
          <div className="font-bold">🔒 הקוד של {pinFor.name}</div>
          <p className="mt-1 text-[0.85rem] text-ink-400">הזן קוד בן 4 ספרות כדי לעבור</p>
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoFocus
            dir="ltr"
            className="mt-3 w-32 rounded-xl border border-white/20 bg-black/50 px-3 py-2 text-center font-mono text-2xl tracking-[0.4em]"
            aria-label="קוד פרופיל"
          />
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button type="submit" disabled={pin.length !== 4 || busy !== null}>
              כניסה
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPinFor(null);
                setPin("");
                setError("");
              }}
            >
              ביטול
            </Button>
          </div>
          {error && <p className="mt-2 text-[0.9rem] text-red-300">{error}</p>}
        </form>
      )}

      {!pinFor && error && <p className="w-full text-center text-[0.9rem] text-red-300">{error}</p>}
    </div>
  );
}
