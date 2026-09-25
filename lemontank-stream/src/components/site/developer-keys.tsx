"use client";

import { useState } from "react";
import { Button, Card, Field, Select, Spinner } from "@/components/ui/primitives";
import { CSRF_COOKIE } from "@/lib/cookies";
import { readCookie } from "@/lib/client/api";

type KeyRow = {
  id: number;
  name: string;
  prefix: string;
  scopes: string;
  rate_limit: number;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * ניהול מפתחות API — היצירה מציגה את הסוד פעם אחת בלבד,
 * בדיוק כמו שמפתחות אמיתיים עובדים: אחר כך רק Hash נשמר בשרת.
 */
export function DeveloperKeys({ initial }: { initial: KeyRow[] }) {
  const [keys, setKeys] = useState<KeyRow[]>(initial);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("read");
  const [rateLimit, setRateLimit] = useState("120");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": readCookie(CSRF_COOKIE) },
        body: JSON.stringify({ name, scopes: [scope], rate_limit: Number(rateLimit) }),
      });
      const body = await res.json();
      if (!body?.ok) {
        setError(body?.error?.message ?? "לא הצלחתי ליצור מפתח");
        return;
      }
      setFreshKey(body.data.key);
      setKeys((prev) => [body.data.record, ...prev]);
      setName("");
    } catch {
      setError("שגיאת רשת");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    if (!window.confirm("לבטל את המפתח? פעולה מיידית ובלתי הפיכה.")) return;
    const res = await fetch(`/api/keys/${id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": readCookie(CSRF_COOKIE) },
    });
    const body = await res.json();
    if (body?.ok) {
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k)));
    }
  };

  const copy = async () => {
    if (!freshKey) return;
    await navigator.clipboard.writeText(freshKey).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {freshKey && (
        <Card className="border-lemon-400/50 p-4">
          <h3 className="font-black text-lemon-300">המפתח נוצר — העתק אותו עכשיו</h3>
          <p className="mt-1 text-[0.9rem] text-ink-300">
            זו הפעם היחידה שבה המפתח מוצג. בשרת נשמר רק ה-Hash שלו — אם תאבד אותו, צריך ליצור חדש.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-xl bg-black/50 p-3 font-mono text-[0.9rem] text-lemon-200" dir="ltr">
              {freshKey}
            </code>
            <Button onClick={copy}>{copied ? "✓ הועתק" : "העתק"}</Button>
          </div>
          <button type="button" onClick={() => setFreshKey(null)} className="mt-3 text-[0.85rem] text-ink-400 hover:text-ink-200">
            סגור — שמרתי אותו
          </button>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="text-lg font-bold">מפתח חדש</h3>
        <form onSubmit={create} className="mt-3 grid gap-3 sm:grid-cols-[1fr_150px_130px_auto] sm:items-end">
          <Field label="שם המפתח" hint="למה הוא משמש — כדי שתדע לבטל את הנכון">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              placeholder="לדוגמה: אתר שלי"
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
            />
          </Field>
          <Field label="הרשאה">
            <Select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="read">קריאה בלבד</option>
              <option value="write">קריאה וכתיבה</option>
              <option value="admin">מנהל (הכול)</option>
            </Select>
          </Field>
          <Field label="בקשות/דקה">
            <input
              type="number"
              min={10}
              max={6000}
              value={rateLimit}
              onChange={(event) => setRateLimit(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner /> : "צור מפתח"}
          </Button>
        </form>
        {error && <p className="mt-2 text-[0.9rem] text-red-300">{error}</p>}
      </Card>

      <Card className="p-4">
        <h3 className="text-lg font-bold">המפתחות שלי ({keys.filter((k) => !k.revoked_at).length} פעילים)</h3>
        {keys.length === 0 ? (
          <p className="mt-2 text-ink-400">אין עדיין מפתחות. צור אחד כדי לגשת ל-API.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[0.95rem]">
              <thead className="text-ink-400">
                <tr>
                  <th className="p-2 text-start">שם</th>
                  <th className="p-2 text-start">קידומת</th>
                  <th className="p-2 text-start">הרשאה</th>
                  <th className="p-2 text-start">מכסה</th>
                  <th className="p-2 text-start">שימוש אחרון</th>
                  <th className="p-2 text-start">נוצר</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className={key.revoked_at ? "opacity-50" : undefined}>
                    <td className="p-2 font-bold">{key.name}</td>
                    <td className="p-2 font-mono text-[0.85rem]" dir="ltr">
                      {key.prefix}…
                    </td>
                    <td className="p-2">{key.scopes}</td>
                    <td className="p-2">{key.rate_limit}/דק'</td>
                    <td className="p-2 text-ink-300">{fmt(key.last_used_at)}</td>
                    <td className="p-2 text-ink-300">{fmt(key.created_at)}</td>
                    <td className="p-2 text-end">
                      {key.revoked_at ? (
                        <span className="text-[0.85rem] text-red-300">בוטל</span>
                      ) : (
                        <button type="button" onClick={() => revoke(key.id)} className="text-[0.85rem] text-red-300 hover:underline">
                          בטל
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
