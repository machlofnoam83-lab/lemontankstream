import type { Metadata } from "next";
import { CrudManager } from "@/components/admin/crud-manager";
import { all } from "@/lib/db";

export const metadata: Metadata = { title: "שידור חי", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * ניהול ערוצי השידור החי.
 * stream_url יכול להיות HLS ‏(.m3u8) או MP4 — הדפדפן מנגן m3u8 רק עם hls.js,
 * ולכן מומלץ להשתמש בספק HLS עם נגן תואם או בכתובת MP4.
 */
export default function AdminLivePage() {
  const rows = all<Record<string, unknown> & { id: number }>(
    `SELECT id, number, name_he, logo_url, stream_url, category, plan_access, is_active, sort_order,
            (epg_json IS NOT NULL) AS has_epg
     FROM live_channels ORDER BY sort_order ASC, number ASC, id ASC`,
  );

  const categories = all<{ category: string }>("SELECT DISTINCT category FROM live_channels ORDER BY category");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">📡 שידור חי</h1>
        <p className="mt-1 text-sm text-ink-400">
          {rows.length} ערוצים ב-{categories.length} קטגוריות. ערוץ עם מנוי "פלוס" מוסתר ממנויי חינם ומוצג להם ככרטיס נעול.
        </p>
      </header>

      <CrudManager
        endpoint="/api/live"
        entityLabel="ערוץ"
        rows={rows}
        emptyIcon="📡"
        warning="אל תזין כאן כתובות פיראטיות — האחריות על תוכן הערוצים היא על המפעיל. השתמש בסטרימינג שקיבלת רישיון אליו."
        fields={[
          { name: "name_he", label: "שם הערוץ", type: "text", required: true },
          { name: "number", label: "מספר ערוץ", type: "number", defaultValue: 1 },
          { name: "category", label: "קטגוריה", type: "text", defaultValue: "כללי", placeholder: "ספורט / חדשות / ילדים" },
          { name: "plan_access", label: "נדרש מנוי", type: "select", defaultValue: "plus", options: [
            { value: "free", label: "חינם" },
            { value: "plus", label: "פלוס" },
          ] },
          { name: "logo_url", label: "לוגו (URL)", type: "text", emptyAsNull: true, colSpan: 2 },
          { name: "stream_url", label: "כתובת שידור (HLS/MP4)", type: "text", emptyAsNull: true, colSpan: 2, placeholder: "https://example.com/live/index.m3u8" },
          { name: "sort_order", label: "סדר תצוגה", type: "number", defaultValue: 0 },
          { name: "is_active", label: "פעיל", type: "checkbox", defaultValue: true },
        ]}
        columns={[
          { key: "number", label: "# ערוץ", kind: "mono" },
          { key: "logo_url", label: "לוגו", kind: "image" },
          { key: "name_he", label: "שם", hrefTemplate: "/live/{id}" },
          { key: "category", label: "קטגוריה", kind: "badge" },
          { key: "plan_access", label: "מנוי", kind: "badge", tone: { plus: "plus", free: "free" } },
          { key: "stream_url", label: "שידור", kind: "mono" },
          { key: "is_active", label: "פעיל", kind: "bool" },
          { key: "sort_order", label: "סדר" },
        ]}
      />
    </div>
  );
}
