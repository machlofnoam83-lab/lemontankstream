"use client";

import { useState } from "react";
import { Button, Card, Field, Switch } from "@/components/ui/primitives";
import { apiCall } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";

/**
 * שליחת עדכון לחברי הרשימה.
 *
 * בשתי דרכים במקביל: התראה באתר למשתמשים שסימנו שיווק, ושליחה למייל
 * לנרשמים המאושרים (השליחה עצמה מתחברת לספק בסביבת ייצור).
 */
export function NewsletterBroadcast({ counts }: { counts: { confirmed: number; users: number } }) {
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [notifyUsers, setNotifyUsers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const send = async () => {
    setBusy(true);
    const res = await apiCall<{ notified: number; emailRecipients: number }>("/api/admin/newsletter", {
      method: "POST",
      body: { subject, body, link: link || undefined, notify_users: notifyUsers },
    });
    setBusy(false);
    setConfirming(false);

    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push(`נשלח: ${res.data.notified} התראות באתר · ${res.data.emailRecipients} נמענים במייל`, "success");
    setSubject("");
    setBody("");
    setLink("");
  };

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-bold">שליחת עדכון</h2>
        <p className="text-[0.85rem] text-ink-400">
          יגיע ל-{counts.users} משתמשים שסימנו עדכונים באתר ולעד {counts.confirmed} נרשמים מאושרים במייל.
        </p>
      </div>

      <div className="grid gap-3">
        <Field label="נושא">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="לדוגמה: 12 כותרים חדשים עלו השבוע"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
          />
        </Field>
        <Field label="תוכן ההודעה" hint="יופיע בהתראה באתר ובמייל">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
          />
        </Field>
        <Field label="קישור (אופציונלי)">
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="/title/new-release"
            dir="ltr"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2"
          />
        </Field>
      </div>

      <Switch
        checked={notifyUsers}
        onChange={setNotifyUsers}
        label="גם התראה באתר"
        description="התראה למשתמשים שסימנו 'עדכונים באתר' — מתאים להודעות דחופות"
      />

      {!confirming ? (
        <Button onClick={() => setConfirming(true)} disabled={subject.trim().length < 3 || body.trim().length < 3}>
          שליחה לבדיקה
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3">
          <span className="text-[0.9rem] text-amber-200">
            לשלוח עכשיו? אי אפשר לבטל שליחה שכבר יצאה.
          </span>
          <Button onClick={send} disabled={busy}>
            {busy ? "שולח…" : "כן, שלח"}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
            ביטול
          </Button>
        </div>
      )}
    </Card>
  );
}
