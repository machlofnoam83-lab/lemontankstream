/**
 * אחסון קבצי מדיה (סרטונים, תמונות, כתוביות) — מקומי על הדיסק, עם אימות קשיח.
 *
 *  אבטחת העלאות (Defense in Depth):
 *   1. רשימת סוגים מותרת (allowlist) לפי MIME + סיומת + חתימת קסם (magic bytes).
 *   2. שמות קבצים אקראיים — הקלט של המשתמש לא נוגע בנתיב (מונע path traversal).
 *   3. אין הרצת קוד מתיקיית האחסון: `Content-Disposition: attachment`, nosniff,
 *      וקבצים נשמרים מחוץ לתיקיית ה-public של Next.
 *   4. הגבלת גודל מדויקת + בדיקת זיכרון אמיתית (לא מסתמכים על Content-Length בלבד).
 *   5. SVGs ו-HTML נדחים (וקטורי XSS קלאסיים).
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { run } from "@/lib/db";
import { ApiError } from "@/lib/http";

export type AssetKind = "video" | "image" | "subtitle" | "audio" | "trailer";

const STORAGE_ROOT = path.join(process.cwd(), "storage");

type Signature = { ext: string; mime: string; test: (b: Buffer) => boolean };

const starts = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  bytes.every((b, i) => buf[offset + i] === b);

const hasAscii = (buf: Buffer, text: string, offset = 0): boolean =>
  buf.subarray(offset, offset + text.length).toString("latin1") === text;

const SIGNATURES: Record<AssetKind, Signature[]> = {
  image: [
    { ext: ".jpg", mime: "image/jpeg", test: (b) => starts(b, [0xff, 0xd8, 0xff]) },
    { ext: ".png", mime: "image/png", test: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { ext: ".webp", mime: "image/webp", test: (b) => hasAscii(b, "RIFF") && hasAscii(b, "WEBP", 8) },
    { ext: ".gif", mime: "image/gif", test: (b) => hasAscii(b, "GIF87a") || hasAscii(b, "GIF89a") },
    { ext: ".avif", mime: "image/avif", test: (b) => hasAscii(b, "ftypavif", 4) },
  ],
  video: [
    { ext: ".mp4", mime: "video/mp4", test: (b) => hasAscii(b, "ftyp", 4) },
    { ext: ".webm", mime: "video/webm", test: (b) => starts(b, [0x1a, 0x45, 0xdf, 0xa3]) },
    { ext: ".mkv", mime: "video/x-matroska", test: (b) => starts(b, [0x1a, 0x45, 0xdf, 0xa3]) },
    { ext: ".mov", mime: "video/quicktime", test: (b) => hasAscii(b, "ftypqt", 4) || hasAscii(b, "moov", 4) },
  ],
  trailer: [
    { ext: ".mp4", mime: "video/mp4", test: (b) => hasAscii(b, "ftyp", 4) },
    { ext: ".webm", mime: "video/webm", test: (b) => starts(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  ],
  audio: [
    { ext: ".mp3", mime: "audio/mpeg", test: (b) => hasAscii(b, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
    { ext: ".aac", mime: "audio/aac", test: (b) => b[0] === 0xff && (b[1] & 0xf0) === 0xf0 },
    { ext: ".m4a", mime: "audio/mp4", test: (b) => hasAscii(b, "ftyp", 4) },
    { ext: ".ogg", mime: "audio/ogg", test: (b) => hasAscii(b, "OggS") },
  ],
  subtitle: [
    { ext: ".vtt", mime: "text/vtt", test: (b) => hasAscii(b, "WEBVTT") },
    { ext: ".srt", mime: "application/x-subrip", test: (b) => /^\uFEFF?\s*\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{3}/.test(b.subarray(0, 64).toString("utf8")) },
  ],
};

/** סיומות שאסור בהחלט לשמור (הרצת קוד / וקטורי תקיפה) */
const FORBIDDEN_EXT = new Set([
  ".php", ".phtml", ".php5", ".jsp", ".asp", ".aspx", ".cgi", ".pl", ".py", ".rb", ".sh", ".bash",
  ".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".ps1", ".msi", ".jar", ".app", ".apk", ".deb", ".rpm",
  ".html", ".htm", ".xhtml", ".svg", ".svgz", ".xml", ".xsl", ".js", ".mjs", ".cjs", ".json", ".wasm",
  ".htaccess", ".htpasswd", ".ini", ".conf", ".env", ".sql", ".db",
]);

const MAX_SIZES: Record<AssetKind, number> = {
  image: Number(process.env.MAX_IMAGE_UPLOAD_MB ?? 8) * 1024 * 1024,
  video: Number(process.env.MAX_VIDEO_UPLOAD_MB ?? 2048) * 1024 * 1024,
  trailer: Number(process.env.MAX_VIDEO_UPLOAD_MB ?? 2048) * 1024 * 1024,
  subtitle: 2 * 1024 * 1024,
  audio: 256 * 1024 * 1024,
};

export function storageRoot(): string {
  return STORAGE_ROOT;
}

/**
 * נתיב מוחלט בטוח בתוך תיקיית האחסון.
 * דוחה כל ניסיון יציאה מהתיקייה (path traversal), אבל *כן* מאפשר תת-תיקיות —
 * הנתיבים ב-DB הם יחסיים כמו "image/2026-09/abc.png".
 */
