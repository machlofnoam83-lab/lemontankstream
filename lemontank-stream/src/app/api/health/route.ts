import { NextResponse } from "next/server";
import { get } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * בדיקת חיים מינימלית לניטור.
 *
 * חשוב: במצב חמקן בקשה לא-מסומנת לא מקבלת תשובה בכלל (הנתיב הזה לא נגיש
 * מבחוץ). ניטור לגיטימי — דרך המנהרה/ה-CDN עם הסימן, או מהשרת עצמו:
 *   curl -H "x-lt-origin: $STEALTH_ORIGIN_TOKEN" http://127.0.0.1:3000/api/health
 *
 * התשובה לא חושפת דבר: אין גרסה, אין שם מערכת, אין מידע על מסד הנתונים.
 */
export async function GET() {
  let db = false;
  try {
    db = Boolean(get<{ ok: number }>("SELECT 1 AS ok"));
  } catch {
    db = false;
  }
  return new NextResponse(JSON.stringify({ ok: db }), {
    status: db ? 200 : 503,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
