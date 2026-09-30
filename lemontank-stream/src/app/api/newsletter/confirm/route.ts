import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { hashKey } from "@/lib/apikeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** אישור הרשמה — קישור מהמייל. לא דורש התחברות (הטוקן הוא ההוכחה). */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const email = (url.searchParams.get("email") ?? "").toLowerCase().trim();

  const ok = Boolean(
    token &&
      email &&
      get("SELECT id FROM newsletter_subscribers WHERE email_norm = ? AND token_hash = ?", [email, hashKey(token)]),
  );

  if (ok) {
    run("UPDATE newsletter_subscribers SET confirmed = 1, token_hash = NULL WHERE email_norm = ?", [email]);
  }

  return NextResponse.redirect(new URL(ok ? "/?newsletter=confirmed" : "/?newsletter=invalid", url.origin));
}
