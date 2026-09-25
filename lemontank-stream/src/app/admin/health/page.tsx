import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { Badge, Card, DataTable, StatCard } from "@/components/ui/primitives";
import { SecurityActions } from "@/components/admin/security-actions";
import { all, count, dbStats, get } from "@/lib/db";
import { formatBytes, formatCompact, formatNumber } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { coreTables } from "@/lib/schema";
import { storageRoot } from "@/server/storage";

export const metadata: Metadata = { title: "בריאות המערכת", robots: { index: false } };
export const dynamic = "force-dynamic";

function dirSize(dir: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  try {
    const walk = (current: string, depth = 0): void => {
      if (depth > 4) return;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (entry.isFile()) {
          files++;
          bytes += fs.statSync(full).size;
        }
      }
    };
    if (fs.existsSync(dir)) walk(dir);
  } catch {
    /* מתעלמים מבעיות הרשאה — לא מפילים את העמוד */
  }
  return { bytes, files };
}

/** בריאות המערכת: מסד נתונים, קבצים, הרשאות, קונפיגורציה וסביבה */
export default async function AdminHealthPage() {
  const actor = await getCurrentUser();
  const stats = dbStats();
  const storage = dirSize(storageRoot());
  const dbFileSize = stats.exists ? fs.statSync(stats.file).size : 0;

  const tableCounts = all<{ name: string; rows: number }>(
    `SELECT name, 0 AS rows FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  ).map((t) => {
    try {
      return { name: t.name, rows: count(`SELECT COUNT(*) c FROM "${t.name.replace(/"/g, "")}"`) };
    } catch {
      return { name: t.name, rows: -1 };
    }
  }).sort((a, b) => Number(b.rows) - Number(a.rows));

  const existingTables = new Set(all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((t) => t.name));
  const missingTables = coreTables.filter((t) => !existingTables.has(t));

  const integrity = get<{ integrity_check: string }>("PRAGMA integrity_check")?.integrity_check ?? "unknown";
  const fk = all("PRAGMA foreign_key_check").length;

  const checks: Array<{ label: string; ok: boolean; detail: string }> = [
    { label: "מפתח אפליקציה (APP_SECRET)", ok: (process.env.APP_SECRET ?? "").length >= 32, detail: `אורך: ${(process.env.APP_SECRET ?? "").length} תווים (נדרש 32+)` },
    { label: "מפתח CSRF", ok: (process.env.CSRF_SECRET ?? "").length >= 32, detail: `אורך: ${(process.env.CSRF_SECRET ?? "").length} תווים` },
    { label: "עוגיית HTTPS", ok: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production", detail: `COOKIE_SECURE=${process.env.COOKIE_SECURE ?? "לא מוגדר"}` },
    { label: "מפתח הצפנת מדיה", ok: (process.env.MEDIA_SECRET ?? "").length >= 32, detail: `אורך: ${(process.env.MEDIA_SECRET ?? "").length} תווים` },
    { label: "נתיב מסד", ok: !!process.env.DATABASE_FILE, detail: stats.file },
    { label: "תיקיית מדיה", ok: fs.existsSync(storageRoot()), detail: storageRoot() },
    { label: "כתובת האתר (APP_URL)", ok: !!process.env.APP_URL, detail: process.env.APP_URL ?? "לא מוגדר — השתמש בכתובת הבקשה" },
    { label: "הפעלת 2FA למנהלים", ok: count("SELECT COUNT(*) c FROM users WHERE role IN ('admin','owner') AND twofa_enabled=0 AND deleted_at IS NULL") === 0, detail: `${count("SELECT COUNT(*) c FROM users WHERE role IN ('admin','owner') AND twofa_enabled=0 AND deleted_at IS NULL")} מנהלים ללא 2FA` },
    { label: "סכימת מסד", ok: missingTables.length === 0, detail: missingTables.length ? `חסרות טבלאות: ${missingTables.join(", ")}` : `כל ${coreTables.length} הטבלאות הקריטיות קיימות` },
    { label: "foreign_keys", ok: (get<{ foreign_keys: number }>("PRAGMA foreign_keys")?.foreign_keys ?? 0) === 1, detail: "אכיפת מפתחות זרים" },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">🩺 בריאות המערכת</h1>
        <p className="mt-1 text-sm text-ink-400">מצב המסד, הקבצים, ההרשאות והקונפיגורציה — העמוד הראשון שפותחים כמשהו נראה לא תקין.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="גודל מסד" value={formatBytes(dbFileSize)} hint={`${formatNumber(stats.tableCount)} טבלאות`} />
        <StatCard label="מדיה בדיסק" value={formatBytes(storage.bytes)} hint={`${formatNumber(storage.files)} קבצים`} tone={storage.bytes > 5 * 1024 ** 3 ? "warn" : "neutral"} />
        <StatCard label="שלמות מסד" value={integrity === "ok" ? "תקין" : integrity} tone={integrity === "ok" ? "success" : "danger"} />
        <StatCard label="הפרות מפתח זר" value={formatNumber(fk)} tone={fk === 0 ? "success" : "danger"} />
        <StatCard label="משתמשים" value={formatCompact(count("SELECT COUNT(*) c FROM users"))} />
        <StatCard label="זמן פעילות" value={`${formatNumber(Math.floor(stats.uptimeSec / 3600))} שעות`} />
      </div>

      <SecurityActions integrity={integrity} fkViolations={fk} canManage={actor?.role === "owner"} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold">✅ בדיקות תצורה</h2>
          <ul className="space-y-2">
            {checks.map((check) => (
              <li key={check.label} className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
                <div>
                  <p className="text-xs font-medium">{check.label}</p>
                  <p className="mt-0.5 text-[11px] text-ink-400" dir="auto">{check.detail}</p>
                </div>
                <Badge tone={check.ok ? "success" : "warn"}>{check.ok ? "תקין" : "לבדוק"}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-ink-500">
            להפקת מפתחות חדשים: <span dir="ltr" className="font-mono">node scripts/gen-secrets.mjs</span> — ראו גם README בהמשך.
          </p>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">🧱 טבלאות גדולות</h2>
            <DataTable head={["טבלה", "רשומות"]}>
              {tableCounts.slice(0, 18).map((t) => (
                <tr key={t.name}>
                  <td className="px-3 py-2 font-mono text-[11px]" dir="ltr">{t.name}</td>
                  <td className="px-3 py-2 text-xs">{t.rows < 0 ? "—" : formatNumber(t.rows)}</td>
                </tr>
              ))}
            </DataTable>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">💾 סביבה</h2>
            <ul className="space-y-1.5 text-[11px]">
              <li className="flex justify-between"><span className="text-ink-400">Node</span><span dir="ltr" className="font-mono">{process.version}</span></li>
              <li className="flex justify-between"><span className="text-ink-400">פלטפורמה</span><span dir="ltr" className="font-mono">{process.platform}/{process.arch}</span></li>
              <li className="flex justify-between"><span className="text-ink-400">סביבה</span><span dir="ltr" className="font-mono">{process.env.NODE_ENV ?? "development"}</span></li>
              <li className="flex justify-between"><span className="text-ink-400">מצב יומן</span><span dir="ltr" className="font-mono">{stats.settings.journalMode ?? "—"}</span></li>
              <li className="flex justify-between"><span className="text-ink-400">זיכרון Node</span><span dir="ltr" className="font-mono">{formatBytes(process.memoryUsage().heapUsed)}</span></li>
            </ul>
            <p className="mt-3 text-[11px] text-ink-400">
              גיבוי: <Link href="/api/export?type=backup" className="text-lemon-300 hover:underline">הורד גיבוי JSON מלא</Link> (בעלים בלבד). מומלץ לגבות לפני כל עדכון גרסה.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
