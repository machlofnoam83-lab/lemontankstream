import { HeaderShell } from "./header-shell";
import { count, get } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { isStaff } from "@/lib/rbac";
import { activeProfile } from "@/lib/profiles";

/**
 * כותרת האתר (צד שרת) — טוענת את המשתמש ומספר ההתראות,
 * ואת התצוגה עצמה מריצה ב-HeaderShell כדי לאפשר התנהגות גלילה.
 */
export function SiteHeader({ user }: { user: SessionUser | null }) {
  const notifications = user
    ? count("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL", [user.id])
    : 0;

  // הפרופיל הפעיל — כדי שהכותרת תמיד תדע "מי צופה" עכשיו
  const profile = user
    ? activeProfile(user.id, get<{ profile_id: number | null }>("SELECT profile_id FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 1", [user.id])?.profile_id ?? null)
    : null;

  return (
    <HeaderShell
      user={user}
      notifications={notifications}
      isStaffUser={isStaff(user?.role)}
      profile={profile ? { id: profile.id, name: profile.name, avatar_url: profile.avatar_url, is_kid: profile.is_kid } : null}
    />
  );
}
