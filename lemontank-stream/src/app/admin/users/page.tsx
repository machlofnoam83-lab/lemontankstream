import type { Metadata } from "next";
import Link from "next/link";
import { Badge, DataTable, EmptyState, StatCard } from "@/components/ui/primitives";
import { UserEditorButton } from "@/components/admin/user-editor";
import { all, count } from "@/lib/db";
import { formatNumber, formatRelative } from "@/lib/format";
import { sanitizeText } from "@/lib/validate";
import { isAdminRole } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "ניהול משתמשים", robots: { index: false } };
export const dynamic = "force-dynamic";

/** רשימת משתמשים עם סינון, חיפוש ועריכה (תפקיד, סטטוס, מנוי) */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; role?: string; status?: string; page?: string }>;
}) {
  const actor = await getCurrentUser();
  if (!isAdminRole(actor?.role)) redirect("/?error=forbidden");

  const params = await searchParams;
  const q = sanitizeText(params.q ?? "", 60);
  const plan = ["free", "plus"].includes(params.plan ?? "") ? params.plan! : "";
  const role = ["user", "editor", "admin", "owner"].includes(params.role ?? "") ? params.role! : "";
  const status = ["active", "suspended", "banned", "pending"].includes(params.status ?? "") ? params.status! : "";
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const offset = (page - 1) * limit;

  const where: string[] = ["u.deleted_at IS NULL"];
  const values: unknown[] = [];
  if (q) {
    where.push("(u.email LIKE ? OR u.name LIKE ?)");
    values.push(`%${q}%`, `%${q}%`);
  }
  if (plan) {
    where.push("u.plan_code = ?");
    values.push(plan);
  }
  if (role) {
    where.push("u.role = ?");
    values.push(role);
  }
  if (status) {
    where.push("u.status = ?");
    values.push(status);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const items = all<{
    id: number; email: string; name: string; role: string; status: string; plan_code: string;
    created_at: string; last_login_at: string | null; email_verified: number; twofa_enabled: number;
    active_sessions: number; watched_items: number; notes?: string | null;
  }>(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.plan_code, u.created_at, u.last_login_at, u.email_verified,
            u.twofa_enabled, u.notes,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL) AS active_sessions,
            (SELECT COUNT(*) FROM watch_progress wp WHERE wp.user_id = u.id) AS watched_items
     FROM users u ${whereSql} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );

  const total = count(`SELECT COUNT(*) c FROM users u ${whereSql}`, values);
  const pages = Math.max(1, Math.ceil(total / limit));

  const stats = {
    total: count("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL"),
    plus: count("SELECT COUNT(*) c FROM users WHERE plan_code='plus' AND deleted_at IS NULL"),
    newToday: count("SELECT COUNT(*) c FROM users WHERE created_at > datetime('now','-1 day')"),
    locked: count("SELECT COUNT(*) c FROM users WHERE locked_until > strftime('%Y-%m-%dT%H:%M:%fZ','now')"),
    admins: count("SELECT COUNT(*) c FROM users WHERE role IN ('admin','owner') AND deleted_at IS NULL"),
    no2faAdmins: count("SELECT COUNT(*) c FROM users WHERE role IN ('admin','owner') AND twofa_enabled=0 AND deleted_at IS NULL"),
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">👥 ניהול משתמשים</h1>
        <p className="mt-1 text-sm text-ink-400">הרשאות, מנויים וסטטוס חשבון — כל שינוי נרשם ביומן הביקורת.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="סה״כ משתמשים" value={formatNumber(stats.total)} />
        <StatCard label="מנויי פלוס" value={formatNumber(stats.plus)} tone="success" />
        <StatCard label="נרשמו היום" value={formatNumber(stats.newToday)} />
        <StatCard label="חשבונות נעולים" value={formatNumber(stats.locked)} tone={stats.locked ? "warn" : "neutral"} />
        <StatCard label="מנהלים" value={formatNumber(stats.admins)} />
        <StatCard label="מנהלים בלי 2FA" value={formatNumber(stats.no2faAdmins)} tone={stats.no2faAdmins ? "danger" : "success"} />
      </div>

      <form className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3" action="/admin/users">
        <input name="q" defaultValue={q} placeholder="חיפוש לפי שם או אימייל…" aria-label="חיפוש משתמש" className="min-w-44 flex-1 rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm" />
        <select name="plan" defaultValue={plan} aria-label="מסלול" className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm">
          <option value="">כל המסלולים</option>
          <option value="free">חינם</option>
          <option value="plus">פלוס</option>
        </select>
        <select name="role" defaultValue={role} aria-label="תפקיד" className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm">
          <option value="">כל התפקידים</option>
          <option value="user">צופה</option>
          <option value="editor">עורך</option>
          <option value="admin">מנהל</option>
          <option value="owner">בעלים</option>
        </select>
        <select name="status" defaultValue={status} aria-label="סטטוס" className="rounded-xl border border-white/10 bg-ink-900/80 px-3 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="active">פעיל</option>
          <option value="suspended">מושהה</option>
          <option value="banned">חסום</option>
          <option value="pending">ממתין</option>
        </select>
        <button className="rounded-xl bg-lemon-400 px-4 py-2 text-sm font-bold text-ink-900">סנן</button>
      </form>

      {items.length === 0 ? (
        <EmptyState title="לא נמצאו משתמשים" icon="👥" />
      ) : (
        <>
          <DataTable head={["#", "שם", "אימייל", "תפקיד", "מנוי", "סטטוס", "2FA", "התחברות אחרונה", "סשנים", "נרשם", "פעולות"]}>
            {items.map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.03]">
                <td className="px-3 py-2 text-xs text-ink-400">{u.id}</td>
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-xs" dir="ltr">{u.email}</td>
                <td className="px-3 py-2">
                  <Badge tone={u.role === "owner" ? "danger" : u.role === "admin" ? "warn" : u.role === "editor" ? "info" : "neutral"}>
                    {u.role === "owner" ? "בעלים" : u.role === "admin" ? "מנהל" : u.role === "editor" ? "עורך" : "צופה"}
                  </Badge>
                </td>
                <td className="px-3 py-2">{u.plan_code === "plus" ? <Badge tone="plus">פלוס</Badge> : <Badge tone="free">חינם</Badge>}</td>
                <td className="px-3 py-2">
                  <Badge tone={u.status === "active" ? "success" : u.status === "banned" ? "danger" : "warn"}>
                    {u.status === "active" ? "פעיל" : u.status === "banned" ? "חסום" : u.status === "suspended" ? "מושהה" : "ממתין"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs">{u.twofa_enabled ? "✓" : "—"}</td>
                <td className="px-3 py-2 text-[11px] text-ink-400">{u.last_login_at ? formatRelative(u.last_login_at) : "טרם התחבר"}</td>
                <td className="px-3 py-2 text-xs">{u.active_sessions}</td>
                <td className="px-3 py-2 text-[11px] text-ink-400">{formatRelative(u.created_at)}</td>
                <td className="px-3 py-2">
                  <UserEditorButton
                    user={{
                      id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, plan_code: u.plan_code,
                      created_at: u.created_at, last_login_at: u.last_login_at, email_verified: u.email_verified,
                      twofa_enabled: u.twofa_enabled, active_sessions: u.active_sessions, watched_items: u.watched_items, notes: u.notes,
                    }}
                    actorRole={actor?.role ?? "user"}
                  />
                </td>
              </tr>
            ))}
          </DataTable>

          {pages > 1 ? (
            <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="עמודים">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={`/admin/users?page=${p}${plan ? `&plan=${plan}` : ""}${role ? `&role=${role}` : ""}${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  aria-current={p === page ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm ${p === page ? "bg-lemon-400 font-bold text-ink-900" : "bg-white/5 hover:bg-white/10"}`}
                >
                  {p}
                </Link>
              ))}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
