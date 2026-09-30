import type { Metadata } from "next";
import { Card } from "@/components/ui/primitives";
import { RequestsConsole } from "@/components/admin/requests-console";
import { listRequests, requestStats } from "@/lib/requests";
import { requirePermission } from "@/lib/rbac";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = { title: "בקשות תוכן · ניהול", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  const session = await getCurrentSession();
  requirePermission(session?.user, "content.update");

  const stats = requestStats();
  const rows = listRequests({ status: "open", limit: 100 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">🗳️ בקשות תוכן</h1>
        <p className="mt-1 text-ink-300">
          הבקשות של המשתמשים, לפי מספר הקולות. סימון &quot;נוסף&quot; שולח התראה לכל מי שהצביע בעד.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "פתוחות", value: stats.open },
          { label: "בתכנון", value: stats.planned },
          { label: "נוספו", value: stats.added },
          { label: "סה\"כ קולות", value: stats.votes },
        ].map((stat) => (
          <Card key={stat.label} className="p-4 text-center">
            <div className="text-2xl font-black">{stat.value}</div>
            <div className="text-[0.85rem] text-ink-400">{stat.label}</div>
          </Card>
        ))}
      </div>

      <RequestsConsole initial={rows} stats={stats} />
    </div>
  );
}
