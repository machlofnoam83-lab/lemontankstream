"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  plan_code: string;
  created_at: string;
  last_login_at: string | null;
  email_verified: number;
  twofa_enabled: number;
  active_sessions?: number;
  watched_items?: number;
  notes?: string | null;
};

/** עריכת משתמש: תפקיד, סטטוס, מנוי (חינם/פלוס) וניתוק סשנים */
export function UserEditorButton({ user, actorRole }: { user: AdminUser; actorRole: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [plan, setPlan] = useState(user.plan_code);
  const [planDays, setPlanDays] = useState("30");
  const [notes, setNotes] = useState(user.notes ?? "");
  const [maxProfiles, setMaxProfiles] = useState("2");

  const save = async () => {
    setBusy(true);
    setError(null);

    const body: Record<string, unknown> = { name, status, plan_code: plan, notes: notes || null, max_profiles: Number(maxProfiles) };
    if (actorRole === "owner" && role !== user.role) body.role = role;
    if (plan === "plus" && planDays) body.plan_until = new Date(Date.now() + Number(planDays) * 86_400_000).toISOString();

    const res = await apiCall(`/api/users/${user.id}`, { method: "PATCH", body });
    setBusy(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.push("המשתמש עודכן ✓", "success");
    setOpen(false);
    router.refresh();
  };

  const revokeSessions = async () => {
    setBusy(true);
    const res = await apiCall(`/api/users/${user.id}`, { method: "PATCH", body: { revoke_sessions: true } });
    setBusy(false);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push("כל המכשירים המחוברים של המשתמש נותקו", "success");
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>עריכה</Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`עריכת ${user.email}`}
        size="lg"
        footer={
          <>
            <Button variant="subtle" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={save} loading={busy}>שמור</Button>
          </>
        }
      >
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="שם" htmlFor="u-name">
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>

          <Field label="מסלול מנוי" htmlFor="u-plan" hint="שינוי לפלוס יוצר/מאריך מנוי פעיל">
            <Select id="u-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="free">🆓 חינם</option>
              <option value="plus">⭐ פלוס</option>
            </Select>
          </Field>

          {plan === "plus" ? (
            <Field label="תוקף המנוי בימים" htmlFor="u-days">
              <Input id="u-days" type="number" value={planDays} onChange={(e) => setPlanDays(e.target.value)} min={1} max={3650} />
            </Field>
          ) : null}

          <Field label="סטטוס חשבון" htmlFor="u-status">
            <Select id="u-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">פעיל</option>
              <option value="suspended">מושהה (מנותק מהמערכת)</option>
              <option value="banned">חסום</option>
              <option value="pending">ממתין לאימות</option>
            </Select>
          </Field>

          <Field label="תפקיד" htmlFor="u-role" hint={actorRole === "owner" ? "שינוי תפקיד נרשם ביומן הביקורת" : "רק בעלים יכול לשנות תפקידים"}>
            <Select id="u-role" value={role} onChange={(e) => setRole(e.target.value)} disabled={actorRole !== "owner"}>
              <option value="user">צופה</option>
              <option value="editor">עורך תוכן</option>
              <option value="admin">מנהל</option>
              <option value="owner">בעלים</option>
            </Select>
          </Field>

          <Field label="מקסימום פרופילים" htmlFor="u-profiles">
            <Input id="u-profiles" type="number" value={maxProfiles} onChange={(e) => setMaxProfiles(e.target.value)} min={1} max={10} />
          </Field>
        </div>

        <Field label="הערות פנימיות" htmlFor="u-notes">
          <Textarea id="u-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-ink-400">
          <p>סשנים פעילים: <b className="text-ink-200">{user.active_sessions ?? 0}</b> · תוכן שנצפה: {user.watched_items ?? 0} · 2FA: {user.twofa_enabled ? "מופעל" : "כבוי"}</p>
          <Button size="sm" variant="subtle" className="mt-2" onClick={revokeSessions} loading={busy}>נתק את כל המכשירים</Button>
        </div>
      </Modal>
    </>
  );
}
