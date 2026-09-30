import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { disableTwoFactor, enableTwoFactor, generateBackupCodes, setupTwoFactor } from "@/lib/auth";
import { get } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ניהול אימות דו-שלבי (TOTP):
 *   POST { action: "setup" }              → מחזיר סוד + otpauth URL
 *   POST { action: "enable",  code }      → מפעיל 2FA ומחזיר קודי גיבוי
 *   POST { action: "disable", code }      → מכבה (דורש קוד תקין)
 *   POST { action: "backup_codes" }       → מחדש קודי גיבוי
 */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    {
      auth: "required",
      rateLimit: "write",
      audit: { action: "auth.2fa_enable", entity: "user", severity: "warning" },
    },
    async (ctx) => {
      const body = await ctx.body<{ action?: string; code?: string }>();
      const action = String(body.action ?? "");
      const user = ctx.user!;

      if (action === "setup") {
        const { secret, otpauth } = setupTwoFactor(user.id);
        return jsonOk({ secret, otpauth, note: "סרוק את הקוד באפליקציית Google Authenticator או Authy" }, undefined, req);
      }

      if (action === "enable") {
        const code = String(body.code ?? "").replace(/\D/g, "");
        if (code.length !== 6) throw new ApiError("BAD_REQUEST", 400, undefined, "צריך קוד בן 6 ספרות מהאפליקציה");
        if (!enableTwoFactor(user.id, code, req)) throw new ApiError("BAD_REQUEST", 400, undefined, "הקוד שגוי — נסה שוב");
        const backup = generateBackupCodes(user.id);
        return jsonOk({ enabled: true, backupCodes: backup, note: "שמור את קודי הגיבוי במקום בטוח. כל קוד חד-פעמי." }, undefined, req);
      }

      if (action === "disable") {
        const code = String(body.code ?? "").replace(/\D/g, "");
        if (!disableTwoFactor(user.id, code, req)) throw new ApiError("BAD_REQUEST", 400, undefined, "הקוד שגוי");
        return jsonOk({ enabled: false }, undefined, req);
      }

      if (action === "backup_codes") {
        const backup = generateBackupCodes(user.id);
        return jsonOk({ backupCodes: backup }, undefined, req);
      }

      throw new ApiError("BAD_REQUEST", 400, undefined, "פעולה לא מוכרת");
    },
  );
}

/** מצב ה-2FA של המשתמש */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required" }, async (ctx) => {
    const row = get<{ twofa_enabled: number; email_verified: number }>("SELECT twofa_enabled, email_verified FROM users WHERE id = ?", [ctx.user!.id]);
    const backup = get<{ c: number }>(
      "SELECT COUNT(*) c FROM auth_tokens WHERE user_id = ? AND kind='unlock' AND used_at IS NULL",
      [ctx.user!.id],
    );
    return jsonOk(
      { enabled: Boolean(row?.twofa_enabled), emailVerified: Boolean(row?.email_verified), backupCodesLeft: Number(backup?.c ?? 0) },
      undefined,
      req,
    );
  });
}
