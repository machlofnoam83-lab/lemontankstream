import type { Metadata } from "next";
import { CrudManager } from "@/components/admin/crud-manager";
import { all } from "@/lib/db";

export const metadata: Metadata = { title: "ז'אנרים", robots: { index: false } };
export const dynamic = "force-dynamic";

/** ניהול ז'אנרים — הז'אנרים מזינים את סינון הקטלוג, את שורות הבית ואת ה-SEO */
export default function AdminGenresPage() {
  const rows = all<{ id: number; slug: string; name_he: string; icon: string | null; color: string; sort: number; titles: number }>(
    `SELECT g.id, g.slug, g.name_he, g.icon, g.color, g.sort,
            (SELECT COUNT(*) FROM title_genres tg JOIN titles t ON t.id = tg.title_id WHERE tg.genre_id = g.id AND t.deleted_at IS NULL) AS titles
     FROM genres g ORDER BY g.sort ASC, g.id ASC`,
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">🏷️ ז'אנרים</h1>
        <p className="mt-1 text-sm text-ink-400">
          הז'אנרים מופיעים בעמוד הקטלוג, בעמודי הבית ובתגיות ה-SEO. מחיקת ז'אנר לא מוחקת כותרים — רק את השיוך.
        </p>
      </header>

      <CrudManager
        endpoint="/api/genres"
        entityLabel="ז'אנר"
        rows={rows as unknown as Array<Record<string, unknown> & { id: number }>}
        emptyIcon="🏷️"
        fields={[
          { name: "name_he", label: "שם בעברית", type: "text", required: true, placeholder: "לדוגמה: מתח" },
          { name: "slug", label: "מזהה בכתובת (slug)", type: "text", placeholder: "מותאם אוטומטית מהשם אם ריק" },
          { name: "icon", label: "אייקון (אימוג'י)", type: "text", placeholder: "🔎" },
          { name: "color", label: "צבע", type: "color", defaultValue: "#f5b301" },
          { name: "sort", label: "סדר תצוגה", type: "number", defaultValue: 0 },
        ]}
        columns={[
          { key: "id", label: "#", kind: "mono" },
          { key: "icon", label: "אייקון" },
          { key: "name_he", label: "שם", hrefTemplate: "/genres/{slug}" },
          { key: "slug", label: "slug", kind: "mono" },
          { key: "color", label: "צבע", kind: "color" },
          { key: "titles", label: "כותרים" },
          { key: "sort", label: "סדר" },
        ]}
      />
    </div>
  );
}
