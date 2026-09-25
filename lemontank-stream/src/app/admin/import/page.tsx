import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, DataTable, StatCard } from "@/components/ui/primitives";
import { ImportPanel } from "@/components/admin/import-panel";
import { all, count } from "@/lib/db";
import { formatNumber, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "ייבוא תוכן", robots: { index: false } };
export const dynamic = "force-dynamic";

/** ייבוא קטלוג מ-JSON + היסטוריית עבודות ייבוא */
export default function AdminImportPage() {
  const jobs = all<{ id: number; source: string; status: string; total: number; processed: number; failed: number; created_at: string; finished_at: string | null; started_by_email: string | null }>(
    `SELECT j.id, j.source, j.status, j.total, j.processed, j.failed, j.created_at, j.finished_at, u.email AS started_by_email
     FROM import_jobs j LEFT JOIN users u ON u.id = j.started_by ORDER BY j.id DESC LIMIT 25`,
  );

  const totals = {
    jobs: count("SELECT COUNT(*) c FROM import_jobs"),
    imported: Number(all<{ s: number }>("SELECT COALESCE(SUM(processed),0) s FROM import_jobs")[0]?.s ?? 0),
    skipped: Number(all<{ s: number }>("SELECT COALESCE(SUM(failed),0) s FROM import_jobs")[0]?.s ?? 0),
    titles: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL"),
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">📥 ייבוא תוכן</h1>
        <p className="mt-1 text-sm text-ink-400">
          מכניסים קטלוג בבת אחת, אחר כך משפרים ידנית: תמונות, פרקים, כתוביות והרשאות.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="עבודות ייבוא" value={formatNumber(totals.jobs)} />
        <StatCard label="כותרים שיובאו" value={formatNumber(totals.imported)} tone="success" />
        <StatCard label="דולגו" value={formatNumber(totals.skipped)} />
        <StatCard label="כותרים במערכת" value={formatNumber(totals.titles)} hint="כולל טיוטות" />
      </div>

      <ImportPanel />

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-bold">היסטוריית ייבוא</h2>
        {jobs.length === 0 ? (
          <p className="text-xs text-ink-400">עוד לא בוצע ייבוא.</p>
        ) : (
          <DataTable head={["#", "מקור", "סטטוס", "סה״כ", "יובאו", "דולגו", "מבצע", "מתי"]}>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="px-3 py-2 font-mono text-[11px] text-ink-500">{job.id}</td>
                <td className="px-3 py-2 text-xs" dir="ltr">{job.source}</td>
                <td className="px-3 py-2">
                  <Badge tone={job.status === "done" ? "success" : job.status === "failed" ? "danger" : "warn"}>
                    {job.status === "done" ? "הושלם" : job.status === "failed" ? "נכשל" : "בתהליך"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs">{formatNumber(Number(job.total))}</td>
                <td className="px-3 py-2 text-xs text-emerald-300">{formatNumber(Number(job.processed))}</td>
                <td className="px-3 py-2 text-xs text-ink-400">{formatNumber(Number(job.failed))}</td>
                <td className="px-3 py-2 text-[11px] text-ink-400" dir="ltr">{job.started_by_email ?? "—"}</td>
                <td className="px-3 py-2 text-[11px] text-ink-400">{formatRelative(job.finished_at ?? job.created_at)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  );
}
