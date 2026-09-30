"use client";

import { CSRF_COOKIE } from "@/lib/cookies";

/**
 * לקוח API בצד הדפדפן — מטפל אוטומטית ב-CSRF ובשגיאות בעברית.
 * הטוקן נלקח מעוגיית ה-CSRF (double-submit) ונשלח בכותרת x-csrf-token.
 */

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** לטפסים עם FormData (העלאת קבצים) */
  formData?: FormData;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

/** קריאה ל-API עם טיפול אחיד; מחזיר תוצאה במקום לזרוק (נוח לטופסים) */
export async function apiCall<T = unknown>(url: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  const method = options.method ?? (options.body || options.formData ? "POST" : "GET");
  const headers: Record<string, string> = { "x-request-id": crypto.randomUUID() };

  if (method !== "GET") {
    headers["x-csrf-token"] = readCookie(CSRF_COOKIE);
  }

  let payload: BodyInit | undefined;
  if (options.formData) {
    payload = options.formData; // הדפדפן קובע multipart boundary
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(url, { method, headers, body: payload, signal: options.signal, credentials: "same-origin" });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
      return {
        ok: false,
        error: {
          code: err?.code ?? `HTTP_${res.status}`,
          message: err?.message ?? "הבקשה נכשלה — נסה שוב",
          details: err?.details,
        },
      };
    }

    if (json && typeof json === "object" && "ok" in json && (json as { ok: boolean }).ok) {
      return { ok: true, data: (json as unknown as { data: T }).data };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { ok: false, error: { code: "ABORTED", message: "הבקשה בוטלה" } };
    }
    return { ok: false, error: { code: "NETWORK", message: "בעיית תקשורת — בדוק את החיבור לאינטרנט" } };
  }
}

/** גרסה שזורקת שגיאה — נוחה בתוך try/catch */
export async function apiOrThrow<T = unknown>(url: string, options: ApiOptions = {}): Promise<T> {
  const res = await apiCall<T>(url, options);
  if (!res.ok) throw new ApiClientError(res.error.message, res.error.code, 0, res.error.details);
  return res.data;
}

/** העלאת קובץ עם התקדמות (XHR — fetch לא חושף progress של העלאה) */
export function uploadWithProgress<K = unknown>(
  url: string,
  file: File,
  extra: Record<string, string> = {},
  onProgress?: (percent: number) => void,
): Promise<ApiResult<K>> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("file", file);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("x-csrf-token", readCookie(CSRF_COOKIE));
    xhr.setRequestHeader("x-request-id", crypto.randomUUID());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && json.ok) resolve({ ok: true, data: json.data as K });
        else resolve({ ok: false, error: json.error ?? { code: `HTTP_${xhr.status}`, message: "ההעלאה נכשלה" } });
      } catch {
        resolve({ ok: false, error: { code: "PARSE", message: "תגובה לא תקינה מהשרת" } });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: { code: "NETWORK", message: "ההעלאה נכשלה — בעיית רשת" } });
    xhr.send(form);
  });
}
