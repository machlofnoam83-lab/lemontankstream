import type { Metadata } from "next";
import { DemoAccountsConsole } from "@/components/admin/demo-accounts-console";

export const metadata: Metadata = { title: "חשבונות לבדיקה", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * מניית חשבונות לבדיקה — כלי המנהל ליצירת קהל דמה.
 * הרשאות: יצירה דורשת users.update, מחיקה דורשת users.delete (בעלים).
 */
export default function AdminDemoAccountsPage() {
  return <DemoAccountsConsole />;
}
