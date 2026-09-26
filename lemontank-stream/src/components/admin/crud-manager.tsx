"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiCall } from "@/lib/client/api";
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, Select, Textarea, Checkbox } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatRelative } from "@/lib/format";

export type CrudFieldType = "text" | "number" | "textarea" | "select" | "checkbox" | "color" | "ids";

export type CrudField = {
  name: string;
  label: string;
  type: CrudFieldType;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: string | number | boolean;
  /** ריק = null במקום השמטה (כדי לאפשר איפוס שדה) */
  emptyAsNull?: boolean;
  colSpan?: 1 | 2;
};

export type CrudColumn = {
  key: string;
  label: string;
  kind?: "text" | "bool" | "badge" | "date" | "mono" | "image" | "color" | "count";
  badgeMap?: Record<string, string>;
  tone?: Record<string, "neutral" | "plus" | "free" | "warn" | "danger" | "success" | "info">;
  /** תבנית קישור עם placeholders, לדוגמה "/genres/{slug}" */
  hrefTemplate?: string;
  suffix?: string;
};

type Row = Record<string, unknown> & { id: number };

/**
 * טבלת ניהול גנרית: יצירה, עריכה ומחיקה מול ה-API.
 * כל הנתונים מגיעים מהשרת (Server Component) ולכן אין כאן שאילתות ישירות ל-DB.
 */
