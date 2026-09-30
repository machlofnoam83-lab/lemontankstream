import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, count, get, run } from "@/lib/db";
import { profileSchema } from "@/lib/validate";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** הפרופילים שלי (כמו Netflix: פרופיל ילדים, PIN, שפה) */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const items = all(
      `SELECT id, name, avatar_url, color, is_kid, maturity_limit, autoplay, autoplay_next, lang_audio, lang_subs, sort_order,
              (pin_hash IS NOT NULL) AS has_pin
       FROM profiles WHERE user_id = ? ORDER BY sort_order, id`,
      [ctx.user!.id],
    );
    return jsonOk({ items, maxProfiles: ctx.user!.max_profiles }, undefined, req);
  });
}

/** יצירת פרופיל */
export async function POST(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const input = profileSchema.parse(await ctx.body<Record<string, unknown>>());
    const settings = getSettings();
    if (input.is_kid && !settings.kids_mode_enabled) throw new ApiError("FORBIDDEN", 403, undefined, "מצב ילדים מושבת כרגע");

    const existing = count("SELECT COUNT(*) c FROM profiles WHERE user_id = ?", [ctx.user!.id]);
    const maxProfiles = ctx.user!.effective_plan === "plus" ? 5 : Math.min(2, ctx.user!.max_profiles);
    if (existing >= maxProfiles) {
      throw new ApiError("PLAN_REQUIRED", 402, { max: maxProfiles }, `הגעת למקסימום ${maxProfiles} פרופילים — שדרג לפלוס לעוד`);
    }

    const dup = get<{ id: number }>("SELECT id FROM profiles WHERE user_id = ? AND name = ?", [ctx.user!.id, input.name]);
    if (dup) throw new ApiError("CONFLICT", 409, undefined, "כבר יש פרופיל בשם הזה");

    const pin = (await ctx.body<{ pin?: string }>()).pin;
    const pinHash = pin && /^\d{4}$/.test(pin) ? await hashPassword(pin) : null;

    const res = run(
      `INSERT INTO profiles(user_id, name, avatar_url, color, is_kid, maturity_limit, pin_hash, lang_audio, lang_subs, sort_order)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [
        ctx.user!.id,
        input.name,
        input.avatar_url ?? null,
        input.color,
        input.is_kid ? 1 : 0,
        input.is_kid ? "7+" : input.maturity_limit,
        pinHash,
        input.lang_audio,
        input.lang_subs,
        existing,
      ],
    );

    return jsonOk({ id: Number(res.lastInsertRowid), message: "הפרופיל נוצר" }, { status: 201 }, req);
  });
}

/** עדכון פרופיל */
export async function PATCH(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "write" }, async (ctx) => {
    const body = await ctx.body<{ id?: number; pin?: string | null } & Record<string, unknown>>();
    const id = Number(body.id ?? 0);
    const profile = get<{ id: number; user_id: number }>("SELECT id, user_id FROM profiles WHERE id = ?", [id]);
    if (!profile || profile.user_id !== ctx.user!.id) throw new ApiError("NOT_FOUND", 404, undefined, "הפרופיל לא נמצא");

    const input = profileSchema.partial().parse(body);
    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.is_kid !== undefined) { fields.push("is_kid = ?"); values.push(input.is_kid ? 1 : 0); }
    if (input.maturity_limit !== undefined) { fields.push("maturity_limit = ?"); values.push(input.maturity_limit); }
    if (input.color !== undefined) { fields.push("color = ?"); values.push(input.color); }
    if (input.avatar_url !== undefined) { fields.push("avatar_url = ?"); values.push(input.avatar_url); }
    if (input.lang_audio !== undefined) { fields.push("lang_audio = ?"); values.push(input.lang_audio); }
    if (input.lang_subs !== undefined) { fields.push("lang_subs = ?"); values.push(input.lang_subs); }

    if (body.pin !== undefined) {
      if (body.pin === null || body.pin === "") {
        fields.push("pin_hash = NULL");
      } else if (/^\d{4}$/.test(String(body.pin))) {
        fields.push("pin_hash = ?");
        values.push(await hashPassword(String(body.pin)));
      } else {
        throw new ApiError("BAD_REQUEST", 400, undefined, "PIN חייב להיות 4 ספרות");
      }
    }

    if (fields.length) run(`UPDATE profiles SET ${fields.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, [...values, id]);
    return jsonOk({ id, message: "הפרופיל עודכן" }, undefined, req);
  });
}

/** מחיקת פרופיל */
export async function DELETE(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const body = await ctx.body<{ id?: number }>();
    const id = Number(body?.id ?? 0);
    const profile = get<{ id: number; user_id: number }>("SELECT id, user_id FROM profiles WHERE id = ?", [id]);
    if (!profile || profile.user_id !== ctx.user!.id) throw new ApiError("NOT_FOUND", 404);

    const total = count("SELECT COUNT(*) c FROM profiles WHERE user_id = ?", [ctx.user!.id]);
    if (total <= 1) throw new ApiError("BAD_REQUEST", 400, undefined, "צריך להשאיר לפחות פרופיל אחד");

    run("DELETE FROM profiles WHERE id = ?", [id]);
    return jsonOk({ deleted: id }, undefined, req);
  });
}

/** אימות PIN לפרופיל ילדים */
export async function PUT(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "login" }, async (ctx) => {
    const body = await ctx.body<{ id?: number; pin?: string }>();
    const id = Number(body?.id ?? 0);
    const profile = get<{ id: number; user_id: number; pin_hash: string | null }>(
      "SELECT id, user_id, pin_hash FROM profiles WHERE id = ?",
      [id],
    );
    if (!profile || profile.user_id !== ctx.user!.id) throw new ApiError("NOT_FOUND", 404);
    if (!profile.pin_hash) return jsonOk({ valid: true }, undefined, req);
    const valid = await verifyPassword(profile.pin_hash, String(body?.pin ?? ""));
    return jsonOk({ valid }, undefined, req);
  });
}
