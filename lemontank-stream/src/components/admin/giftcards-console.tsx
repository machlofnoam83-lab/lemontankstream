"use client";

import { useState } from "react";
import { apiCall } from "@/lib/client/api";
import { Alert, Badge, Card, Field, Input, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type Stats = {
  revenueIls: number;
  payments: number;
  cardsCreated: number;
  cardsUsed: number;
  activeSubscriptions: number;
  pendingRequests: number;
};

type CardRow = {
  id: number;
  code_prefix: string;
  kind: string;
  plan_code: string;
  months: number;
  value_ils: number;
  max_uses: number;
  used_count: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  creator: string | null;
};

type RequestRow = {
  id: number;
  user_id: number;
  email: string;
  name: string;
  code_prefix: string;
  kind: string;
  status: string;
  plan_code: string | null;
  months: number | null;
  value_ils: number | null;
  contact: string | null;
  evidence: string | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  decider: string | null;
};

type Alerts = {
  ready: boolean;
  discord: boolean;
  webhook: boolean;
  email: boolean;
  recent: { id: number; channel: string; kind: string; title: string; status: string; error: string | null; created_at: string }[];
};

export type GiftCardsData = {
  stats: Stats;
  cards: CardRow[];
  requests: RequestRow[];
  pending: RequestRow[];
  alerts: Alerts;
};

const STATUS_TONE: Record<string, "success" | "warn" | "danger" | "neutral"> = {
  active: "success",
  used: "neutral",
  expired: "warn",
  revoked: "danger",
  pending: "warn",
  approved: "success",
  rejected: "danger",
};

/**
 * קונסולת התשלומים: הנפקת כרטיסים, אישור בקשות תשלום, ומצב ערוצי ההתראות.
 *
 * כל פעולה שינויית דורשת אימות מחדש (סיסמה) — גם אם מישהו השיג סשן מנהל,
 * הוא לא ינפיק כרטיסים ולא יאשר תשלום בשם הבעלים.
 */
export function GiftCardsConsole({ initial, canManage }: { initial: GiftCardsData; canManage: boolean }) {
  const toast = useToast();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [issuedCodes, setIssuedCodes] = useState<string[]>([]);
  const [stepUpFor, setStepUpFor] = useState<null | ((password: string) => Promise<void>)>(null);
  const [password, setPassword] = useState("");
  const [stepError, setStepError] = useState("");

  const [form, setForm] = useState({ months: 1, count: 1, valueIls: 39.9, maxUses: 1, expiresInDays: 0, note: "" });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [discord, setDiscord] = useState("");
  const [email, setEmail] = useState("");

  const refresh = async () => {
    const res = await apiCall<GiftCardsData>("/api/admin/giftcards");
    if (res.ok) setData(res.data);
  };

  /** מריץ פעולה רגישה, ומבקש סיסמה אם החלון פג */
  const runCritical = async (action: () => Promise<void>) => {
    const probe = await apiCall("/api/security/step-up");
    if (probe.ok) {
      await action();
      return;
    }
    setStepError("");
    setPassword("");
    setStepUpFor(() => action);
  };

  const confirmStepUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const res = await apiCall("/api/security/step-up", { method: "POST", body: { password, action: "giftcard" } });
    setBusy(false);
    if (!res.ok) {
      setStepError(res.error.message);
      return;
    }
    const action = stepUpFor;
    setStepUpFor(null);
    setPassword("");
    if (action) await action(password);
  };

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setStatus("");
    const res = await apiCall<Record<string, unknown>>("/api/admin/giftcards", { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      setStatus(res.error.message);
      toast.push(res.error.message, "error");
      return null;
    }
    return res.data;
  };

  const createCards = () =>
    runCritical(async () => {
      const result = await post({
        action: "create",
        months: form.months,
        count: form.count,
        valueIls: form.valueIls,
        maxUses: form.maxUses,
        expiresInDays: form.expiresInDays || null,
        note: form.note || null,
      });
      if (!result) return;
      const codes = (result.codes as string[]) ?? [];
      setIssuedCodes(codes);
      setStatus(`${result.created} כרטיסים נוצרו · ${result.summary}. הקודים מוצגים למטה — שלח אותם ללקוחות.`);
      toast.push("הכרטיסים נוצרו", "success");
      await refresh();
    });

  const decide = (id: number, decision: "approve" | "reject") =>
    runCritical(async () => {
      const result = await post({ action: "decide", id, decision, note: notes[id] || null });
      if (!result) return;
      setStatus(decision === "approve" ? `בקשה #${id} אושרה — המנוי הופעל והלקוח קיבל הודעה.` : `בקשה #${id} נדחתה והלקוח עודכן.`);
      toast.push(decision === "approve" ? "התשלום אושר" : "הבקשה נדחתה", decision === "approve" ? "success" : "info");
      await refresh();
    });

  const revoke = (id: number) =>
    runCritical(async () => {
      const result = await post({ action: "revoke", id, reason: "בוטל מהמסך" });
      if (result) {
        toast.push("הכרטיס בוטל", "success");
        await refresh();
      }
    });

  const reveal = async (id: number) => {
    setBusy(true);
    const res = await apiCall<{ code: string }>("/api/admin/giftcards", { method: "POST", body: { action: "reveal", id } });
    setBusy(false);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    setIssuedCodes([res.data.code ?? ""]);
    setStatus(`הקוד של כרטיס #${id} הוצג (החשיפה נרשמה ביומן הביקורת).`);
  };

  const saveAlerts = () =>
    runCritical(async () => {
      const result = await post({ action: "settings", discord: formValue(discord), email: formValue(email) });
      if (result) {
        setStatus(result.ready ? "ערוצי ההתראות נשמרו." : "לא הוגדר עדיין שום ערוץ — התראות יישארו באתר בלבד.");
        await refresh();
      }
    });

  const formValue = (value: string) => (value.trim() ? value.trim() : undefined);

  const testAlert = () =>
    runCritical(async () => {
      const result = await post({ action: "testAlert" });
      if (result) {
        const { sent, failed, skipped } = result as { sent: string[]; failed: string[]; skipped: string[] };
        setStatus(
          sent.length
            ? `התראת בדיקה נשלחה ל: ${sent.join(", ")}${failed.length ? ` · נכשל: ${failed.join(", ")}` : ""}`
            : `לא נשלח דבר. נכשלו: ${failed.join(", ") || "—"} · לא הוגדרו: ${skipped.join(", ") || "—"}`,
        );
      }
    });

  const { stats, alerts } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "הכנסות מגיפט קארד", value: `₪${stats.revenueIls.toFixed(2)}`, hint: `${stats.payments} תשלומים` },
          { label: "כרטיסים שהונפקו", value: stats.cardsCreated, hint: `${stats.cardsUsed} נוצלו` },
          { label: "בקשות ממתינות", value: stats.pendingRequests, hint: stats.pendingRequests ? "דורש טיפול" : "הכול מטופל" },
          { label: "מנויים פעילים", value: stats.activeSubscriptions, hint: "כולל כל המקורות" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="text-[0.85rem] text-ink-400">{stat.label}</div>
            <div className="mt-1 text-2xl font-black">{stat.value}</div>
            <div className="mt-1 text-[0.82rem] text-ink-500">{stat.hint}</div>
          </Card>
        ))}
      </div>

      {status ? <Alert tone="info">{status}</Alert> : null}

      {issuedCodes.length ? (
        <Card className="p-4">
          <h2 className="text-lg font-bold">🔑 הקודים — מוצגים פעם אחת</h2>
          <p className="mt-1 text-[0.88rem] text-amber-300">
            העתק אותם עכשיו ושלח ללקוחות. אחרי שתסגור את הדף הם לא יוצגו שוב (אפשר לחשוף אותם מהרשימה — פעולה שנרשמת ביומן).
          </p>
          <div className="mt-3 space-y-1">
            {issuedCodes.map((value) => (
              <div key={value} className="flex items-center justify-between gap-3 rounded-lg bg-black/40 px-3 py-2 font-mono text-sm" dir="ltr">
                <span>{value}</span>
                <button type="button" onClick={() => void navigator.clipboard?.writeText(value)} className="text-xs text-lemon-300">
                  העתק
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-lg font-bold">🎁 הנפקת כרטיסים</h2>
        <p className="mt-1 text-[0.9rem] text-ink-300">
          צור קוד, שלח ללקוח בדיסקורד/וואטסאפ, והוא מממש אותו בעצמו ב-<code dir="ltr">/redeem</code> ומקבל מנוי מיד.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <Field label="חודשים" htmlFor="gc-months">
            <Input id="gc-months" type="number" min={1} max={36} value={form.months} onChange={(e) => setForm({ ...form, months: Number(e.target.value) })} dir="ltr" />
          </Field>
          <Field label="כמה כרטיסים" htmlFor="gc-count">
            <Input id="gc-count" type="number" min={1} max={50} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} dir="ltr" />
          </Field>
          <Field label="שווי (₪)" htmlFor="gc-value">
            <Input id="gc-value" type="number" min={0} step="0.1" value={form.valueIls} onChange={(e) => setForm({ ...form, valueIls: Number(e.target.value) })} dir="ltr" />
          </Field>
          <Field label="מקס׳ מימושים" htmlFor="gc-uses">
            <Input id="gc-uses" type="number" min={1} max={50} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} dir="ltr" />
          </Field>
          <Field label="תוקף (ימים)" htmlFor="gc-exp" hint="0 = בלי תפוגה">
            <Input id="gc-exp" type="number" min={0} value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: Number(e.target.value) })} dir="ltr" />
          </Field>
        </div>
        <Field label="הערה פנימית" htmlFor="gc-note">
          <Input id="gc-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="למשל: מכירה בדיסקורד, קמפיין 01/10" />
        </Field>
        <button
          type="button"
          disabled={busy || !canManage}
          onClick={() => void createCards()}
          className="mt-3 rounded-xl bg-lemon-400 px-4 py-2 font-bold text-ink-950 disabled:opacity-50"
        >
          {busy ? <Spinner /> : "הנפק כרטיסים"}
        </button>
        {!canManage && <p className="mt-2 text-[0.85rem] text-amber-300">נדרשת הרשאת חיוב (admin/owner).</p>}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-bold">💰 בקשות תשלום ({data.pending.length} ממתינות)</h2>
        <p className="mt-1 text-[0.9rem] text-ink-300">
          כרטיסים שנקנו מחוץ לאתר. אישור מפעיל מנוי מיידית ושולח הודעה ללקוח; דחייה שולחת הודעה מנומסת.
        </p>
        {data.pending.length === 0 ? (
          <p className="mt-3 text-sm text-ink-400">אין בקשות ממתינות.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.pending.map((request) => (
              <li key={request.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold">#{request.id}</span>
                  <span className="font-mono text-xs text-ink-400" dir="ltr">{request.code_prefix}…</span>
                  <span className="text-ink-300">{request.name} ({request.email})</span>
                  <span className="text-xs text-ink-500">{new Date(request.created_at).toLocaleString("he-IL")}</span>
                  {request.contact ? <span className="text-xs text-lemon-300">קשר: {request.contact}</span> : null}
                </div>
                {request.evidence ? <p className="mt-1 text-xs text-ink-400">ראיה: {request.evidence}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={notes[request.id] ?? ""}
                    onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })}
                    placeholder="הערה ללקוח (אופציונלי)"
                    className="min-w-[200px] flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || !canManage}
                    onClick={() => void decide(request.id, "approve")}
                    className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-sm font-bold text-ink-950 disabled:opacity-50"
                  >
                    אשר והפעל מנוי
                  </button>
                  <button
                    type="button"
                    disabled={busy || !canManage}
                    onClick={() => void decide(request.id, "reject")}
                    className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    דחה
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-bold">📣 התראות חוץ-אתריות</h2>
        <p className="mt-1 text-[0.9rem] text-ink-300">
          כאן מדביקים כתובת Webhook של דיסקורד (Server Settings → Integrations → Webhooks). מאותו רגע כל
          בקשת תשלום ואירוע אבטחה יגיעו לדיסקורד — גם אם האתר עצמו לא נגיש לך.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Discord Webhook" htmlFor="gc-discord" hint={alerts.discord ? "מוגדר ✓" : "לא מוגדר"}>
            <Input id="gc-discord" value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="https://discord.com/api/webhooks/…" dir="ltr" />
          </Field>
          <Field label="אימייל להתראות" htmlFor="gc-email" hint={alerts.email ? "SMTP מוגדר ✓" : "דורש SMTP_URL ב-.env.local"}>
            <Input id="gc-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy || !canManage} onClick={() => void saveAlerts()} className="rounded-xl bg-lemon-400 px-4 py-2 font-bold text-ink-950 disabled:opacity-50">
            שמור ערוצים
          </button>
          <button type="button" disabled={busy || !canManage} onClick={() => void testAlert()} className="rounded-xl bg-white/[0.08] px-4 py-2">
            שלח התראת בדיקה
          </button>
          <Badge tone={alerts.ready ? "success" : "warn"}>{alerts.ready ? "התראות פעילות" : "אין יעד מוגדר"}</Badge>
        </div>
        {alerts.recent.length ? (
          <ul className="mt-3 space-y-1 text-[0.82rem] text-ink-400">
            {alerts.recent.slice(0, 6).map((row) => (
              <li key={row.id} className="flex items-center gap-2">
                <Badge tone={row.status === "sent" ? "success" : row.status === "skipped" ? "neutral" : "danger"}>{row.channel}</Badge>
                <span>{row.title}</span>
                {row.error ? <span className="text-red-300" dir="ltr">{row.error.slice(0, 60)}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-bold">🧾 כרטיסים ({data.cards.length})</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-[0.82rem] text-ink-400">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">קידומת</th>
                <th className="p-2">מסלול</th>
                <th className="p-2">חודשים</th>
                <th className="p-2">שווי</th>
                <th className="p-2">מימושים</th>
                <th className="p-2">סטטוס</th>
                <th className="p-2">נוצר</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.cards.map((card) => (
                <tr key={card.id} className="border-t border-white/5">
                  <td className="p-2">{card.id}</td>
                  <td className="p-2 font-mono text-xs" dir="ltr">{card.code_prefix}</td>
                  <td className="p-2">{card.plan_code}</td>
                  <td className="p-2">{card.months}</td>
                  <td className="p-2">₪{card.value_ils.toFixed(2)}</td>
                  <td className="p-2">{card.used_count}/{card.max_uses}</td>
                  <td className="p-2">
                    <Badge tone={STATUS_TONE[card.status] ?? "neutral"}>{card.status}</Badge>
                  </td>
                  <td className="p-2 text-xs text-ink-400">{new Date(card.created_at).toLocaleDateString("he-IL")}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void reveal(card.id)} className="text-xs text-lemon-300">
                        הצג קוד
                      </button>
                      {card.status === "active" ? (
                        <button type="button" disabled={!canManage} onClick={() => void revoke(card.id)} className="text-xs text-red-300 disabled:opacity-40">
                          בטל
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {stepUpFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={confirmStepUp} className="w-full max-w-sm rounded-2xl border border-white/12 bg-ink-900 p-5">
            <h3 className="text-lg font-black">אימות מחדש נדרש</h3>
            <p className="mt-1 text-[0.9rem] text-ink-300">פעולה בכסף — הזן סיסמה כדי לאשר.</p>
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
              <button type="button" onClick={() => setStepUpFor(null)} className="rounded-xl bg-white/[0.07] px-4 py-2">
                ביטול
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
