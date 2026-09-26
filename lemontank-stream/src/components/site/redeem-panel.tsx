"use client";

import { useEffect, useState } from "react";
import { apiCall } from "@/lib/client/api";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

type Redemption = {
  id: number;
  code_prefix: string;
  kind: "issued" | "external";
  status: "pending" | "approved" | "rejected";
  plan_code: string | null;
  months: number | null;
  value_ils: number | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
};

const STATUS: Record<Redemption["status"], { label: string; tone: "success" | "warn" | "danger" }> = {
  approved: { label: "אושר", tone: "success" },
  pending: { label: "ממתין לאישור", tone: "warn" },
  rejected: { label: "נדחה", tone: "danger" },
};

/**
 * מימוש גיפט קארד.
 *
 * שני מסלולים באותו מסך, כי המשתמש לא צריך לדעת איזה סוג כרטיס יש לו:
 *  · כרטיס שהאתר הנפיק — המנוי נדלק מיד.
 *  · כרטיס שנקנה במקום אחר — נפתחת בקשה, והבעלים מאשר אותה (עם התראה בדיסקורד).
 */
export function RedeemPanel({ initial, signedIn }: { initial: Redemption[]; signedIn: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [code, setCode] = useState("");
  const [contact, setContact] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const refresh = async () => {
    const res = await apiCall<{ redemptions: Redemption[] }>("/api/giftcards");
    if (res.ok) setRows(res.data.redemptions);
  };

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    const res = await apiCall<{ granted: boolean; message: string; period_end?: string }>("/api/giftcards/redeem", {
      method: "POST",
      body: { code, contact: contact || null, evidence: evidence || null },
    });
    setBusy(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setMessage(res.data.message);
    toast.push(res.data.message, res.data.granted ? "success" : "info");
    setCode("");
    setEvidence("");
    await refresh();
    if (res.data.granted) router.refresh();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <Card className="p-5">
        <h2 className="text-lg font-bold">🎁 מימוש כרטיס מתנה</h2>
        <p className="mt-1 text-sm text-ink-400">
          הזן את הקוד שקיבלת. כרטיס שהנפקנו כאן נדלק מיד; כרטיס שנקנה בחנות עובר לאישור שלנו
          (בדרך כלל תוך כמה דקות בשעות הפעילות).
        </p>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label="קוד הכרטיס" required htmlFor="gift-code" hint="אפשר להקליד עם מקפים או בלי — זה לא משנה">
            <Input
              id="gift-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="LT-XXXXX-XXXXX-XXXXX-XXXXX"
              dir="ltr"
              autoComplete="off"
              required
              minLength={8}
            />
          </Field>

          <button type="button" onClick={() => setShowDetails((v) => !v)} className="text-[0.88rem] text-lemon-300 hover:underline">
            {showDetails ? "− הסתר פרטי קשר וראיות" : "+ הוספת פרטי קשר / מספר הזמנה (לכרטיס חיצוני)"}
          </button>

          {showDetails ? (
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <Field label="איך אפשר להשיג אותך" htmlFor="gift-contact" hint="דיסקורד, וואטסאפ או אימייל — כדי שנוכל לאשר מהר">
                <Input
                  id="gift-contact"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  placeholder="username#1234 / 050-0000000"
                  dir="ltr"
                />
              </Field>
              <Field label="מספר הזמנה / פרטי הרכישה" htmlFor="gift-evidence">
                <Input
                  id="gift-evidence"
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="למשל: הזמנה 1234 מרשת X, תאריך 01/01"
                />
              </Field>
            </div>
          ) : null}

          {error ? <Alert tone="danger">{error}</Alert> : null}
          {message ? <Alert tone="success">{message}</Alert> : null}

          <Button type="submit" disabled={busy || !signedIn}>
            {busy ? "בודק…" : signedIn ? "מימוש הכרטיס" : "צריך להתחבר קודם"}
          </Button>
        </form>

        <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-[0.85rem] text-ink-400">
          <p>🔒 אנחנו לא שומרים את הקוד בטקסט גלוי — נשמר Hash ועותק מוצפן בלבד.</p>
          <p>⏱️ אחרי כמה ניסיונות כושלים החשבון נחסם זמנית ממימוש — הגנה מניחוש קודים.</p>
          <p>🧾 מימוש מוצלח מנפיק רשומת תשלום ומאריך את המנוי בלי לאבד את הימים שנשארו.</p>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-bold">הכרטיסים והבקשות שלי</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-ink-400">עוד לא מימשת כרטיס. אחרי המימוש תראה כאן את הסטטוס.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5 text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-mono text-xs text-ink-400" dir="ltr">{row.code_prefix}…</span>
                <span className="text-ink-300">
                  {row.plan_code ? `${row.plan_code} · ${row.months} חודשים` : row.kind === "external" ? "כרטיס חיצוני" : ""}
                </span>
                <span className="text-xs text-ink-500">{new Date(row.created_at).toLocaleDateString("he-IL")}</span>
                <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
        {rows.some((row) => row.status === "pending") ? (
          <p className="mt-3 text-[0.85rem] text-amber-300">
            יש בקשה שממתינה לאישור. אם היא דחופה — כתוב לנו עם הקידומת שמופיעה למעלה.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
