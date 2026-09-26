import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAsset } from "@/server/media";
import { ApiError, jsonError } from "@/lib/http";
import { readFileSync, statSync, createReadStream } from "node:fs";
import { safeJoin } from "@/server/storage";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * שרת מדיה עם תמיכה מלאה ב-Range Requests (נדרש לחיפוש/דילוג בווידאו).
 *
 * בקרת גישה:
 *  • כל בקשה נבדקת בשרת: האם המשתמש מחובר, האם התוכן מותר לו (חינם/פלוס),
 *    והאם הקובץ שייך לתוכן שהמשתמש בכלל רשאי לראות.
 *  • קבצים פרטיים אינם נגישים כמו שהם — אין נתיב סטטי לתיקיית storage.
 *  • אם הפרמטר `sig` נשלח, נבדק גם טוקן חתום עם תפוגה (משמש להורדות אופליין).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const assetId = Number(id);
    if (!Number.isFinite(assetId) || assetId <= 0) throw new ApiError("BAD_REQUEST", 400, undefined, "מזהה מדיה לא תקין");

    const url = new URL(req.url);
    const signature = url.searchParams.get("sig") ?? undefined;
    const download = url.searchParams.get("download") === "1";

    const asset = await getAsset(req, assetId, { signature });
    const abs = safeJoin(asset.path);

    let size = 0;
    try {
      size = statSync(abs).size;
    } catch {
      throw new ApiError("NOT_FOUND", 404, undefined, "הקובץ לא נמצא באחסון");
    }

    const isText = asset.mime.startsWith("text/") || asset.kind === "subtitle";

    // ── כתוביות: מוגשות כטקסט קטן (עם טיפול בקידוד UTF-8) ──
    if (isText) {
      const text = readFileSync(abs, "utf8");
      return new NextResponse(text, {
        status: 200,
        headers: {
          "content-type": `${asset.mime}; charset=utf-8`,
          "cache-control": "private, max-age=300",
          "x-content-type-options": "nosniff",
          "access-control-allow-origin": new URL(req.url).origin,
        },
      });
    }

    const range = req.headers.get("range");

    // ── ללא Range: החזרת הקובץ המלא ──
    if (!range) {
      const stream = Readable.toWeb(createReadStream(abs)) as unknown as ReadableStream;
      return new NextResponse(stream, {
        status: 200,
        headers: {
          "content-type": asset.mime,
          "content-length": String(size),
          "accept-ranges": "bytes",
          "cache-control": "private, max-age=3600",
          "x-content-type-options": "nosniff",
          "content-disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(asset.original_name ?? `media-${assetId}`)}"`,
        },
      });
    }

    // ── Range: תמיכה בדילוג ובחיפוש ──
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    const chunkSize = end - start + 1;

    const stream = Readable.toWeb(createReadStream(abs, { start, end })) as unknown as WebReadableStream;
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        "content-type": asset.mime,
        "content-length": String(chunkSize),
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err, req);
  }
}

/** HEAD — מאפשר לנגן לקבל מטא-דאטה בלי להוריד את הקובץ */
export async function HEAD(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const asset = await getAsset(req, Number(id));
    const abs = safeJoin(asset.path);
    const size = statSync(abs).size;
    return new NextResponse(null, {
      status: 200,
      headers: {
        "content-type": asset.mime,
        "content-length": String(size),
        "accept-ranges": "bytes",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
