import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { getCurrentSession } from "@/lib/session";
import { get, parseJson } from "@/lib/db";
import { isStaff } from "@/lib/rbac";
import { SITE } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Channel = {
  id: number;
  number: number | null;
  name_he: string;
  logo_url: string | null;
  stream_url: string | null;
  category: string;
  plan_access: string;
  epg_json: string | null;
  is_active: number;
};

type EpgEntry = { time?: string; title?: string; until?: string };

/** מחזיר את שם המארח של מקור השידור בלי להפיל את העמוד על כתובת לא תקינה */
function safeHost(url: string): string {
  try {
    return new URL(url, process.env.APP_URL ?? "http://localhost:3000").host;
  } catch {
    return "מקור חיצוני";
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const channel = get<Channel>("SELECT id, name_he FROM live_channels WHERE id = ? AND is_active = 1", [Number(id)]);
  return {
    title: channel ? `${channel.name_he} — שידור חי` : "שידור חי",
    robots: { index: false },
  };
}

export default async function LiveChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = get<Channel>(
    "SELECT id, number, name_he, logo_url, stream_url, category, plan_access, epg_json, is_active FROM live_channels WHERE id = ?",
    [Number(id)],
  );
  if (!channel || !channel.is_active) notFound();

  const session = await getCurrentSession();
  const user = session?.user ?? null;
  const plan = user?.effective_plan ?? "free";
  const staff = isStaff(user?.role);
  const locked = channel.plan_access === "plus" && plan !== "plus" && !staff;

  const epg = parseJson<EpgEntry[]>(channel.epg_json, []) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <nav className="text-xs text-ink-400">
        <Link href="/live" className="hover:text-white">📡 שידור חי</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-200">{channel.name_he}</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {channel.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={channel.logo_url} alt="" className="h-14 w-14 rounded-2xl border border-white/10 object-contain p-1" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-2xl" aria-hidden="true">📺</span>
          )}
          <div>
            <h1 className="text-2xl font-black">{channel.name_he}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-400">
              {channel.number ? <Badge tone="neutral">ערוץ {channel.number}</Badge> : null}
              <Badge tone="info">{channel.category}</Badge>
              {channel.plan_access === "plus" ? <Badge tone="plus">פלוס</Badge> : <Badge tone="free">חינם</Badge>}
              <span className="inline-flex items-center gap-1 text-red-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" /> שידור חי
              </span>
            </p>
          </div>
        </div>
        {user ? <Link href="/account/billing" className="text-xs text-ink-300 hover:text-white">ניהול המנוי שלי</Link> : null}
      </header>

      {locked ? (
        <Card className="p-8 text-center">
          <p className="text-lg font-bold">הערוץ הזה זמין למנויי פלוס ⭐</p>
          <p className="mt-2 text-sm text-ink-400">שדר חי, ללא פרסומות, בכל המכשירים.</p>
          <Link href="/plans" className="mt-4 inline-block rounded-xl bg-lemon-400 px-6 py-3 font-bold text-ink-900">
            שדרג לפלוס
          </Link>
          <p className="mt-3 text-[0.85rem] text-ink-500">
            {user ? "אפשר גם לממש קופון בעמוד המסלולים." : "אין לך חשבון? הרשמה לוקחת פחות מדקה."}
          </p>
        </Card>
      ) : channel.stream_url ? (
        <Card className="overflow-hidden p-0">
          <div className="aspect-video w-full bg-black">
            <video
              className="h-full w-full"
              controls
              playsInline
              autoPlay
              preload="metadata"
              poster={channel.logo_url ?? undefined}
              aria-label={`שידור חי: ${channel.name_he}`}
            >
              <source src={channel.stream_url} />
              הדפדפן שלך לא תומך בנגן וידאו.
            </video>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3 text-[0.85rem] text-ink-400">
            <span>מקור השידור: <span dir="ltr" className="font-mono">{safeHost(channel.stream_url)}</span></span>
            <span>אם השידור לא מתחיל — ייתכן שהמקור דורש נגן HLS או שהערוץ מוגבל גאוגרפית.</span>
          </div>
        </Card>
      ) : (
        <Alert tone="warn">הערוץ עדיין לא הוגדר עם כתובת שידור. מנהל יכול להוסיף אותה בעמוד "שידור חי" בפאנל הניהול.</Alert>
      )}

      {epg.length ? (
        <Card className="p-5">
          <h2 className="text-sm font-bold">🗓️ לוח שידורים</h2>
          <ul className="mt-3 divide-y divide-white/5 text-xs">
            {epg.slice(0, 20).map((entry, i) => (
              <li key={`${entry.time ?? i}-${entry.title ?? ""}`} className="flex items-center justify-between gap-3 py-2">
                <span dir="ltr" className="font-mono text-[0.85rem] text-ink-300">{entry.time ?? ""}{entry.until ? `–${entry.until}` : ""}</span>
                <span>{entry.title ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-center text-[0.85rem] text-ink-500">
        {SITE.name} · השידור מועבר כפי שהוא מהספק. דיווח על תקלה: <Link href="/support" className="text-lemon-300 hover:underline">מרכז התמיכה</Link>
      </p>
    </div>
  );
}
