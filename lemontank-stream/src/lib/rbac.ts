/**
 * הרשאות (RBAC) — אכיפה בצד השרת בלבד.
 *
 * תפקידים:
 *   user   — צופה רגיל: צפייה, רשימות, פרופילים, ביקורות
 *   editor — עורך תוכן: יצירה/עריכה של סרטים, סדרות, פרקים, אפיזודים, מדיה
 *   admin  — מנהל מערכת: גם משתמשים, מנויים, הגדרות, גישה ליומני אבטחה
 *   owner  — בעלים: הכל, כולל שינוי תפקידים, מחיקות קשות וגיבוי/שחזור
 *
 * כל בדיקה נעשית מול מזהה המשתמש שהוצא מהסשן בשרת — לא מהקלט של הלקוח.
 */

import { ApiError } from "./http";
import type { SessionUser } from "./session";

export type Role = "user" | "editor" | "admin" | "owner";

export const ROLE_LEVEL: Record<Role, number> = { user: 1, editor: 2, admin: 3, owner: 4 };
export const ROLE_NAMES_HE: Record<Role, string> = {
  user: "צופה",
  editor: "עורך תוכן",
  admin: "מנהל",
  owner: "בעלים",
};

export type Permission =
  | "content.read" | "content.create" | "content.update" | "content.delete" | "content.publish"
  | "media.upload" | "media.delete"
  | "users.read" | "users.update" | "users.delete" | "users.change_plan" | "users.change_role"
  | "billing.read" | "billing.manage"
  | "settings.read" | "settings.update"
  | "audit.read" | "security.read" | "security.manage"
  | "analytics.read"
  | "moderation.moderate"
  | "admin.impersonate" | "admin.backup" | "admin.maintenance"
  | "api_keys.manage";

const PERMISSIONS: Record<Permission, Role[]> = {
  "content.read": ["user", "editor", "admin", "owner"],
  "content.create": ["editor", "admin", "owner"],
  "content.update": ["editor", "admin", "owner"],
  "content.delete": ["admin", "owner"],
  "content.publish": ["editor", "admin", "owner"],
  "media.upload": ["editor", "admin", "owner"],
  "media.delete": ["editor", "admin", "owner"],

  "users.read": ["admin", "owner"],
  "users.update": ["admin", "owner"],
  "users.delete": ["owner"],
  "users.change_plan": ["admin", "owner"],
  "users.change_role": ["owner"],

  "billing.read": ["admin", "owner"],
  "billing.manage": ["admin", "owner"],

  "settings.read": ["admin", "owner"],
  "settings.update": ["owner"],

  "audit.read": ["admin", "owner"],
  "security.read": ["admin", "owner"],
  "security.manage": ["owner"],
  "analytics.read": ["editor", "admin", "owner"],
  "moderation.moderate": ["editor", "admin", "owner"],

  "admin.impersonate": ["owner"],
  "admin.backup": ["owner"],
  "admin.maintenance": ["owner"],
  "api_keys.manage": ["admin", "owner"],
};

export const can = (role: string | undefined | null, permission: Permission): boolean => {
  const r = (role ?? "user") as Role;
  return (PERMISSIONS[permission] ?? []).includes(r);
};

export const isAdminRole = (role: string | undefined | null): boolean => ROLE_LEVEL[(role ?? "user") as Role] >= ROLE_LEVEL.admin;
export const isStaff = (role: string | undefined | null): boolean => ROLE_LEVEL[(role ?? "user") as Role] >= ROLE_LEVEL.editor;

/** דורש הרשאה — זורק 401/403 עם הודעה בעברית */
export function requirePermission(user: SessionUser | null | undefined, permission: Permission): SessionUser {
  if (!user) throw new ApiError("UNAUTHORIZED", 401);
  if (user.status !== "active") throw new ApiError("FORBIDDEN", 403, undefined, "החשבון אינו פעיל");
  if (!can(user.role, permission)) throw new ApiError("FORBIDDEN", 403);
  return user;
}

export function requireAdmin(user: SessionUser | null | undefined): SessionUser {
  if (!user) throw new ApiError("UNAUTHORIZED", 401);
  if (!isAdminRole(user.role)) throw new ApiError("FORBIDDEN", 403);
  return user;
}

export function requireOwner(user: SessionUser | null | undefined): SessionUser {
  if (!user) throw new ApiError("UNAUTHORIZED", 401);
  if (user.role !== "owner") throw new ApiError("FORBIDDEN", 403, undefined, "פעולה זו מוגבלת לבעלים בלבד");
  return user;
}

/** האם משתמש רשאי לנהל/לצפות בנתונים של משתמש אחר (הגנת IDOR) */
export function canAccessUser(actor: SessionUser, targetUserId: number): boolean {
  if (actor.id === targetUserId) return true;
  return isAdminRole(actor.role);
}

/** כל ההרשאות של תפקיד — לתצוגת מטריצת הרשאות בפאנל */
export const permissionsForRole = (role: Role): Permission[] =>
  (Object.keys(PERMISSIONS) as Permission[]).filter((p) => PERMISSIONS[p].includes(role));

export const permissionMatrix = () =>
  (Object.keys(PERMISSIONS) as Permission[]).map((permission) => ({ permission, roles: PERMISSIONS[permission] }));
