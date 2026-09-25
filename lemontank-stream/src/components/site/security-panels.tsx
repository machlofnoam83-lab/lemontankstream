"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Alert, Button, Card, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatRelative } from "@/lib/format";

type Session = {
  id: string;
  ip: string | null;
  user_agent: string | null;
  device_label: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
};

/** פאנלים לניהול אבטחת החשבון: סיסמה, 2FA, מכשירים */
export function SecurityPanels({
  twoFactorEnabled,
  emailVerified,
  backupCodesLeft,
  passwordChangedAt,
  sessions,
  recentAuthEvents,
}: {
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  backupCodesLeft: number;
  passwordChangedAt: string | null;
  sessions: Session[];
  recentAuthEvents: number;
}) {
  const router = useRouter();
  const toast = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [tfaLoading, setTfaLoading] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);

    if (next !== confirm) {
      setPwError("הסיסמאות החדשות אינן זהות");
      return;
    }

    setPwLoading(true);
    const res = await apiCall<{ message: string }>("/api/auth/password", {
      method: "POST",
      body: { action: "change", current, password: next },
    });
    setPwLoading(false);

    if (!res.ok) {
      setPwError(res.error.message);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.push("הסיסמה עודכנה וכל המכשירים נותקו — התחבר מחדש", "success");
    router.push("/login");
  };

  const startTwoFactor = async () => {
    setTfaLoading(true);
    const res = await apiCall<{ secret: string; otpauth: string }>("/api/auth/2fa", { method: "POST", body: { action: "setup" } });
    setTfaLoading(false);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    setSetup(res.data);
  };

  const enableTwoFactor = async () => {
    setTfaLoading(true);
    const res = await apiCall<{ backupCodes: string[] }>("/api/auth/2fa", { method: "POST", body: { action: "enable", code } });
    setTfaLoading(false);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    setBackupCodes(res.data.backupCodes);
    setSetup(null);
    setCode("");
    toast.push("2FA הופעל! שמור את קודי הגיבוי 🎉", "success");
    router.refresh();
  };

  const disableTwoFactor = async () => {
    setTfaLoading(true);
    const res = await apiCall("/api/auth/2fa", { method: "POST", body: { action: "disable", code } });
    setTfaLoading(false);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    setCode("");
    toast.push("2FA כובה", "info");
    router.refresh();
  };

  const revokeSession = async (id: string) => {
    const res = await apiCall("/api/auth/sessions", { method: "DELETE", body: { id } });
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push("המכשיר נותק", "success");
    router.refresh();
  };

  const revokeAll = async () => {
    const res = await apiCall("/api/auth/sessions", { method: "DELETE", body: { all: true } });
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push("כל המכשירים האחרים נותקו", "success");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* ── סיסמה ── */}
      <Card className="p-5">
        <h2 className="text-sm font-bold">🔑 החלפת סיסמה</h2>
        <p className="mt-1 text-xs text-ink-400">
          {passwordChangedAt ? `הסיסמה שונתה לאחרונה ${formatRelative(passwordChangedAt)}.` : "מומלץ להחליף סיסמה אחת לכמה חודשים."}
        </p>
        <form onSubmit={changePassword} className="mt-4 grid gap-3 md:grid-cols-3">
          {pwError ? <div className="md:col-span-3"><Alert tone="danger">{pwError}</Alert></div> : null}
          <Field label="סיסמה נוכחית" required htmlFor="cur">
            <Input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} dir="ltr" autoComplete="current-password" required />
          </Field>
          <Field label="סיסמה חדשה" required htmlFor="new">
            <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} dir="ltr" autoComplete="new-password" required minLength={10} />
          </Field>
          <Field label="אימות" required htmlFor="conf">
            <Input id="conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" autoComplete="new-password" required />
          </Field>
          <div className="md:col-span-3">
            <Button type="submit" loading={pwLoading}>עדכן סיסמה</Button>
          </div>
        </form>
      </Card>

      {/* ── 2FA ── */}
      <Card className={`p-5 ${twoFactorEnabled ? "border-emerald-500/25" : "border-amber-500/25"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">📱 אימות דו-שלבי (2FA)</h2>
            <p className="mt-1 max-w-2xl text-xs text-ink-400">
              שכבת הגנה שנייה עם אפליקציית Authenticator. מומלץ בחום — במיוחד לחשבונות מנהל.
            </p>
          </div>
          <span className={twoFactorEnabled ? "badge-free" : "rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[0.85rem] font-bold text-amber-300"}>
            {twoFactorEnabled ? "פעיל ✓" : "לא פעיל"}
          </span>
        </div>

        {backupCodes ? (
          <Alert tone="warn" className="mt-4">
            <p className="font-bold">קודי גיבוי חד-פעמיים — שמור אותם במקום בטוח:</p>
            <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-4" dir="ltr">
              {backupCodes.map((c) => (
                <span key={c} className="rounded bg-black/30 px-2 py-1">{c}</span>
              ))}
            </div>
          </Alert>
        ) : null}

        {twoFactorEnabled ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-ink-400">קודי גיבוי שנותרו: <b>{backupCodesLeft}</b></p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="קוד מהאפליקציה לכיבוי" htmlFor="tfa-off">
                <Input id="tfa-off" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} dir="ltr" placeholder="000000" inputMode="numeric" />
              </Field>
              <Button variant="danger" onClick={disableTwoFactor} loading={tfaLoading}>כבה 2FA</Button>
              <Button variant="ghost" onClick={async () => {
                const res = await apiCall<{ backupCodes: string[] }>("/api/auth/2fa", { method: "POST", body: { action: "backup_codes" } });
                if (res.ok) setBackupCodes(res.data.backupCodes);
              }}>חדש קודי גיבוי</Button>
            </div>
          </div>
        ) : setup ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-ink-300">
              1. סרוק את הקוד באפליקציית Google Authenticator / Authy. 2. הזן את הקוד בן 6 הספרות לאימות.
            </p>
            <div className="rounded-xl bg-white p-3">
              {/* QR נוצר כקישור otpauth — אפשר גם להעתיק את המפתח */}
              <div className="break-all font-mono text-[0.85rem] text-black" dir="ltr">{setup.otpauth}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <span className="text-[0.8rem] text-ink-400">מפתח סודי (הקלד ידנית):</span>
              <div className="font-mono text-sm tracking-widest" dir="ltr">{setup.secret.match(/.{1,4}/g)?.join(" ")}</div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="קוד אימות" htmlFor="tfa-on">
                <Input id="tfa-on" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} dir="ltr" placeholder="000000" inputMode="numeric" />
              </Field>
              <Button onClick={enableTwoFactor} loading={tfaLoading}>אמת והפעל</Button>
              <Button variant="subtle" onClick={() => setSetup(null)}>ביטול</Button>
            </div>
          </div>
        ) : (
          <Button className="mt-4" onClick={startTwoFactor} loading={tfaLoading}>הפעל אימות דו-שלבי</Button>
        )}
      </Card>

      {/* ── מכשירים ── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold">💻 מכשירים מחוברים ({sessions.length})</h2>
          {sessions.length > 1 ? (
            <Button size="sm" variant="ghost" onClick={revokeAll}>נתק את כל שאר המכשירים</Button>
          ) : null}
        </div>
        <ul className="mt-3 divide-y divide-white/5">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{s.device_label ?? "מכשיר לא מזוהה"}</div>
                <div className="text-[0.85rem] text-ink-400">
                  IP: <span className="font-mono" dir="ltr">{s.ip ?? "—"}</span> · נראה לאחרונה {formatRelative(s.last_seen_at)}
                </div>
                <div className="max-w-lg truncate text-[0.8rem] text-ink-500" dir="ltr">{s.user_agent ?? ""}</div>
              </div>
              <Button size="sm" variant="danger" onClick={() => revokeSession(s.id)}>נתק</Button>
            </li>
          ))}
        </ul>
      </Card>

      {/* ── מידע אבטחה ── */}
      <Card className="p-5">
        <h2 className="text-sm font-bold">📊 מצב אבטחה</h2>
        <ul className="mt-3 space-y-2 text-xs">
          <li className="flex items-center justify-between">
            <span className="text-ink-400">אימות דו-שלבי</span>
            <span className={twoFactorEnabled ? "text-emerald-400" : "text-amber-300"}>{twoFactorEnabled ? "✓ מופעל" : "מומלץ להפעיל"}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-ink-400">אימות כתובת אימייל</span>
            <span className={emailVerified ? "text-emerald-400" : "text-ink-300"}>{emailVerified ? "✓ מאומת" : "לא מאומת"}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-ink-400">אירועי התחברות ב-30 יום</span>
            <span className="text-ink-200">{recentAuthEvents}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-ink-400">הצפנת סיסמה</span>
            <span className="text-emerald-400">scrypt (N=32768) ✓</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
