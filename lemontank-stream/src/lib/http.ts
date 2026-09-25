/**
 * עזרי HTTP: תגובות JSON אחידות, חילוץ IP בטוח, טיפול בשגיאות בלי לחשוף מידע פנימי.
 */

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

export type ApiOk<T> = { ok: true; data: T; requestId: string };
export type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; requestId: string };

export const REQUEST_ID_HEADER = "x-request-id";

export function requestId(req?: Request): string {
  const fromHeader = req?.headers.get(REQUEST_ID_HEADER);
  if (fromHeader && /^[a-zA-Z0-9_-]{6,64}$/.test(fromHeader)) return fromHeader;
  return crypto.randomUUID();
}

/**
 * חילוץ כתובת IP אמיתית.
 * אנו סומכים על כותרות proxy רק כשמוגדר TRUST_PROXY=true (ברירת מחדל: כן בסביבת
 * הפלטפורמה, שם יש reverse proxy). אחרת משתמשים במה שיש ב-socket.
 */
export function clientIp(req: Request): string {
  const trustProxy = process.env.TRUST_PROXY !== "false";
  if (trustProxy) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      // הכותרת יכולה להכיל שרשרת — לוקחים את הערך הראשון ומנקים
      const first = xff.split(",")[0].trim();
      if (/^[0-9a-fA-F:.]{3,45}$/.test(first)) return first;
    }
    const real = req.headers.get("x-real-ip");
    if (real && /^[0-9a-fA-F:.]{3,45}$/.test(real.trim())) return real.trim();
  }
  return "127.0.0.1";
}

export function userAgent(req: Request): string {
  return (req.headers.get("user-agent") ?? "unknown").slice(0, 400);
}

export function jsonOk<T>(data: T, init?: ResponseInit, req?: Request): NextResponse<ApiOk<T>> {
  const res = NextResponse.json<ApiOk<T>>({ ok: true, data, requestId: requestId(req) }, init);
  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

const SAFE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "צריך להתחבר כדי לבצע את הפעולה",
  FORBIDDEN: "אין לך הרשאה לפעולה הזו",
  NOT_FOUND: "הפריט המבוקש לא נמצא",
  BAD_REQUEST: "הבקשה אינה תקינה",
  CONFLICT: "הפעולה מתנגשת עם נתון קיים",
  RATE_LIMITED: "יותר מדי בקשות — נסה שוב בעוד רגע",
  PLAN_REQUIRED: "תוכן זה זמין למנויי פלוס בלבד",
  PAYLOAD_TOO_LARGE: "הקובץ גדול מדי",
  UNSUPPORTED_TYPE: "סוג הקובץ אינו נתמך",
  INTERNAL: "משהו השתבש אצלנו — נסה שוב",
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(code: keyof typeof SAFE_MESSAGES | string, status = 400, details?: unknown, message?: string) {
    super(message ?? SAFE_MESSAGES[code] ?? "שגיאה");
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonError(err: unknown, req?: Request): NextResponse<ApiErr> {
  const rid = requestId(req);

  if (err instanceof ApiError) {
    return NextResponse.json<ApiErr>(
      { ok: false, error: { code: err.code, message: err.message, details: err.details }, requestId: rid },
      { status: err.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json<ApiErr>(
      {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "יש שדות לא תקינים בטופס",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        requestId: rid,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  // שגיאה לא צפויה: לוג מלא בשרת, הודעה גנרית ללקוח (בלי דליפת מידע)
  console.error(`[api:${rid}]`, err);
  return NextResponse.json<ApiErr>(
    { ok: false, error: { code: "INTERNAL", message: SAFE_MESSAGES.INTERNAL }, requestId: rid },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

/** קריאת גוף JSON עם הגנת גודל */
export async function readJson<T = unknown>(req: Request, maxBytes = 256 * 1024): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new ApiError("PAYLOAD_TOO_LARGE", 413);
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError("PAYLOAD_TOO_LARGE", 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("BAD_REQUEST", 400, undefined, "גוף הבקשה אינו JSON תקין");
  }
}

/** בונה URL לאפליקציה (מכבד APP_URL, אחרת נגזר מהבקשה) */
export function absoluteUrl(req: NextRequest | Request, pathname = "/"): URL {
  const configured = process.env.APP_URL;
  if (configured) return new URL(pathname, configured);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return new URL(pathname, `${proto}://${host}`);
}

/** מחיל headers של no-store על תשובת HTML עם מידע אישי */
export function privatePage<T extends Response>(res: T): T {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  return res;
}
