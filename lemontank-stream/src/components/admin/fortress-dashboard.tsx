"use client";

import { useEffect, useState } from "react";
import { Card, Spinner } from "@/components/ui/primitives";
import { apiCall } from "@/lib/client/api";

type FortressReport = {
  generatedAt: string;
  sessions: { active: number; risky: number; staffWithoutBinding: number; unbounded: number };
  staff: { total: number; with2fa: number; missing2fa: string[] };
  anomalies: { kind: string; severity: string; title: string; detail: string }[];
  allowlist: { enabled: boolean; entries: number };
  criticalActions: number;
  migrations: number;
};

type ChainReport = { ok: boolean; checked: number; broken: { id: number; seq: number | null; reason: string }[]; legacyRows: number; head: { seq: number; entryHash: string | null } };

export type FortressData = {
  report: FortressReport;
  auditChain: ChainReport;
  allowlist: string[];
  criticalActions: string[];
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  info: "border-white/12 bg-white/[0.05] text-ink-200",
};

/**
 * דשבורד "המבצר" — תמונת מצב אבטחה בזמן אמת, בקרת שלמות יומן הביקורת,
 * ורשימת היתר לכתובות הניהול (עם אימות מחדש לפני שינוי).
 */
export function FortressDashboard({ initial, canManage }: { initial: FortressData; canManage: boolean }) {
  const [data, setData] = useState(initial);
  const [addresses, setAddresses] = useState(initial.allowlist.join("\n"));
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [stepUpFor, setStepUpFor] = useState<null | (() => Promise<void>)>(null);
  const [password, setPassword] = useState("");
  const [stepError, setStepError] = useState("");

  const refresh = async () => {
    const res = await apiCall<FortressData>("/api/admin/fortress");
    if (res.ok) {
      setData(res.data);
      setAddresses(res.data.allowlist.join("\n"));
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /** הרצת פעולה רגישה — עם בקשת אימות מחדש אם צריך */
  const runCritical = async (action: () => Promise<void>) => {
    const probe = await apiCall("/api/security/step-up");
    if (probe.ok && (probe.data as { active?: boolean })?.active) {
      await action();
      return;
    }
    setStepUpFor(() => action);
  };

  const confirmStepUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStepError("");
    const res = await apiCall("/api/security/step-up", { method: "POST", body: { password, action: "security.settings_update" } });
    setBusy(false);
    if (!res.ok) {
      setStepError(res.error.message);
      return;
    }
    setPassword("");
    const action = stepUpFor;
    setStepUpFor(null);
    if (action) await action();
  };

  const saveAllowlist = async () => {
    setBusy(true);
    setStatus("");
    const list = addresses.split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean);
    const res = await apiCall<{ allowlist: string[]; active: boolean }>("/api/admin/fortress", {
      method: "PATCH",
      body: { allowlist: list },
    });
    setBusy(false);
    if (!res.ok) {
      setStatus(res.error.message);
      return;
    }
    setStatus(res.data.active ? `רשימת ההיתר עודכנה (${res.data.allowlist.length} כתובות) — מכאן רק הן ייכנסו לניהול.` : "רשימת ההיתר רוקנה — הניהול פתוח לכל כתובת שמנהל מתחבר ממנה.");
    await refresh();
  };

  const { report, auditChain } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">סשנים פעילים</div>
          <div className="mt-1 text-2xl font-black">{report.sessions.active}</div>
          <div className="mt-1 text-[0.82rem] text-ink-500">
            בסיכון: {report.sessions.risky} · בלי קישור מכשיר: {report.sessions.unbounded}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">סגל עם 2FA</div>
          <div className="mt-1 text-2xl font-black">
            {report.staff.with2fa}/{report.staff.total}
          </div>
          {report.staff.missing2fa.length > 0 ? (
            <div className="mt-1 truncate text-[0.82rem] text-amber-300" title={report.staff.missing2fa.join(", ")}>
              חסר: {report.staff.missing2fa.join(", ")}
            </div>
          ) : (
            <div className="mt-1 text-[0.82rem] text-emerald-300">כל הסגל מוגן ✓</div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">שלמות יומן הביקורת</div>
          <div className={`mt-1 text-2xl font-black ${auditChain.ok ? "text-emerald-300" : "text-red-300"}`}>
            {auditChain.ok ? "תקין ✓" : "נשבר!"}
          </div>
          <div className="mt-1 text-[0.82rem] text-ink-500">
            {auditChain.checked} רשומות משורשרות · {auditChain.legacyRows} ותיקות
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.85rem] text-ink-400">פעולות ב-re-auth</div>
          <div className="mt-1 text-2xl font-black">{report.criticalActions}</div>
          <div className="mt-1 text-[0.82rem] text-ink-500">דורשות אימות סיסמה בחלון קצר</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">🚨 חריגות שזוהו</h2>
          <button type="button" onClick={() => void refresh()} className="rounded-lg bg-white/[0.07] px-3 py-1.5 text-[0.85rem] hover:bg-white/[0.12]">
            רענון
          </button>
        </div>
        {report.anomalies.length === 0 ? (
          <p className="mt-2 text-emerald-300">לא זוהו חריגות ב-24 השעות האחרונות.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {report.anomalies.map((anomaly) => (
              <li key={anomaly.kind} className={`rounded-xl border p-3 ${SEVERITY_STYLE[anomaly.severity] ?? SEVERITY_STYLE.info}`}>
                <div className="font-bold">{anomaly.title}</div>
                <div className="text-[0.9rem]">{anomaly.detail}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-bold">⛓️ שרשרת יומן הביקורת</h2>
        <p className="mt-1 text-[0.9rem] text-ink-300">
          כל רשומה נושאת את ה-Hash של קודמתה. אם מישהו מוחק או משנה רשומה בדיעבד — השרשרת נשברת וזה מתגלה כאן.
        </p>
        <div className="mt-3 rounded-xl bg-black/40 p-3 font-mono text-[0.8rem] text-ink-300">
          <div>ראש השרשרת: #{auditChain.head.seq}</div>
          <div className="truncate">חתימה: {auditChain.head.entryHash ?? "—"}</div>
        </div>
        {!auditChain.ok && (
          <ul className="mt-3 space-y-1 text-[0.88rem] text-red-200">
            {auditChain.broken.slice(0, 10).map((entry) => (
              <li key={`${entry.id}-${entry.reason}`}>
                רשומה #{entry.id} (seq {entry.seq}): {entry.reason}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-bold">📍 רשימת היתר לאזור הניהול</h2>
        <p className="mt-1 text-[0.9rem] text-ink-300">
          רשימה ריקה = הניהול פתוח לכל כתובת (עדיין דורש מנהל מאומת ב-2FA). אפשר להזין כתובות או טווחי CIDR,
          אחת בכל שורה. שינוי הרשימה דורש אימות סיסמה מחדש.
        </p>
        <textarea
          value={addresses}
          onChange={(event) => setAddresses(event.target.value)}
          rows={4}
          dir="ltr"
          placeholder={"203.0.113.7\n10.0.0.0/8"}
          className="mt-3 w-full rounded-xl border border-white/15 bg-black/40 p-3 font-mono text-[0.85rem]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canManage || busy}
            onClick={() => void runCritical(saveAllowlist)}
            className="rounded-xl bg-lemon-400 px-4 py-2 font-bold text-ink-950 disabled:opacity-50"
          >
            {busy ? <Spinner /> : "שמור רשימת היתר"}
          </button>
          <span className="text-[0.85rem] text-ink-400">
            מצב נוכחי: {report.allowlist.enabled ? `${report.allowlist.entries} כתובות מורשות` : "פתוח"}
          </span>
        </div>
        {!canManage && <p className="mt-2 text-[0.85rem] text-amber-300">רק בעל המערכת יכול לשנות את הרשימה.</p>}
        {status && <p className="mt-2 text-[0.9rem] text-lemon-300">{status}</p>}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-bold">🔒 פעולות הדורשות אימות מחדש</h2>
        <p className="mt-1 text-[0.9rem] text-ink-300">
          גם אם עוגיית ההתחברות נגנבה — בלי הסיסמה התוקף לא יוכל לבצע את הפעולות האלה:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.criticalActions.map((action) => (
            <code key={action} className="rounded-lg bg-white/[0.07] px-2 py-1 text-[0.8rem]">
              {action}
            </code>
          ))}
        </div>
      </Card>

      {stepUpFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={confirmStepUp} className="w-full max-w-sm rounded-2xl border border-white/12 bg-ink-900 p-5">
            <h3 className="text-lg font-black">אימות מחדש נדרש</h3>
            <p className="mt-1 text-[0.9rem] text-ink-300">פעולה רגישה — הזן את הסיסמה שלך כדי לאשר.</p>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              className="mt-3 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
              placeholder="סיסמה"
            />
            {stepError && <p className="mt-2 text-[0.88rem] text-red-300">{stepError}</p>}
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-lemon-400 py-2 font-bold text-ink-950 disabled:opacity-60">
                {busy ? <Spinner /> : "אשר"}
              </button>
              <button type="button" onClick={() => { setStepUpFor(null); setPassword(""); }} className="rounded-xl bg-white/[0.07] px-4 py-2">
                ביטול
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