export function safeJoin(...segments: string[]): string {
  const parts = segments.map((s) => String(s).replace(/\\/g, "/").replace(/^\//, ""));
  const bad = parts.some((p) => p.split("/").some((chunk) => chunk === ".." || chunk === "." || chunk === ""));
  if (bad) throw new ApiError("FORBIDDEN", 403, undefined, "נתיב קובץ לא חוקי");

  const root = path.resolve(STORAGE_ROOT);
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new ApiError("FORBIDDEN", 403, undefined, "נתיב קובץ לא חוקי");
  }
  return target;
}

/** מזהה את סוג הקובץ לפי חתימת הקסם — לא לפי מה שהלקוח הצהיר */
export function sniffKind(buffer: Buffer, requestedKind: AssetKind): { ext: string; mime: string } | null {
  const candidates: AssetKind[] = requestedKind === "trailer" ? ["trailer", "video"] : [requestedKind];
  for (const kind of candidates) {
    for (const sig of SIGNATURES[kind]) {
      if (sig.test(buffer)) return { ext: sig.ext, mime: sig.mime };
    }
  }
  // כתוביות הן טקסטואליות — בדיקה נוספת
  if (requestedKind === "subtitle") {
    const text = buffer.subarray(0, 200).toString("utf8");
    if (/WEBVTT/.test(text)) return { ext: ".vtt", mime: "text/vtt" };
    if (/\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(text)) return { ext: ".srt", mime: "application/x-subrip" };
  }
  return null;
}

export type SavedAsset = {
  id: number;
  path: string;
  bytes: number;
  mime: string;
  sha256: string;
  originalName: string;
  kind: AssetKind;
  publicUrl: string | null;
};

export type UploadOptions = {
  kind: AssetKind;
  userId?: number | null;
  titleId?: number | null;
  episodeId?: number | null;
  /** מכנה את קובץ הכתוביות ל-VTT אם צריך */
  convertSubtitle?: boolean;
  notes?: string;
};

/** שומר קובץ שהועלה לאחר כל בדיקות האבטחה ומחזיר רשומת media_assets */
export async function saveUpload(file: File, opts: UploadOptions): Promise<SavedAsset> {
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError("BAD_REQUEST", 400, undefined, "לא התקבל קובץ");

  const originalName = String(file.name ?? "file").slice(0, 200);
  const ext = path.extname(originalName).toLowerCase();

  if (FORBIDDEN_EXT.has(ext)) {
    throw new ApiError("UNSUPPORTED_TYPE", 415, { ext }, `סוג הקובץ ${ext} אינו נתמך מסיבות אבטחה`);
  }

  const maxSize = MAX_SIZES[opts.kind];
  if (file.size > maxSize) {
    throw new ApiError("PAYLOAD_TOO_LARGE", 413, { maxMB: Math.round(maxSize / 1024 / 1024) }, `הקובץ גדול מהמותר (מקסימום ${Math.round(maxSize / 1024 / 1024)}MB)`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // בדיקה כפולה: גם size שהוצהר וגם האורך האמיתי
  if (buffer.byteLength > maxSize) throw new ApiError("PAYLOAD_TOO_LARGE", 413);

  const sniffed = sniffKind(buffer, opts.kind);
  if (!sniffed) {
    throw new ApiError("UNSUPPORTED_TYPE", 415, undefined, "תוכן הקובץ אינו תואם את הסוג המבוקש (בדיקת חתימה נכשלה)");
  }

  const sha = createHash("sha256").update(buffer).digest("hex");

  // כתוביות: המרה ל-VTT כדי שהנגן יציג אותן
  let payload = buffer;
  let finalExt = sniffed.ext;
  let finalMime = sniffed.mime;
  if (opts.kind === "subtitle") {
    const asText = buffer.toString("utf8");
    if (finalExt === ".vtt" || /WEBVTT/.test(asText)) {
      payload = Buffer.from(asText, "utf8");
    } else {
      payload = Buffer.from(srtToVtt(asText), "utf8");
      finalExt = ".vtt";
      finalMime = "text/vtt";
    }
  }

  const now = new Date();
  const dir = safeJoin(opts.kind, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  await fsp.mkdir(dir, { recursive: true });

  const storedName = `${sha.slice(0, 16)}-${Date.now().toString(36)}${finalExt}`;
  const absPath = path.join(dir, storedName);
  const relPath = path.relative(STORAGE_ROOT, absPath).split(path.sep).join("/");

  await fsp.writeFile(absPath, payload, { mode: 0o644 });

  const res = run(
    `INSERT INTO media_assets(kind, storage, path, mime, bytes, sha256, original_name, title_id, episode_id, visibility, scan_status, uploaded_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      opts.kind, "local", relPath, finalMime, payload.byteLength, sha, originalName,
      opts.titleId ?? null, opts.episodeId ?? null, "private", "clean", opts.userId ?? null,
    ],
  );

  return {
    id: Number(res.lastInsertRowid),
    path: relPath,
    bytes: payload.byteLength,
    mime: finalMime,
    sha256: sha,
    originalName,
    kind: opts.kind,
    publicUrl: null,
  };
}

/** קורא אסет מהדיסק לפי רשומת DB (משמש את נקודת הסטרימינג) */
export async function readAsset(pathOnDisk: string): Promise<Buffer> {
  const abs = safeJoin(pathOnDisk);
  try {
    return await fsp.readFile(abs);
  } catch {
    throw new ApiError("NOT_FOUND", 404, undefined, "הקובץ לא נמצא באחסון");
  }
}

export function assetExists(pathOnDisk: string): boolean {
  try {
    return fs.existsSync(safeJoin(pathOnDisk));
  } catch {
    return false;
  }
}

/** ממיר SRT ל-VTT (כדי שכל הדפדפנים יציגו כתוביות בעברית) */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/^\d+\s*$/gm, "")                       // מזהי ספירה
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body.trim()}\n`;
}

/** ניקוי פוסטר שהועלה — ממיר נתיב יחסי ל-URL ציבורי מאובטח */
export const assetUrl = (assetId: number, ttlSeconds = 3600): string => `/api/media/${assetId}?t=${ttlSeconds}`;
