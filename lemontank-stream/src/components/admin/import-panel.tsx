"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Alert, Button, Card, Field, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const EXAMPLE = `{
  "titles": [
    {
      "kind": "movie",
      "name_he": "סרט לדוגמה",
      "name_en": "Example Movie",
      "overview": "תיאור קצר בעברית",
      "year": 2024,
      "runtime_min": 108,
      "maturity": "12+",
      "plan_access": "free",
      "status": "draft"
    }
  ]
}`;

/** ייבוא קטלוג מ-JSON — מנהל תוכן יכול להעלות רשימה ולקבל דוח ייבוא */
export function ImportPanel() {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ imported: number; skipped: number; total: number } | null>(null);

  const loadFile = async (file: File) => {
    const text = await file.text();
    setRaw(text.slice(0, 8 * 1024 * 1024));
    setReport(null);
    setError(null);
    toast.push(`נטען הקובץ ${file.name} (${Math.round(file.size / 1024)} ק״ב)`, "info");
  };

  const parseCount = (() => {
    try {
      const parsed = JSON.parse(raw || "{}") as { titles?: unknown[] };
      return Array.isArray(parsed.titles) ? parsed.titles.length : 0;
    } catch {
      return -1;
    }
  })();

  const run = async () => {
    setBusy(true);
    setError(null);
    setReport(null);

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      setBusy(false);
      setError("ה-JSON לא תקין — בדוק שיש פסיקים ומרכאות במקום הנכון.");
      return;
    }

    const res = await apiCall<{ imported: number; skipped: number; total: number; message: string }>("/api/export", { method: "POST", body: payload });
    setBusy(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setReport({ imported: res.data.imported, skipped: res.data.skipped, total: res.data.total });
    toast.push(res.data.message, "success");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-bold">📥 ייבוא כותרים מ-JSON</h2>
        <p className="mt-1 text-xs text-ink-400">
          כל כותר מיובא כטיוטה (אלא אם צוין <span dir="ltr" className="font-mono">status: "published"</span>). כותר עם slug קיים מדולג — אין דריסה שקטה של תוכן קיים. תקרת ייבוא: 5,000 כותרים לבקשה.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
            }}
          />
          <Button variant="subtle" onClick={() => fileRef.current?.click()}>בחר קובץ JSON…</Button>
          <Button variant="ghost" onClick={() => setRaw(EXAMPLE)}>טען דוגמה</Button>
          <Button variant="ghost" onClick={() => { setRaw(""); setReport(null); setError(null); }}>נקה</Button>
          {parseCount >= 0 ? <span className="text-[11px] text-ink-400">זוהו {parseCount} כותרים</span> : parseCount === -1 && raw ? <span className="text-[11px] text-amber-300">JSON לא תקין</span> : null}
        </div>

        <div className="mt-4">
          <Field label="תוכן ה-JSON" htmlFor="import-json">
            <Textarea id="import-json" value={raw} onChange={(e) => setRaw(e.target.value)} rows={14} dir="ltr" className="font-mono text-[11px]" placeholder={EXAMPLE} />
          </Field>
        </div>

        {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
        {report ? (
          <Alert tone="success" className="mt-3">
            יובאו {report.imported} כותרים מתוך {report.total} ({report.skipped} דולגו). הם מופיעים כטיוטות — השלם תמונות ופרקים ואז פרסם.
          </Alert>
        ) : null}

        <div className="mt-4 flex justify-end">
          <Button onClick={run} loading={busy} disabled={!raw.trim()}>ייבא עכשיו</Button>
        </div>
      </Card>

      <Card className="p-5 text-xs text-ink-400">
        <h2 className="mb-2 text-sm font-bold text-ink-100">שדות נתמכים לכל כותר</h2>
        <ul className="grid gap-1 md:grid-cols-2">
          <li><span dir="ltr" className="font-mono text-ink-200">kind</span> — movie או series</li>
          <li><span dir="ltr" className="font-mono text-ink-200">name_he</span> — שם בעברית (חובה)</li>
          <li><span dir="ltr" className="font-mono text-ink-200">name_en</span> — שם באנגלית</li>
          <li><span dir="ltr" className="font-mono text-ink-200">overview</span> — תקציר</li>
          <li><span dir="ltr" className="font-mono text-ink-200">year</span>, <span dir="ltr" className="font-mono text-ink-200">runtime_min</span></li>
          <li><span dir="ltr" className="font-mono text-ink-200">maturity</span> — כל/7+/12+/16+/18+</li>
          <li><span dir="ltr" className="font-mono text-ink-200">plan_access</span> — free או plus</li>
          <li><span dir="ltr" className="font-mono text-ink-200">status</span> — draft או published</li>
          <li><span dir="ltr" className="font-mono text-ink-200">poster_url</span> — כתובת תמונה</li>
          <li><span dir="ltr" className="font-mono text-ink-200">slug</span> — מזהה בכתובת (נגזר מהשם אם ריק)</li>
        </ul>
      </Card>
    </div>
  );
}
