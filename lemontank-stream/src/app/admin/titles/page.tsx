import type { Metadata } from "next";
import Link from "next/link";
import { Badge, DataTable, EmptyState } from "@/components/ui/primitives";
import { all, count } from "@/lib/db";
import { formatNumber, formatRelative } from "@/lib/format";
import { sanitizeText } from "@/lib/validate";
import { TitlesBulkActions } from "@/components/admin/titles-bulk-actions";

export const metadata: Metadata = { title: "ניהול תוכן", robots: { index: false } };
export const dynamic = "force-dynamic";

/** רשימת כל הסרטים והסדרות עם סינון, חיפוש ופעולות מהירות */
export default async function AdminTitlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; plan?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = sanitizeText(params.q ?? "", 60);
  const kind = params.kind === "movie" || params.kind === "series" ? params.kind : "";
  const plan = params.plan === "free" || params.plan === "plus" ? params.plan : "";
  const status = ["draft", "published", "scheduled", "archived"].includes(params.status ?? "") ? params.status! : "";
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 30;
  const offset = (page - 1) * limit;

  const where: string[] = ["t.deleted_at IS NULL"];
  const values: unknown[] = [];
  if (q) {
    where.push("(t.name_he LIKE ? OR t.name_en LIKE ?)");
    values.push(`%${q}%`, `%${q}%`);
  }
  if (kind) {
    where.push("t.kind = ?");
    values.push(kind);
  }
  if (plan) {
    where.push("t.plan_access = ?");
    values.push(plan);
  }
  if (status) {
    where.push("t.status = ?");
    values.push(status);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const items = all<{
    id: number; kind: string; slug: string; name_he: string; year: number | null; plan_access: string;
    status: string; poster_url: string | null; views_count: number; episodes_count: number; seasons_count: number;
    updated_at: string; is_featured: number;
  }>(
    `SELECT t.id, t.kind, t.slug, t.name_he, t.year, t.plan_access, t.status, t.poster_url, t.views_count,
            t.episodes_count, t.seasons_count, t.updated_at, t.is_featured
     FROM titles t ${whereSql} ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  const total = count(`SELECT COUNT(*) c FROM titles t ${whereSql}`, values);
  const pages = Math.max(1, Math.ceil(total / limit));
  const stats = {
    all: count("SELECT COUNT(*) c FROM titles WHERE deleted_at IS NULL"),
    free: count("SELECT COUNT(*) c FROM titles WHERE plan_access='free' AND deleted_at IS NULL"),
    plus: count("SELECT COUNT(*) c FROM titles WHERE plan_access='plus' AND deleted_at IS NULL"),
    drafts: count("SELECT COUNT(*) c FROM titles WHERE status='draft' AND deleted_at IS NULL"),
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">🎬 סרטים וסדרות</h1>
          <p className="mt-1 text-sm text-ink-400">
            {formatNumber(stats.all)} כותרים · {stats.free} חינם · {stats.plus} פלוס · {stats.drafts} טיוטות
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/titles/new" className="rounded-xl bg-lemon-400 px-4 py-2.5 text-sm font-bold text-ink-900">+ סרט חדש</Link>
          <Link href="/admin/titles/new?kind=series" className="rounded-xl bg-white/10 px-4 py-2.5 text-sm hover:bg-white/15">+ סדרה חדשה</Link>
        </div>
      </header>

      {/* סינון */}
      <form className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3" action="/admin/titles">
        <input name="q" defaultValue={q} placeholder="חיפוש לפי שם…" aria-label="חיפוש כותר" className="min-w-40 flex-1 rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm" />
        <select name="kind" defaultValue={kind} aria-label="סוג" className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm">
          <option value="">הכל</option>
          <option value="movie">סרטים</option>
          <option value="series">סדרות</option>
        </select>
        <select name="plan" defaultValue={plan} aria-label="מסלול" className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm">
          <option value="">חינם + פלוס</option>
          <option value="free">חינם</option>
          <option value="plus">פלוס</option>
        </select>
        <select name="status" defaultValue={status} aria-label="סטטוס" className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="published">מפורסם</option>
          <option value="draft">טיוטה</option>
          <option value="scheduled">מתוזמן</option>
          <option value="archived">ארכיון</option>
        </select>
        <button className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">סנן</button>
        {q || kind || plan || status ? (
          <Link href="/admin/titles" className="rounded-xl px-3 py-2 text-xs text-ink-300 hover:text-white">איפוס</Link>
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          title="לא נמצאו כותרים"
          description="אפשר ליצור סרט או סדרה חדשים — ומשם להעלות פוסטר, פרקים ווידאו."
          icon="🎬"
          action={<Link href="/admin/titles/new" className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">צור כותר ראשון</Link>}
        />
      ) : (
        <>
          <TitlesBulkActions>
            <DataTable head={["", "פוסטר", "שם", "סוג", "שנה", "מסלול", "סטטוס", "פרקים", "צפיות", "עודכן", "פעולות"]}>
              {items.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <input type="checkbox" name="titleId" value={t.id} className="accent-lemon-400" aria-label={`בחר ${t.name_he}`} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="block h-14 w-10 overflow-hidden rounded bg-ink-800">
                      {t.poster_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.poster_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/titles/${t.id}`} className="font-medium hover:text-lemon-300">{t.name_he}</Link>
                    {t.is_featured ? <span className="ms-2 text-[0.8rem] text-lemon-400">⭐</span> : null}
                    <div className="font-mono text-[0.8rem] text-ink-500" dir="ltr">/{t.slug}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{t.kind === "movie" ? "סרט" : "סדרה"}</td>
                  <td className="px-3 py-2 text-xs">{t.year ?? "—"}</td>
                  <td className="px-3 py-2">{t.plan_access === "plus" ? <Badge tone="plus">פלוס</Badge> : <Badge tone="free">חינם</Badge>}</td>
                  <td className="px-3 py-2">
                    <Badge tone={t.status === "published" ? "success" : t.status === "draft" ? "warn" : "neutral"}>
                      {t.status === "published" ? "מפורסם" : t.status === "draft" ? "טיוטה" : t.status === "scheduled" ? "מתוזמן" : "ארכיון"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{t.kind === "series" ? `${t.seasons_count}/${t.episodes_count}` : "—"}</td>
                  <td className="px-3 py-2 text-xs">{formatNumber(t.views_count)}</td>
                  <td className="px-3 py-2 text-[0.85rem] text-ink-400">{formatRelative(t.updated_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 whitespace-nowrap">
                      <Link href={`/admin/titles/${t.id}`} className="text-xs text-lemon-300 hover:underline">עריכה</Link>
                      <Link href={`/title/${t.slug}`} className="text-xs text-ink-300 hover:underline">תצוגה</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          </TitlesBulkActions>

          {pages > 1 ? (
            <nav className="flex items-center justify-center gap-2" aria-label="עמודים">
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center gap-2">
                    {idx > 0 && arr[idx - 1] !== p - 1 ? <span className="text-ink-500">…</span> : null}
                    <Link
                      href={`/admin/titles?page=${p}${kind ? `&kind=${kind}` : ""}${plan ? `&plan=${plan}` : ""}${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                      aria-current={p === page ? "page" : undefined}
                      className={`rounded-lg px-3 py-1.5 text-sm ${p === page ? "bg-lemon-400 font-bold text-ink-900" : "bg-white/5 hover:bg-white/10"}`}
                    >
                      {p}
                    </Link>
                  </span>
                ))}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