export function CrudManager({
  endpoint,
  updateUrlTemplate,
  entityLabel,
  rows,
  fields,
  columns,
  emptyIcon = "📄",
  warning,
}: {
  endpoint: string;
  updateUrlTemplate?: string;
  entityLabel: string;
  rows: Row[];
  fields: CrudField[];
  columns: CrudColumn[];
  emptyIcon?: string;
  warning?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [rows, query]);

  const defaults = () => {
    const out: Record<string, unknown> = {};
    for (const f of fields) out[f.name] = f.defaultValue ?? (f.type === "checkbox" ? true : f.type === "number" ? 0 : "");
    return out;
  };

  const startCreate = () => {
    setEditingId(null);
    setValues(defaults());
    setError(null);
    setOpen(true);
  };

  const startEdit = (row: Row) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = row[f.name];
      if (f.type === "checkbox") out[f.name] = raw === 1 || raw === true || raw === "1";
      else if (f.type === "ids") out[f.name] = Array.isArray(raw) ? (raw as number[]).join(", ") : "";
      else out[f.name] = raw ?? "";
    }
    setEditingId(row.id);
    setValues(out);
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.name];
      if (f.type === "checkbox") payload[f.name] = Boolean(raw);
      else if (f.type === "number") payload[f.name] = raw === "" ? 0 : Number(raw);
      else if (f.type === "ids") {
        const ids = String(raw ?? "")
          .split(/[,\s]+/)
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0);
        payload[f.name] = ids;
      } else if (raw === "" || raw == null) {
        if (f.emptyAsNull) payload[f.name] = null;
      } else {
        payload[f.name] = raw;
      }
    }

    setBusy(true);
    setError(null);

    const url = editingId == null ? endpoint : (updateUrlTemplate ?? endpoint).replace("{id}", String(editingId));
    const res = await apiCall(url, { method: editingId == null ? "POST" : "PATCH", body: editingId == null ? payload : { id: editingId, ...payload } });
    setBusy(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.push(editingId == null ? `${entityLabel} נוצר בהצלחה ✓` : `${entityLabel} עודכן ✓`, "success");
    setOpen(false);
    router.refresh();
  };

  const remove = async (id: number) => {
    setDeletingId(id);
    const res = await apiCall(endpoint, { method: "DELETE", body: { id } });
    setDeletingId(null);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push(`${entityLabel} נמחק`, "success");
    router.refresh();
  };

  const renderCell = (col: CrudColumn, row: Row) => {
    const value = row[col.key];
    switch (col.kind) {
      case "bool":
        return value ? <span className="text-emerald-400">✓</span> : <span className="text-ink-500">—</span>;
      case "badge": {
        const label = col.badgeMap?.[String(value)] ?? String(value ?? "—");
        return <Badge tone={col.tone?.[String(value)] ?? "neutral"}>{label}</Badge>;
      }
      case "date":
        return <span className="text-[0.85rem] text-ink-400">{value ? formatRelative(String(value)) : "—"}</span>;
      case "mono":
        return <span dir="ltr" className="font-mono text-[0.85rem]">{value != null && value !== "" ? String(value) : "—"}</span>;
      case "image":
        return value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={String(value)} alt="" className="h-10 w-16 rounded-lg object-cover" />
        ) : <span className="text-ink-500">—</span>;
      case "color":
        return (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: String(value ?? "#000") }} />
            <span dir="ltr" className="font-mono text-[0.8rem]">{String(value ?? "")}</span>
          </span>
        );
      case "count":
        return <span className="text-xs">{Number(value ?? 0)}</span>;
      default: {
        const text = value == null || value === "" ? "—" : String(value);
        const href = col.hrefTemplate && value ? col.hrefTemplate.replace(/\{(\w+)\}/g, (_, key: string) => String(row[key] ?? "")) : null;
        const inside = href ? <Link href={href} className="text-lemon-300 hover:underline">{text}</Link> : <span>{text}</span>;
        return <span className="text-xs">{inside}{col.suffix ? <span className="text-ink-500"> {col.suffix}</span> : null}</span>;
      }
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="סינון מהיר…" aria-label="סינון" className="w-56" />
          <span className="text-[0.85rem] text-ink-400">{filtered.length} רשומות</span>
        </div>
        <Button onClick={startCreate}>+ {entityLabel} חדש</Button>
      </div>

      {warning ? <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{warning}</p> : null}

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState title={`אין ${entityLabel}`} icon={emptyIcon} action={<Button onClick={startCreate}>צור עכשיו</Button>} />
        ) : (
          <DataTable head={[...columns.map((c) => c.label), "פעולות"]}>
            {filtered.map((row) => (
              <tr key={row.id} className="hover:bg-white/[0.03]">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2">{renderCell(col, row)}</td>
                ))}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(row)}>עריכה</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(row.id)} loading={deletingId === row.id}>מחיקה</Button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId == null ? `${entityLabel} חדש` : `עריכת ${entityLabel}`}
        size="lg"
        footer={
          <>
            <Button variant="subtle" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={submit} loading={busy}>{editingId == null ? "צור" : "שמור"}</Button>
          </>
        }
      >
        {error ? <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

        <div className="grid gap-3 md:grid-cols-2">
          {fields.map((f) => (
            <div key={f.name} className={f.colSpan === 2 || f.type === "textarea" ? "md:col-span-2" : undefined}>
              {f.type === "checkbox" ? (
                <div className="pt-6">
                  <Checkbox
                    label={f.label}
                    checked={Boolean(values[f.name])}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.checked }))}
                  />
                  {f.hint ? <p className="mt-1 text-[0.85rem] text-ink-400">{f.hint}</p> : null}
                </div>
              ) : f.type === "select" ? (
                <Field label={f.label} htmlFor={`f-${f.name}`} hint={f.hint}>
                  <Select id={`f-${f.name}`} value={String(values[f.name] ?? "")} onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}>
                    {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
              ) : f.type === "textarea" ? (
                <Field label={f.label} htmlFor={`f-${f.name}`} hint={f.hint}>
                  <Textarea id={`f-${f.name}`} value={String(values[f.name] ?? "")} placeholder={f.placeholder} onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))} />
                </Field>
              ) : f.type === "color" ? (
                <Field label={f.label} htmlFor={`f-${f.name}`} hint={f.hint}>
                  <div className="flex items-center gap-2">
                    <input
                      id={`f-${f.name}`}
                      type="color"
                      value={String(values[f.name] || "#f5b301")}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                      className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                    />
                    <Input value={String(values[f.name] ?? "")} onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))} dir="ltr" className="flex-1" />
                  </div>
                </Field>
              ) : (
                <Field label={f.label} htmlFor={`f-${f.name}`} hint={f.hint}>
                  <Input
                    id={`f-${f.name}`}
                    type={f.type === "number" ? "number" : "text"}
                    value={String(values[f.name] ?? "")}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                  />
                </Field>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </Card>
  );
}
