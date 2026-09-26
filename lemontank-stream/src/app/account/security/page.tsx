import type { Metadata } from "next";
import { SecurityPanels } from "@/components/site/security-panels";
import { requireUser } from "@/lib/session";
import { listUserSessions } from "@/lib/session";
import { count, get } from "@/lib/db";

export const metadata: Metadata = { title: "אבטחה ומכשירים", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireUser();
  const sessions = listUserSessions(user.id);
  const status = get<{ twofa_enabled: number; email_verified: number; password_changed_at: string | null }>(
    "SELECT twofa_enabled, email_verified, password_changed_at FROM users WHERE id = ?",
    [user.id],
  );
  const backupLeft = count("SELECT COUNT(*) c FROM auth_tokens WHERE user_id = ? AND kind='unlock' AND used_at IS NULL", [user.id]);
  const audit = count("SELECT COUNT(*) c FROM audit_log WHERE actor_id = ? AND action LIKE 'auth.%' AND created_at > datetime('now','-30 day')", [user.id]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black md:text-3xl">🔐 אבטחה ומכשירים</h1>
        <p className="mt-1 text-sm text-ink-400">
          כאן מנהלים סיסמה, אימות דו-שלבי ומכשירים מחוברים. כל פעולה רגישה נרשמת ביומן האבטחה.
        </p>
      </header>

      <SecurityPanels
        twoFactorEnabled={Boolean(status?.twofa_enabled)}
        emailVerified={Boolean(status?.email_verified)}
        backupCodesLeft={backupLeft}
        passwordChangedAt={status?.password_changed_at ?? null}
        sessions={sessions}
        recentAuthEvents={audit}
      />
    </div>
  );
}
