import { HeaderShell } from "./header-shell";
import { count } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { isStaff } from "@/lib/rbac";

/**
 * כותרת האתר (צד שרת) — טוענת את המשתמש ומספר ההתראות,
 * ואת התצוגה עצמה מריצה ב-HeaderShell כדי לאפשר התנהגות גלילה.
 */
export function SiteHeader({ user }: { user: SessionUser | null }) {
  const notifications = user
    ? count("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL", [user.id])
    : 0;

  return <HeaderShell user={user} notifications={notifications} isStaffUser={isStaff(user?.role)} />;
}
