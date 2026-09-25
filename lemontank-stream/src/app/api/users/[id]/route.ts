import { route } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, get, run, tx } from "@/lib/db";
import { userAdminSchema, sanitizeText } from "@/lib/validate";
import { revokeAllUserSessions } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };

/** כרטיס משתמש מפורט (מנהלים) */
export const GET = route<P>({ auth: "required", permission: "users.read" }, async (ctx) => {
  const id = Number(ctx.params.id);
  const user = get(
    `SELECT id, email, name, role, status, plan_code, avatar_url, locale, phone, country, email_verified,
            twofa_enabled, failed_logins, locked_until, last_login_at, last_login_ip, last_login_ua,
            marketing_opt_in, referral_code, coins, max_profiles, mature_allowed, notes, created_at, updated_at
     FROM users WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  if (!user) throw new ApiError("NOT_FOUND", 404);

  const sessions = all("SELECT id, ip, user_agent, device_label, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC", [id]);
  const subscriptions = all("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC", [id]);
  const payments = all("SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 50", [id]);
  const activity = all("SELECT action, entity, severity, ip, created_at FROM audit_log WHERE actor_id = ? ORDER BY id DESC LIMIT 50", [id]);
  const profiles = all("SELECT id, name, is_kid, color, created_at FROM profiles WHERE user_id = ?", [id]);

  return jsonOk({ user, sessions, subscriptions, payments, activity, profiles }, undefined, ctx.req);
});

/** עדכון משתמש: תפקיד, סטטוס, מנוי, מגבלות — עם ביקורת מלאה */
export const PATCH = route<P>(
  { auth: "required", permission: "users.update", rateLimit: "write" },
  async (ctx) => {
    const id = Number(ctx.params.id);
    const before = get<Record<string, unknown>>("SELECT id, role, status, plan_code, name, notes, max_profiles, mature_allowed, coins FROM users WHERE id = ? AND deleted_at IS NULL", [id]);
    if (!before) throw new ApiError("NOT_FOUND", 404);

    const input = userAdminSchema.parse(await ctx.body<Record<string, unknown>>());
    const actor = ctx.user!;

    // הגנת מנהלים: רק בעלים יכול לשנות תפקיד/מחוק בעלים, ואף אחד לא משנה את עצמו
    if (input.role !== undefined && actor.role !== "owner") {
      throw new ApiError("FORBIDDEN", 403, undefined, "רק הבעלים יכול לשנות תפקידים");
    }
    if (id === actor.id && (input.role !== undefined || input.status !== undefined)) {
      throw new ApiError("FORBIDDEN", 403, undefined, "אי אפשר לשנות את התפקיד או הסטטוס של עצמך");
    }
    if (before.role === "owner" && actor.role !== "owner") {
      throw new ApiError("FORBIDDEN", 403, undefined, "אי אפשר לערוך חשבון בעלים");
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    const setField = (c: string, v: unknown) => {
      fields.push(`${c} = ?`);
      values.push(v);
    };

    if (input.name !== undefined) setField("name", sanitizeText(input.name, 60));
    if (input.status !== undefined) setField("status", input.status);
    if (input.role !== undefined) setField("role", input.role);
    if (input.max_profiles !== undefined) setField("max_profiles", input.max_profiles);
    if (input.mature_allowed !== undefined) setField("mature_allowed", input.mature_allowed ? 1 : 0);
    if (input.notes !== undefined) setField("notes", input.notes ? sanitizeText(input.notes, 2000) : null);
    if (input.coins !== undefined) setField("coins", input.coins);

    tx(() => {
      if (input.plan_code !== undefined) {
        setField("plan_code", input.plan_code);
        if (input.plan_code === "plus") {
          const end = input.plan_until ?? new Date(Date.now() + 30 * 86_400_000).toISOString();
          const existing = get<{ id: number }>("SELECT id FROM subscriptions WHERE user_id = ? AND status IN ('active','trialing') ORDER BY id DESC LIMIT 1", [id]);
          if (existing) {
            run("UPDATE subscriptions SET plan_code='plus', status='active', current_period_end=? WHERE id=?", [end, existing.id]);
          } else {
            run("INSERT INTO subscriptions(user_id, plan_code, status, current_period_end, provider) VALUES(?,?,?,?,?)", [id, "plus", "active", end, "manual"]);
          }
          run("INSERT INTO notifications(user_id, kind, title, body) VALUES(?,?,?,?)", [
            id, "plan", "המנוי שלך שודרג לפלוס ⭐", "כל התוכן הפרימיום פתוח עבורך. צפייה מהנה!",
          ]);
        } else {
          run("UPDATE subscriptions SET status='canceled', canceled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND status IN ('active','trialing')", [id]);
        }
      }

      if (fields.length) {
        run(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
      }

      // ניתוק סשנים במקרה של השעיה/חסימה או בקשה מפורשת מהמנהל
      if (input.status === "suspended" || input.status === "banned") {
        revokeAllUserSessions(id, `admin_${input.status}`);
      } else if (input.revoke_sessions) {
        revokeAllUserSessions(id, "admin_revoke");
      }
    });

    const after = get<Record<string, unknown>>("SELECT id, role, status, plan_code, name, notes, max_profiles, mature_allowed, coins FROM users WHERE id = ?", [id]);
    const action =
      input.role !== undefined && before.role !== input.role ? "user.role_change"
      : input.plan_code !== undefined && before.plan_code !== input.plan_code ? "user.plan_change"
      : input.status !== undefined && before.status !== input.status ? (input.status === "suspended" ? "user.suspend" : "user.update")
      : "user.update";

    writeAudit(
      { action, entity: "user", entityId: id, severity: input.role !== undefined ? "critical" : "warning", before, after },
      { req: ctx.req, actorId: actor.id, actorEmail: actor.email },
    );

    return jsonOk({ user: after, message: "המשתמש עודכן" }, undefined, ctx.req);
  },
);

/** מחיקה רכה (GDPR) — דורש הרשאת owner */
export const DELETE = route<P>(
  { auth: "required", permission: "users.delete", audit: { action: "user.delete", entity: "user", severity: "critical" } },
  async (ctx) => {
    const id = Number(ctx.params.id);
    if (id === ctx.user!.id) throw new ApiError("BAD_REQUEST", 400, undefined, "אי אפשר למחוק את החשבון של עצמך");

    const target = get<{ id: number; role: string; email: string }>("SELECT id, role, email FROM users WHERE id = ?", [id]);
    if (!target) throw new ApiError("NOT_FOUND", 404);
    if (target.role === "owner") throw new ApiError("FORBIDDEN", 403, undefined, "אי אפשר למחוק חשבון בעלים");

    tx(() => {
      revokeAllUserSessions(id, "admin_delete");
      run(
        `UPDATE users SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status='banned',
           email = 'deleted+' || id || '@lemontank.local', email_norm = 'deleted+' || id || '@lemontank.local',
           name = 'משתמש שנמחק', phone = NULL, notes = NULL, twofa_secret = NULL
         WHERE id = ?`,
        [id],
      );
    });

    return jsonOk({ deleted: id }, undefined, ctx.req);
  },
);
