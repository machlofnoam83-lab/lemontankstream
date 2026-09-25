import type { Metadata } from "next";
import { CrudManager } from "@/components/admin/crud-manager";
import { all } from "@/lib/db";

export const metadata: Metadata = { title: "אוספים", robots: { index: false } };
export const dynamic = "force-dynamic";

/** אוספים ידניים (שורות בעמוד הבית, "הבחירות של הצוות" וכו') */
export default function AdminCollectionsPage() {
  const rows = all<Record<string, unknown> & { id: number }>(
    `SELECT c.id, c.slug, c.name_he, c.description, c.layout, c.plan_access, c.is_public, c.is_auto, c.sort_order, c.active_from, c.active_to,
            (SELECT COUNT(*) FROM collection_titles ct WHERE ct.collection_id = c.id) AS items
     FROM collections c ORDER BY c.sort_order ASC, c.id DESC`,
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">🗂️ אוספים</h1>
        <p className="mt-1 text-sm text-ink-400">
          אוסף הוא שורה/רשת בעמוד הבית. כדי שהאוסף יופיע, סמן אותו כ"ציבורי" והוסף לו כותרים.
          לאחר יצירת אוסף — ערוך אותו והדבק רשימת מזהי כותרים בשדה "כותרים באוסף".
        </p>
      </header>

      <CrudManager
        endpoint="/api/collections"
        updateUrlTemplate="/api/collections/{id}"
        entityLabel="אוסף"
        rows={rows}
        emptyIcon="🗂️"
        warning="סדר האוספים קובע את סדר השורות בעמוד הבית. אוסף 'top10' מוצג כתבנית דירוג מיוחדת."
        fields={[
          { name: "name_he", label: "שם האוסף", type: "text", required: true },
          { name: "slug", label: "slug (ריק = נגזר מהשם)", type: "text", placeholder: "staff-picks" },
          { name: "description", label: "תיאור", type: "text", emptyAsNull: true, colSpan: 2 },
          { name: "layout", label: "פריסה", type: "select", defaultValue: "row", options: [
            { value: "row", label: "שורה" },
            { value: "grid", label: "רשת" },
            { value: "hero", label: "הירו" },
            { value: "top10", label: "עשרת הגדולים" },
            { value: "spotlight", label: "זרקור" },
            { value: "continue", label: "המשך צפייה" },
          ] },
          { name: "plan_access", label: "נדרש מנוי", type: "select", defaultValue: "free", options: [
            { value: "free", label: "חינם" },
            { value: "plus", label: "פלוס" },
          ] },
          { name: "sort_order", label: "סדר תצוגה", type: "number", defaultValue: 0 },
          { name: "active_from", label: "פעיל מתאריך", type: "text", emptyAsNull: true },
          { name: "active_to", label: "פעיל עד תאריך", type: "text", emptyAsNull: true },
          { name: "is_public", label: "ציבורי", type: "checkbox", defaultValue: true },
          { name: "is_auto", label: "אוסף אוטומטי (לפי כלל)", type: "checkbox", defaultValue: false },
          { name: "items", label: "כותרים באוסף (מזהים מופרדים בפסיק)", type: "ids", colSpan: 2, hint: "לדוגמה: 12, 45, 78 — שמירה מעדכנת את רשימת הכותרים. ניתן לראות מזהים בעמוד ניהול הכותרים." },
        ]}
        columns={[
          { key: "id", label: "#", kind: "mono" },
          { key: "name_he", label: "שם" },
          { key: "slug", label: "slug", kind: "mono" },
          { key: "layout", label: "פריסה", kind: "badge" },
          { key: "items", label: "כותרים" },
          { key: "plan_access", label: "מנוי", kind: "badge", tone: { plus: "plus", free: "free" } },
          { key: "is_public", label: "ציבורי", kind: "bool" },
          { key: "is_auto", label: "אוטומטי", kind: "bool" },
          { key: "sort_order", label: "סדר" },
        ]}
      />
    </div>
  );
}
