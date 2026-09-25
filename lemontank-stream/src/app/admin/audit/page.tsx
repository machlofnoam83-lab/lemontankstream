import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, DataTable } from "@/components/ui/primitives";
import { listAudit, securitySummary } from "@/lib/audit";
import { formatNumber, formatRelative } from "@/lib/format";
import { sanitizeText } from "@/lib/validate";

export const metadata: Metadata = { title: "יומן ביקורת", robots: { index: false } };
export const dynamic = "force-dynamic";

/** יומן הביקורת המלא — מי עשה מה, מתי ומאיזה IP */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; severity?: string; page?: string }>;
}) {
  const params = await searchParams;
  const action = sanitizeText(params.action ?? "", 40);
  const severity = ["info", "warning", "critical"].includes(params.severity ?? "") ? params.severity! : "";
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 60;

  const result = listAudit({ limit, offset: (page - 1) * limit, action: action || undefined, severity: severity || undefined });
  const summary = securitySummary();
  const pages = Math.max(1, Math.ceil(result.total / limit));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">📜 יומן ביקורת</h1>
        <p className="mt-1 text-sm text-ink-400">
          {formatNumber(result.total)} רשומות. היומן אינו ניתן לעריכה או מחיקה דרך המערכת — לצורכי ביקורת.
        </p>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded-xl bg-white/[0.04] px-3 py-2">אירועי אבטחה ב-24ש׳: <b>{formatNumber(summary.byKind.reduce((s, k) => s + Number(k.c), 0))}</b></span>
          <span className="rounded-xl bg-white/[0.04] px-3 py-2">התחברויות כושלות ב-24ש׳: <b className="text-amber-300">{formatNumber(summary.failedLogins)}</b></span>
          <span className="rounded-xl bg-white/[0.04] px-3 py-2">סשנים פעילים: <b>{formatNumber(summary.activeSessions)}</b></span>
        </div>
      </Card>

      <form className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3" action="/admin/audit">
        <input name="action" defaultValue={action} placeholder="סינון לפי פעולה, לדוגמה: title. או user." aria-label="סינון פעולה" className="min-w-48 flex-1 rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm" />
        <select name="severity" defaultValue={severity} aria-label="חומרה" className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm">
          <option value="">כל החומרות</option>
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="critical">critical</option>
        </select>
        <button className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">סנן</button>
        {action || severity ? <Link href="/admin/audit" className="text-xs text-ink-300 hover:text-white">איפוס</Link> : null}
      </form>

      <DataTable head={["#", "פעולה", "מבצע", "ישות", "חומרה", "IP", "מתי"]}>
        {result.rows.map((row) => (
          <tr key={row.id} className="hover:bg-white/[0.03]">
            <td className="px-3 py-2 text-[11px] text-ink-500">{row.id}</td>
            <td className="px-3 py-2 font-mono text-[11px]" dir="ltr">{row.action}</td>
            <td className="px-3 py-2 text-xs" dir="ltr">{row.actor_email ?? "מערכת"}</td>
            <td className="px-3 py-2 text-[11px] text-ink-400">{row.entity ?? "—"}{row.entity_id ? `#${row.entity_id}` : ""}</td>
            <td className="px-3 py-2">
              <Badge tone={row.severity === "critical" ? "danger" : row.severity === "warning" ? "warn" : "neutral"}>{row.severity}</Badge>
            </td>
            <td className="px-3 py-2 font-mono text-[10px] text-ink-500" dir="ltr">{row.ip ?? "—"}</td>
            <td className="px-3 py-2 text-[11px] text-ink-400">{formatRelative(row.created_at)}</td>
          </tr>
        ))}
      </DataTable>

      {pages > 1 ? (
        <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="עמודים">
          {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 20).map((p) => (
            <Link
              key={p}
              href={`/admin/audit?page=${p}${action ? `&action=${encodeURIComponent(action)}` : ""}${severity ? `&severity=${severity}` : ""}`}
              aria-current={p === page ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${p === page ? "bg-lemon-400 font-bold text-ink-900" : "bg-white/5 hover:bg-white/10"}`}
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
