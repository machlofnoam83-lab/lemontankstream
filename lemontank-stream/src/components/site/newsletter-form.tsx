"use client";

import { useState } from "react";
import { Button, Card, Switch } from "@/components/ui/primitives";
import { CSRF_COOKIE } from "@/lib/cookies";
import { readCookie } from "@/lib/client/api";

/** טופס הרשמה מהיר — משמש בתחתית האתר ובעמוד "מה חדש" */
export function NewsletterSignup({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": readCookie(CSRF_COOKIE) },
        body: JSON.stringify({ email, source: compact ? "footer" : "page" }),
      });
      const body = await res.json();
      if (!body?.ok) {
        setMessage(body?.error?.message ?? "לא הצלחתי להירשם");
        setState("error");
        return;
      }
      setMessage("נשלח אליך מייל אישור — לחיצה אחת ואתה בפנים 📬");
      setState("done");
      setEmail("");
    } catch {
      setMessage("שגיאת רשת — נסה שוב");
      setState("error");
    }
  };

  if (state === "done") {
    return <p className="text-[0.9rem] text-free-400">{message}</p>;
  }

  return (
    <form onSubmit={submit} className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-wrap gap-2"}>
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="האימייל שלך"
        className="min-w-[200px] flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2"
        aria-label="כתובת אימייל לעדכונים"
      />
      <Button type="submit" disabled={state === "loading"}>
        {state === "loading" ? "רושם…" : "קבל עדכונים"}
      </Button>
      {state === "error" && <span className="text-[0.85rem] text-red-300">{message}</span>}
    </form>
  );
}

/**
 * העדפות עדכונים למשתמש מחובר — שני מתגים נפרדים:
 * התראות באתר מול מייל שיווקי. הפרדה מכוונת: אפשר לרצות אחת בלי השנייה.
 */
export function NewsletterPreferences({
  email,
  marketingOptIn,
  confirmed,
  subscribedAt,
}: {
  email: string;
  marketingOptIn: boolean;
  confirmed: boolean;
  subscribedAt: string | null;
}) {
  const [optIn, setOptIn] = useState(marketingOptIn);
  const [mailSub, setMailSub] = useState(confirmed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": readCookie(CSRF_COOKIE) },
        body: JSON.stringify({ marketing_opt_in: optIn }),
      });
      const body = await res.json();
      if (!body?.ok) {
        setError(body?.error?.message ?? "לא הצלחתי לשמור");
        return;
      }
      if (mailSub && !confirmed) {
        const sub = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": readCookie(CSRF_COOKIE) },
          body: JSON.stringify({ email, source: "account" }),
        });
        void sub;
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("שגיאת רשת");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <h2 className="text-xl font-bold">ההעדפות שלי</h2>

      <div className="border-b border-white/10 pb-2">
        <Switch
          checked={optIn}
          onChange={setOptIn}
          label="עדכונים באתר"
          description="התראות על כותרים חדשים והמלצות — בתוך האתר"
        />
      </div>

      <div className="pt-1">
        <Switch
          checked={mailSub}
          onChange={(value) => {
            setMailSub(value);
            if (!value && confirmed) {
              // הסרה — מיידית, בלי אישור נוסף
              void fetch("/api/newsletter", {
                method: "DELETE",
                headers: { "x-csrf-token": readCookie(CSRF_COOKIE) },
              });
            }
          }}
          label="עדכון שבועי במייל"
          description={`נשלח לכתובת ${email}${
            confirmed ? " · רשום ומאושר ✓" : mailSub ? " · ממתין לאישור" : " · לא רשום"
          }${subscribedAt ? ` · מאז ${new Date(subscribedAt).toLocaleDateString("he-IL")}` : ""}`}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "שומר…" : "שמור העדפות"}
        </Button>
        {saved && <span className="text-[0.9rem] text-free-400">✓ נשמר</span>}
        {error && <span className="text-[0.9rem] text-red-300">{error}</span>}
      </div>
    </Card>
  );
}
