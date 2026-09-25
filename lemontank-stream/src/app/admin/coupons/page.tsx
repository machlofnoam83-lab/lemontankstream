import type { Metadata } from "next";
import { Card, StatCard } from "@/components/ui/primitives";
import { CrudManager } from "@/components/admin/crud-manager";
import { all, count, get } from "@/lib/db";
import { formatNumber, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "קופונים", robots: { index: false } };
export const dynamic = "force-dynamic";

/** קופוני הנחה — אחוז, סכום קבוע, או ימי פלוס מתנה */
export default function AdminCouponsPage() {
  const rows = all<Record<string, unknown> & { id: number }>(
    `SELECT c.id, c.code, c.kind, c.value, c.plan_code, c.max_uses, c.uses, c.per_user, c.expires_at, c.is_active,
            (SELECT COUNT(*) FROM coupon_redemptions cr WHERE cr.coupon_id = c.id) AS redemptions
     FROM coupons c ORDER BY c.is_active DESC, c.id DESC`,
  );

  const stats = {
    total: count("SELECT COUNT(*) c FROM coupons"),
    active: count("SELECT COUNT(*) c FROM coupons WHERE is_active = 1"),
    redeemed: count("SELECT COUNT(*) c FROM coupon_redemptions"),
    discountGiven: Number(
      get<{ s: number }>(
        `SELECT COALESCE(SUM(p.amount), 0) s FROM payments p
         JOIN coupon_redemptions cr ON cr.user_id = p.user_id
         WHERE p.status = 'paid'`,
      )?.s ?? 0,
    ),
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">🎟️ קופונים והנחות</h1>
        <p className="mt-1 text-sm text-ink-400">
          כל קופון מוגבל למימוש אחד למשתמש כברירת מחדל. קופון שמסתיים פג אוטומטית בלי מחיקה.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="קופונים" value={formatNumber(stats.total)} />
        <StatCard label="פעילים" value={formatNumber(stats.active)} tone="success" />
        <StatCard label="מימושים" value={formatNumber(stats.redeemed)} />
        <StatCard label="הכנסות ממשתמשי קופון" value={formatPrice(stats.discountGiven)} />
      </div>

      <CrudManager
        endpoint="/api/coupons"
        entityLabel="קופון"
        rows={rows}
        emptyIcon="🎟️"
        warning="קופון 'ימי מתנה' מאריך את תקופת המנוי בלי לחייב. קופון אחוז מחושב על המחיר לפני מע״מ (המע״מ 18% כלול)."
        fields={[
          { name: "code", label: "קוד", type: "text", required: true, placeholder: "LEMON20" },
          { name: "kind", label: "סוג", type: "select", defaultValue: "percent", options: [
            { value: "percent", label: "אחוז הנחה" },
            { value: "fixed", label: "סכום קבוע (₪)" },
            { value: "days", label: "ימי פלוס מתנה" },
          ] },
          { name: "value", label: "ערך", type: "number", defaultValue: 20 },
          { name: "plan_code", label: "מוגבל למסלול", type: "select", defaultValue: "", options: [
            { value: "", label: "כל המסלולים" },
            { value: "plus", label: "פלוס" },
          ] },
          { name: "max_uses", label: "מקסימום מימושים (0 = ללא הגבלה)", type: "number", defaultValue: 0 },
          { name: "per_user", label: "מימושים למשתמש", type: "number", defaultValue: 1 },
          { name: "expires_at", label: "בתוקף עד (ISO)", type: "text", emptyAsNull: true, placeholder: "2026-12-31" },
          { name: "is_active", label: "פעיל", type: "checkbox", defaultValue: true },
        ]}
        columns={[
          { key: "code", label: "קוד", kind: "mono" },
          { key: "kind", label: "סוג", kind: "badge", badgeMap: { percent: "אחוז", fixed: "סכום", days: "ימים" } },
          { key: "value", label: "ערך" },
          { key: "plan_code", label: "מסלול", kind: "badge", tone: { plus: "plus" } },
          { key: "uses", label: "מימושים" },
          { key: "max_uses", label: "מקסימום" },
          { key: "redemptions", label: "משתמשים" },
          { key: "expires_at", label: "בתוקף עד", kind: "date" },
          { key: "is_active", label: "פעיל", kind: "bool" },
        ]}
      />

      <Card className="p-5 text-xs text-ink-400">
        <h2 className="mb-2 text-sm font-bold text-ink-100">איך לאמת שקופון עובד</h2>
        <ol className="list-inside list-decimal space-y-1">
          <li>צור קופון עם קוד לדוגמה <span dir="ltr" className="font-mono text-ink-200">TEST100</span> ו-100% הנחה.</li>
          <li>היכנס עם חשבון בדיקה ל-/plans, הזן את הקוד ולחץ "מימוש".</li>
          <li>בדוק ב-יומן הביקורת שנרשמה פעולה <span dir="ltr" className="font-mono">subscription.update</span> ושהמנוי עודכן לפלוס.</li>
          <li>נסה לממש שוב — אמור להיכשל עם "הקופון כבר נוצל".</li>
        </ol>
      </Card>
    </div>
  );
}
