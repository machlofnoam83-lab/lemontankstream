import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { saveUpload, type AssetKind } from "@/server/storage";
import { get, run } from "@/lib/db";
import { logSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED: AssetKind[] = ["video", "image", "subtitle", "trailer", "audio"];

/**
 * העלאת מדיה (multipart/form-data):
 *   file        — הקובץ עצמו
 *   kind        — video | image | subtitle | trailer | audio  (ברירת מחדל: image)
 *   title_id    — שיוך אופציונלי לכותר
 *   episode_id  — שיוך אופציונלי לפרק
 *   attach      — "poster" | "backdrop" | "video" | "thumb" → מעדכן את השדה בהתאם
 */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    {
      auth: "required",
      permission: "media.upload",
      rateLimit: "upload",
      csrf: true,
      // העלאות מדיה לא עוברות parseBody (multipart)
    },
    async (ctx) => {
      const form = await req.formData().catch(() => null);
      if (!form) throw new ApiError("BAD_REQUEST", 400, undefined, "הבקשה חייבת להיות multipart/form-data");

      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError("BAD_REQUEST", 400, undefined, "לא צורף קובץ");

      const kindRaw = String(form.get("kind") ?? "image") as AssetKind;
      if (!ALLOWED.includes(kindRaw)) throw new ApiError("BAD_REQUEST", 400, undefined, "סוג מדיה לא נתמך");

      const titleId = form.get("title_id") ? Number(form.get("title_id")) : null;
      const episodeId = form.get("episode_id") ? Number(form.get("episode_id")) : null;

      if (titleId && !get<{ id: number }>("SELECT id FROM titles WHERE id = ?", [titleId])) {
        throw new ApiError("NOT_FOUND", 404, undefined, "הכותר לא נמצא");
      }
      if (episodeId && !get<{ id: number }>("SELECT id FROM episodes WHERE id = ?", [episodeId])) {
        throw new ApiError("NOT_FOUND", 404, undefined, "הפרק לא נמצא");
      }

      const asset = await saveUpload(file, { kind: kindRaw, userId: ctx.user!.id, titleId, episodeId });

      // שיוך אוטומטי לשדות הכותר/פרק
      const attach = String(form.get("attach") ?? "");
      const publicUrl = `/api/media/${asset.id}`;

      if (titleId) {
        if (attach === "poster") run("UPDATE titles SET poster_url = ? WHERE id = ?", [publicUrl, titleId]);
        if (attach === "backdrop") run("UPDATE titles SET backdrop_url = ? WHERE id = ?", [publicUrl, titleId]);
        if (attach === "trailer") run("UPDATE titles SET trailer_url = ? WHERE id = ?", [publicUrl, titleId]);
      }
      if (episodeId) {
        if (attach === "thumb") run("UPDATE episodes SET thumb_url = ? WHERE id = ?", [publicUrl, episodeId]);
        if (attach === "video") run("UPDATE episodes SET video_asset_id = ?, video_url = NULL WHERE id = ?", [asset.id, episodeId]);
      }
      if (attach === "video" && titleId && !episodeId) {
        // סרט: נשמר כמזהה נכס על הכותר עצמו
        run("UPDATE titles SET updated_by = ? WHERE id = ?", [ctx.user!.id, titleId]);
      }

      await logSecurityEvent({
        kind: "media_uploaded",
        severity: "info",
        ip: ctx.ip,
        userId: ctx.user!.id,
        detail: `${asset.kind} ${asset.originalName} (${asset.bytes} bytes) sha=${asset.sha256.slice(0, 12)}`,
      });

      return jsonOk(
        {
          asset: {
            id: asset.id,
            url: publicUrl,
            // לווידאו מחזירים קישור סטרימינג ישיר; לתמונות אפשר להשתמש ישירות ב-URL
            kind: asset.kind,
            bytes: asset.bytes,
            mime: asset.mime,
            sha256: asset.sha256,
          },
        },
        { status: 201 },
        req,
      );
    },
  );
}
