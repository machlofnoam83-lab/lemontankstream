import type { Metadata } from "next";
import { CrudManager } from "@/components/admin/crud-manager";
import { all } from "@/lib/db";

export const metadata: Metadata = { title: "קמפיינים", robots: { index: false } };
export const dynamic = "force-dynamic";

/** ניהול באנרים, פופ-אפים ורצועות קידום */
export default function AdminPromosPage() {
  const rows = all<Record<string, unknown> & { id: number }>(
    `SELECT id, kind, title, subtitle, image_url, cta_text, cta_url, plan_access, audience, starts_at, ends_at, is_active, sort_order,
            CASE
              WHEN (starts_at IS NULL OR starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
               AND (ends_at   IS NULL OR ends_at   >= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
              THEN 1 ELSE 0
            END AS window_ok
     FROM promos ORDER BY is_active DESC, sort_order ASC, id DESC`,
  );

  const live = rows.filter((r) => r.window_ok === 1 && r.is_active === 1).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">📣 קמפיינים ובאנרים</h1>
        <p className="mt-1 text-sm text-ink-400">
          {rows.length} קמפיינים, {live} פעילים כעת. קמפיין לפלוס לא יוצג למנויי חינם — גם לא בטעות.
        </p>
      </header>

      <CrudManager
        endpoint="/api/promos"
        entityLabel="קמפיין"
        rows={rows}
        emptyIcon="📣"
        warning="שימוש ב-CTA מוביל לכתובת חיצונית — ודא שהכתובת מתחילה ב-https:// או בנתיב פנימי שמתחיל ב-/."
        fields={[
          { name: "title", label: "כותרת", type: "text", required: true, colSpan: 2 },
          { name: "subtitle", label: "כותרת משנה", type: "text", emptyAsNull: true, colSpan: 2 },
          { name: "kind", label: "סוג", type: "select", defaultValue: "banner", options: [
            { value: "banner", label: "באנר" },
            { value: "popup", label: "פופ-אפ" },
            { value: "strip", label: "רצועה" },
            { value: "hero", label: "הירו" },
          ] },
          { name: "audience", label: "קהל יעד", type: "select", defaultValue: "all", options: [
            { value: "all", label: "כולם" },
            { value: "free", label: "מנויי חינם" },
            { value: "plus", label: "מנויי פלוס" },
            { value: "new", label: "משתמשים חדשים" },
            { value: "churned", label: "מי שעזב" },
          ] },
          { name: "plan_access", label: "נדרש מנוי", type: "select", defaultValue: "all", options: [
            { value: "all", label: "כולם" },
            { value: "free", label: "חינם ומעלה" },
            { value: "plus", label: "פלוס בלבד" },
          ] },
          { name: "image_url", label: "קישור לתמונה", type: "text", emptyAsNull: true, placeholder: "/promo.jpg או https://…" },
          { name: "cta_text", label: "טקסט כפתור", type: "text", emptyAsNull: true, placeholder: "הצטרף לפלוס" },
          { name: "cta_url", label: "קישור כפתור", type: "text", emptyAsNull: true, placeholder: "/plans" },
          { name: "starts_at", label: "מתאריך (ISO)", type: "text", emptyAsNull: true, placeholder: "2026-01-01" },
          { name: "ends_at", label: "עד תאריך (ISO)", type: "text", emptyAsNull: true, placeholder: "2026-12-31" },
          { name: "sort_order", label: "סדר תצוגה", type: "number", defaultValue: 0 },
          { name: "is_active", label: "פעיל", type: "checkbox", defaultValue: true },
        ]}
        columns={[
          { key: "id", label: "#", kind: "mono" },
          { key: "title", label: "כותרת" },
          { key: "kind", label: "סוג", kind: "badge", badgeMap: { banner: "באנר", popup: "פופ-אפ", strip: "רצועה", hero: "הירו" } },
          { key: "audience", label: "קהל", kind: "badge", badgeMap: { all: "כולם", free: "חינם", plus: "פלוס", new: "חדשים", churned: "עזבו" } },
          { key: "plan_access", label: "מנוי", kind: "badge", tone: { plus: "plus", free: "free", all: "neutral" } },
          { key: "starts_at", label: "מתאריך", kind: "date" },
          { key: "ends_at", label: "עד תאריך", kind: "date" },
          { key: "window_ok", label: "בתוקף כעת", kind: "bool" },
          { key: "is_active", label: "פעיל", kind: "bool" },
          { key: "sort_order", label: "סדר" },
        ]}
      />
    </div>
  );
}
