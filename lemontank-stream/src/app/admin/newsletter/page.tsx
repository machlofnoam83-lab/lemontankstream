import type { Metadata } from "next";
import { Card, DataTable, StatCard } from "@/components/ui/primitives";
import { NewsletterBroadcast } from "@/components/admin/newsletter-broadcast";
import { all, count } from "@/lib/db";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "רשימת תפוצה", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminNewsletterPage() {
  const subscribers = all<{ email: string; source: string | null; confirmed: number; created_at: string }>(
    "SELECT email_norm AS email, source, confirmed, created_at FROM newsletter_subscribers ORDER BY id DESC LIMIT 200",
  );
  const stats = {
    total: count("SELECT COUNT(*) c FROM newsletter_subscribers"),
    confirmed: count("SELECT COUNT(*) c FROM newsletter_subscribers WHERE confirmed = 1"),
    pending: count("SELECT COUNT(*) c FROM newsletter_subscribers WHERE confirmed = 0"),
    optedIn: count("SELECT COUNT(*) c FROM users WHERE marketing_opt_in = 1 AND deleted_at IS NULL"),
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">📬 רשימת תפוצה</h1>
        <p className="mt-1 text-sm text-ink-400">
          מי מקבל את העדכונים, ושליחת עדכון חדש. כל שליחה נרשמת ביומן הביקורת.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="סה״כ נרשמים" value={formatNumber(stats.total)} />
        <StatCard label="מאושרים" value={formatNumber(stats.confirmed)} />
        <StatCard label="ממתינים לאישור" value={formatNumber(stats.pending)} />
        <StatCard label="סימון שיווקי בחשבון" value={formatNumber(stats.optedIn)} />
      </div>

      <NewsletterBroadcast counts={{ confirmed: stats.confirmed, users: stats.optedIn }} />

      <Card className="p-4">
        <h2 className="text-lg font-bold">נרשמים ({subscribers.length} אחרונים)</h2>
        <div className="mt-3">
          <DataTable head={["אימייל", "מקור", "מצב", "נרשם"]}>
            {subscribers.map((row) => (
              <tr key={row.email}>
                <td className="px-3 py-2 font-mono text-[0.9rem]" dir="ltr">
                  {row.email}
                </td>
                <td className="px-3 py-2 text-ink-300">{row.source ?? "—"}</td>
                <td className="px-3 py-2">
                  {row.confirmed ? <span className="text-free-400">מאושר ✓</span> : <span className="text-amber-300">ממתין</span>}
                </td>
                <td className="px-3 py-2 text-ink-400">{new Date(row.created_at).toLocaleDateString("he-IL")}</td>
              </tr>
            ))}
          </DataTable>
          {!subscribers.length && <p className="py-6 text-center text-ink-400">עוד אין נרשמים — הטופס מופיע בתחתית האתר ובדף "מה חדש".</p>}
        </div>
      </Card>
    </div>
  );
}
