import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings-form";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "הגדרות מערכת", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">⚙️ הגדרות מערכת</h1>
        <p className="mt-1 text-sm text-ink-400">
          כל ההגדרות נשמרות במסד (טבלת settings) עם רישום ביקורת לכל שינוי. שינויי אבטחה דורשים הרשאת בעלים.
        </p>
      </header>
      <SettingsForm initial={getSettings(true)} />
    </div>
  );
}
