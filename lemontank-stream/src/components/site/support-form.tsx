"use client";

import { useState } from "react";
import { apiCall } from "@/lib/client/api";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";

export function SupportForm() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await apiCall<{ message: string }>("/api/support", { method: "POST", body: { subject, body, priority } });
    setLoading(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <Alert tone="success">
        קיבלנו את הפנייה! נחזור אליך בהקדם. אפשר גם לעקוב אחרי הפניות מהאזור האישי.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="card-surface space-y-4 rounded-2xl p-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field label="נושא" required htmlFor="subject">
        <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="לדוגמה: הכתוביות לא מופיעות בפרק 3" required minLength={3} maxLength={150} />
      </Field>

      <Field label="פירוט" required htmlFor="body" hint="כמה שיותר פרטים — דפדפן, מכשיר, שם הכותר ושעת הבעיה — יעזרו לנו לפתור מהר">
        <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="תאר את הבעיה…" required minLength={10} maxLength={3000} className="min-h-40" />
      </Field>

      <Field label="דחיפות" htmlFor="priority">
        <Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="low">נמוכה — שאלה כללית</option>
          <option value="normal">רגילה</option>
          <option value="high">גבוהה — לא מצליח לראות</option>
          <option value="urgent">דחוף — חיוב שגוי / אבטחה</option>
        </Select>
      </Field>

      <Button type="submit" loading={loading} className="w-full">שלח פנייה</Button>
    </form>
  );
}
