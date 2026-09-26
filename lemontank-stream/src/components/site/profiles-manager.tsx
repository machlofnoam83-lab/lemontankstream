"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Button, Card, Checkbox, Field, Input, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Profile = {
  id: number;
  name: string;
  avatar_url: string | null;
  color: string;
  is_kid: number;
  maturity_limit: string;
  lang_audio: string;
  lang_subs: string;
  has_pin: number;
};

const COLORS = ["#f5b301", "#8b5cf6", "#4ade80", "#38bdf8", "#fb7185", "#f97316", "#a78bfa", "#22d3ee"];
const AVATARS = ["🦁", "🐼", "🐧", "🦊", "🐨", "🐸", "🦉", "🐙", "🦄", "🐳", "🚀", "⭐"];

/** ניהול פרופילים — יצירה, עריכה, PIN ופרופיל ילדים */
export function ProfilesManager({ initialProfiles, maxProfiles, isPlus }: { initialProfiles: Profile[]; maxProfiles: number; isPlus: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [avatar, setAvatar] = useState("");
  const [isKid, setIsKid] = useState(false);
  const [maturity, setMaturity] = useState("18+");
  const [pin, setPin] = useState("");
  const [langAudio, setLangAudio] = useState("he");
  const [langSubs, setLangSubs] = useState("he");

  const resetForm = (p?: Profile) => {
    setEditing(p ?? null);
    setName(p?.name ?? "");
    setColor(p?.color ?? COLORS[0]);
    setAvatar(p?.avatar_url ?? "");
    setIsKid(Boolean(p?.is_kid));
    setMaturity(p?.maturity_limit ?? "18+");
    setPin("");
    setLangAudio(p?.lang_audio ?? "he");
    setLangSubs(p?.lang_subs ?? "he");
    setOpen(true);
  };

  const save = async () => {
    if (name.trim().length < 1) {
      toast.push("צריך שם לפרופיל", "error");
      return;
    }
    setLoading(true);

    const body = {
      id: editing?.id,
      name: name.trim(),
      color,
      avatar_url: avatar || null,
      is_kid: isKid,
      maturity_limit: maturity,
      lang_audio: langAudio,
      lang_subs: langSubs,
      ...(pin ? { pin } : {}),
    };

    const res = editing
      ? await apiCall("/api/profiles", { method: "PATCH", body })
      : await apiCall("/api/profiles", { method: "POST", body });
    setLoading(false);

    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push(editing ? "הפרופיל עודכן" : "הפרופיל נוצר", "success");
    setOpen(false);
    router.refresh();
    const fresh = await apiCall<{ items: Profile[] }>("/api/profiles");
    if (fresh.ok) setProfiles(fresh.data.items);
  };

  const remove = async (id: number) => {
    const res = await apiCall("/api/profiles", { method: "DELETE", body: { id } });
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    toast.push("הפרופיל נמחק", "info");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-400">
          {profiles.length} מתוך {maxProfiles} פרופילים
          {!isPlus ? <span className="ms-2 text-plus-400">· שדרג לפלוס ל-5 פרופילים</span> : null}
        </p>
        <Button onClick={() => resetForm()} disabled={profiles.length >= maxProfiles}>
          + פרופיל חדש
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl" style={{ background: `${p.color}33`, color: p.color }}>
                {p.avatar_url || p.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-bold">{p.name}</div>
                <div className="text-[0.85rem] text-ink-400">
                  {p.is_kid ? `🧸 פרופיל ילדים · עד ${p.maturity_limit}` : `גיל מותר: ${p.maturity_limit}`}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.has_pin ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.8rem]">🔒 PIN</span> : null}
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.8rem]">אודיו: {p.lang_audio}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.8rem]">כתוביות: {p.lang_subs}</span>
                </div>
              </div>
            </div>
            <div className="mt-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => resetForm(p)}>עריכה</Button>
              <Button size="sm" variant="danger" onClick={() => remove(p.id)} disabled={profiles.length <= 1}>
                מחיקה
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `עריכת הפרופיל "${editing.name}"` : "פרופיל חדש"}
        footer={
          <>
            <Button variant="subtle" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={save} loading={loading}>{editing ? "שמור שינויים" : "צור פרופיל"}</Button>
          </>
        }
      >
        <Field label="שם הפרופיל" required htmlFor="pname">
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="לדוגמה: דנה" />
        </Field>

        <div>
          <span className="block text-sm font-medium text-ink-200">צבע הפרופיל</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`צבע ${c}`}
                aria-pressed={color === c}
                className={`h-8 w-8 rounded-full ring-2 transition ${color === c ? "ring-white" : "ring-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium text-ink-200">אווטאר (אופציונלי)</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(avatar === a ? "" : a)}
                aria-pressed={avatar === a}
                className={`h-9 w-9 rounded-xl text-lg transition ${avatar === a ? "bg-lemon-400/25 ring-1 ring-lemon-400" : "bg-white/5 hover:bg-white/10"}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <Checkbox label="🧸 פרופיל ילדים (מוגבל לתכנים לילדים)" checked={isKid} onChange={(e) => { setIsKid(e.target.checked); if (e.target.checked) setMaturity("7+"); }} />

        <Field label="הגבלת גיל" htmlFor="maturity">
          <Select id="maturity" value={maturity} onChange={(e) => setMaturity(e.target.value)} disabled={isKid}>
            {["7+", "12+", "16+", "18+"].map((m) => (
              <option key={m} value={m}>{m} ומעלה</option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="שפת אודיו מועדפת" htmlFor="audio">
            <Select id="audio" value={langAudio} onChange={(e) => setLangAudio(e.target.value)}>
              <option value="he">עברית</option>
              <option value="en">אנגלית</option>
              <option value="ru">רוסית</option>
              <option value="ar">ערבית</option>
            </Select>
          </Field>
          <Field label="שפת כתוביות" htmlFor="subs">
            <Select id="subs" value={langSubs} onChange={(e) => setLangSubs(e.target.value)}>
              <option value="he">עברית</option>
              <option value="en">אנגלית</option>
              <option value="ru">רוסית</option>
              <option value="ar">ערבית</option>
              <option value="off">כבוי</option>
            </Select>
          </Field>
        </div>

        <Field label="קוד PIN (4 ספרות, אופציונלי)" htmlFor="pin" hint="מגן על הפרופיל מפני מעבר של ילדים">
          <Input id="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" dir="ltr" placeholder="0000" />
        </Field>
      </Modal>
    </div>
  );
}
