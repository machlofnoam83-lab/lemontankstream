import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { run } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { sanitizeText } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * נקודת קצה פנימית לרישום אירועי אבטחה מה-middleware (ניסיונות SQLi/XSS וכו').
 * מוגנת בסוד פנימי — לא ניתן להזריק דרכה נתונים מהאינטרנט.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-internal-report") ?? "";
  const expected = process.env.APP_SECRET ?? "dev";

  if (!safeEqual(token, expected)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  // שכבת הגנה נוספת: הדיווח הפנימי מותר רק מבקשה שהגיעה מהשרת המקומי
  // (middleware → אותה מכונה). בקשה מהאינטרנט לא יכולה להזריק אירועים.
  const peerInternal = req.headers.get("x-lt-peer") === "internal";
  const host = (req.headers.get("host") ?? "").split(":")[0];
  const localHost = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  const forwardedFor = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const internalIp = /^(127\.|::1$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|f[cd][0-9a-f]{2}:)/i.test(forwardedFor);

  if (!(peerInternal || (localHost && internalIp))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { kind?: string; ip?: string; detail?: string };

  try {
    run("INSERT INTO security_events(kind, severity, ip, detail) VALUES(?,?,?,?)", [
      sanitizeText(body.kind ?? "unknown", 60),
      "critical",
      sanitizeText(body.ip ?? "", 45) || null,
      sanitizeText(body.detail ?? "", 500) || null,
    ]);
  } catch {
    /* הלוג לא אמור להפיל את הבקשה */
  }

  return NextResponse.json({ ok: true });
}
