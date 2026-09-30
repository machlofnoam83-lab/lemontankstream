"use client";

import { useCallback, useEffect, useState } from "react";
import { apiOrThrow } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icons";
import { OrnamentRule, SectionHeading } from "@/components/ui/ornaments";

/**
 * קונסולת "מניית חשבונות לבדיקה".
 *
 * המסך הזה קיים כדי לבדוק את המערכת עם קהל (דירוגים, "ממשיכים לצפות",
 * המלצות) — בלי לגעת באף אדם אמיתי. שלוש שקיפויות שהמסך מציג למנהל:
 *   1. הכתובות נוצרות רק בדומיין בדיקה שמור — אי אפשר לשלוח להן מייל.
 *   2. כל חשבון מסומן, ולכן אפשר למחוק את כולם בשנייה.
 *   3. אי אפשר להתחבר איתן (סיסמה אקראית שאינה מוצגת).
 */

type DemoAccount = {
  id: number;
  name: string;
  email: string;
  plan_code: string;
  created_at: string;
  status: string;
};

type DemoData = {
  count: number;
  accounts: DemoAccount[];
  allowedDomains: string[];
};

export function DemoAccountsConsole() {
  const toast = useToast();
  const [data, setData] = useState<DemoData | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(12);
  const [plusPercent, setPlusPercent] = useState(25);
  const [domain, setDomain] = useState("example.com");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiOrThrow<DemoData>("/api/admin/demo-accounts");
      setData(result);
      if (result.allowedDomains[0]) setDomain((current) => (current === "example.com" ? result.allowedDomains[0] : current));
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "טעינת הנתונים נכשלה", "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setBusy(true);
    try {
      const result = await apiOrThrow<{ created: number; total: number }>("/api/admin/demo-accounts", {
        method: "POST",
        body: { count, plusPercent, domain },
      });
      toast.push(`נוצרו ${result.created} חשבונות בדיקה · סה"כ ${result.total}`, "success");
      await load();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "היצירה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeAll() {
    setBusy(true);
    try {
      const result = await apiOrThrow<{ deleted: number }>("/api/admin/demo-accounts", { method: "DELETE" });
      toast.push(`נמחקו ${result.deleted} חשבונות בדיקה`, "success");
      setConfirmDelete(false);
      await load();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "המחיקה נכשלה", "error");
    } finally {
      setBusy(false);
    }
  }

  const plusCount = data?.accounts.filter((account) => account.plan_code === "plus").length ?? 0;

  return (
    <div className="space-y-6 animate-ink-in">
      <header className="space-y-3">
        <SectionHeading title="מניית חשבונות לבדיקה" icon="users" />
        <p className="max-w-3xl text-sm leading-relaxed text-ink-300">
          יצירת חשבונות דמה כדי לראות את המערכת עם קהל — דירוגים, המשך צפייה, המלצות ולוחות ניהול.
          הכתובות נוצרות <strong className="text-parchment-100">רק</strong> בדומיין בדיקה שמור
          (RFC 2606) שאינו ניתן לשליחה, כל חשבון מסומן, ואי אפשר להתחבר אליו.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="חשבונות לבדיקה" value={data?.count ?? 0} icon="users" />
        <Stat label="מהם במסלול פלוס" value={plusCount} icon="crown" />
        <Stat label="דומיין מותר" value={domain} icon="mail" mono />
      </div>

      <OrnamentRule />

      <div className="card-surface chamfer p-5">
        <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-parchment-100">
          <Icon name="plus" className="size-5 text-brass-400" />
          אצווה חדשה
        </h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-brass-300/80">כמה חשבונות</span>
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="w-full border border-brass-500/25 bg-obsidian-950/70 px-3 py-2 text-parchment-100 chamfer outline-none transition focus:border-brass-400/70"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-brass-300/80">אחוז מנוי פלוס</span>
            <input
              type="number"
              min={0}
              max={100}
              value={plusPercent}
              onChange={(event) => setPlusPercent(Number(event.target.value))}
              className="w-full border border-brass-500/25 bg-obsidian-950/70 px-3 py-2 text-parchment-100 chamfer outline-none transition focus:border-brass-400/70"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-brass-300/80">דומיין</span>
            <select
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              className="w-full border border-brass-500/25 bg-obsidian-950/70 px-3 py-2 text-parchment-100 chamfer outline-none transition focus:border-brass-400/70"
            >
              {(data?.allowedDomains ?? ["example.com"]).map((allowed) => (
                <option key={allowed} value={allowed}>
                  {allowed}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={generate} disabled={busy} className="btn-primary chamfer disabled:opacity-50">
            <Icon name="sparkles" className="size-4" />
            {busy ? "עובד…" : `צור ${count} חשבונות`}
          </button>

          {confirmDelete ? (
            <span className="flex items-center gap-2 animate-ink-in">
              <span className="text-sm text-ember-300">למחוק את כל חשבונות הבדיקה?</span>
              <button
                type="button"
                onClick={removeAll}
                disabled={busy}
                className="border border-ember-500/50 bg-ember-500/15 px-4 py-2 text-sm font-bold text-ember-200 chamfer transition hover:bg-ember-500/25"
              >
                כן, מחק
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-2 text-sm text-ink-300 transition hover:text-parchment-100"
              >
                ביטול
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy || !data?.count}
              className="inline-flex items-center gap-2 border border-brass-500/25 px-4 py-2 text-sm font-bold text-parchment-200 chamfer transition hover:border-ember-400/60 hover:text-ember-200 disabled:opacity-40"
            >
              <Icon name="trash" className="size-4" />
              מחק את כולם
            </button>
          )}
        </div>
      </div>

      <div className="card-surface chamfer overflow-hidden">
        <div className="border-b border-brass-500/20 px-5 py-3 font-display text-lg font-bold text-parchment-100">
          החשבונות הקיימים
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          {data && data.accounts.length > 0 ? (
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-obsidian-950/95 text-xs uppercase tracking-widest text-brass-300/70">
                <tr>
                  <th className="px-4 py-2 font-bold">שם</th>
                  <th className="px-4 py-2 font-bold">כתובת</th>
                  <th className="px-4 py-2 font-bold">מסלול</th>
                  <th className="px-4 py-2 font-bold">נוצר</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((account, index) => (
                  <tr
                    key={account.id}
                    className="reveal-item border-t border-brass-500/10 text-parchment-200/90 transition hover:bg-brass-400/[0.04]"
                    style={{ animationDelay: `${Math.min(index * 22, 600)}ms` }}
                  >
                    <td className="px-4 py-2 font-semibold text-parchment-100">{account.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-300" dir="ltr">{account.email}</td>
                    <td className="px-4 py-2">
                      <span className={account.plan_code === "plus" ? "badge-plus" : "badge-free"}>
                        {account.plan_code === "plus" ? "פלוס" : "חינם"}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-400" dir="ltr">
                      {account.created_at.slice(0, 16).replace("T", " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ink-400">
              אין חשבונות בדיקה כרגע. צור אצווה כדי לראות את המערכת עם קהל.
            </p>
          )}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-500">
        הסיסמאות אקראיות ואינן מוצגות לאף אחד — גם לא למנהל. חשבונות אלה מיועדים לנתונים בלבד,
        כדי שלא ניתן יהיה להיכנס דרכם ולעקוף את רישום הפעולות.
      </p>
    </div>
  );
}

function Stat({ label, value, icon, mono = false }: { label: string; value: number | string; icon: "users" | "crown" | "mail"; mono?: boolean }) {
  return (
    <div className="card-surface chamfer flex items-center gap-3 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center border border-brass-400/25 bg-brass-400/[0.07] text-brass-300 chamfer">
        <Icon name={icon} className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs uppercase tracking-widest text-ink-400">{label}</span>
        <span className={`block truncate font-display text-xl font-bold text-parchment-100 ${mono ? "font-mono text-base" : ""}`} dir={mono ? "ltr" : undefined}>
          {value}
        </span>
      </span>
    </div>
  );
}
