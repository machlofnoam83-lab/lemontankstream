import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";
import { NotificationsList } from "@/components/site/notifications-list";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "התראות", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser().catch(() => null);
  if (!user) {
    return (
      <EmptyState
        title="צריך להתחבר"
        icon="🔔"
        action={<Link href="/login?next=/notifications" className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">התחברות</Link>}
      />
    );
  }

  const items = all<{ id: number; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }>(
    "SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100",
    [user.id],
  );

  if (!items.length) {
    return (
      <EmptyState
        title="אין התראות חדשות"
        description="כשנוסיף תוכן חדש, פרק חדש לסדרה שאתה עוקב אחריה או שינוי במנוי — תקבל התראה כאן."
        icon="🔔"
        action={<Link href="/new" className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">גלה מה חדש</Link>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-black md:text-3xl">🔔 התראות</h1>
      <NotificationsList items={items} />
    </div>
  );
}
