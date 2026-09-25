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
