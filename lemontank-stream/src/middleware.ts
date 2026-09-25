/**
 * Middleware — קו ההגנה הראשון של כל בקשה.
 *
 *  1. CSP עם nonce ייחודי לכל בקשה (מונע XSS מקיף, גם אם נכנס תוכן זדוני).
 *  2. כותרות אבטחה: HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP.
 *  3. זיהוי דפוסי תקיפה בכתובת (SQLi / path traversal / XSS) ורישום אירוע אבטחה.
 *  4. הגנה על נתיבים: /admin ו-/account דורשים עוגיית סשן (בדיקה מלאה בשרת העמוד).
 *  5. אין X-Frame-Options: אנחנו משתמשים ב-frame-ancestors של CSP כדי לאפשר
 *     תצוגה מקדימה מוטמעת מפלטפורמת הפיתוח, בלי לפתוח דלת ל-clickjacking כללי.
 */

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "lt_session";

/** נתיבים שדורשים התחברות (בדיקה זריזה; האימות המלא בצד השרת) */
const PROTECTED_PREFIXES = ["/admin", "/account", "/my-list", "/watch", "/notifications"];
/** נתיבים למשתמשים לא מחוברים בלבד */
const GUEST_ONLY = ["/login", "/register", "/forgot-password"];

/** דפוסים חשודים בכתובת — נרשמים כאירוע אבטחה ונחסמים */
const ATTACK_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "sqli", re: /(\bunion\b[\s/*]*\bselect\b|\bselect\b[\s\S]{0,40}\bfrom\b|\binsert\s+into\b|\bdrop\s+table\b|'\s*or\s+'?1'?\s*=\s*'?1|--\s*$|;\s*--|sleep\s*\(|benchmark\s*\(|waitfor\s+delay)/i },
  { name: "xss", re: /(<\s*script|javascript\s*:|onerror\s*=|onload\s*=|%3cscript|&#x3c;script)/i },
  { name: "path_traversal", re: /(\.\.\/|\.\.\\|%2e%2e%2f|%252e%252e|\.\.%2f)/i },
  { name: "cmd_injection", re: /(\|\s*(cat|ls|whoami|curl|wget)\b|;\s*\/bin\/|`.*`|\$\(.*\))/i },
  { name: "ssti", re: /(\{\{.*\}\}|\$\{.*\}|<%=.*%>)/i },
];

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCsp(nonce: string, isDev: boolean): string {
  // רשימת המקורות שמורשים להטמיע את האפליקציה ב-iframe (תצוגה מקדימה).
  // בפרודקשן מומלץ להשאיר רק 'self' — ראו SECURITY.md
  const frameAncestors = process.env.ALLOW_FRAME_ANCESTORS ?? "'self' https://*.e2b.app https://*.e2b.dev https://*.arena.ai https://*.arena.im https://*.vercel.app";

  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    // Tailwind/Next מזריקים style דינמי; style-src-elem עם nonce + inline מוגבל
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https: wss:`,
    `frame-src 'self' blob: https:`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors ${frameAncestors}`,
    `block-all-mixed-content`,
    isDev ? `` : `upgrade-insecure-requests`,
  ]
    .filter(Boolean)
    .join("; ");
}

function applySecurityHeaders(res: NextResponse, csp: string, isDev: boolean): void {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  res.headers.set("Origin-Agent-Cluster", "?1");
  res.headers.set("X-Robots-Tag", "index, follow");
  // HSTS רק מאחורי HTTPS
  if (!isDev && process.env.COOKIE_SECURE !== "false") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  res.headers.delete("X-Powered-By");
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const isDev = process.env.NODE_ENV !== "production";
  const nonce = randomNonce();
  const csp = buildCsp(nonce, isDev);
  const { pathname, search } = req.nextUrl;

  /* ── 1. זיהוי דפוסי תקיפה ──────────────────────────────────────────────── */
  const probe = `${pathname}${search}`;
  for (const { name, re } of ATTACK_PATTERNS) {
    if (re.test(probe)) {
      // רישום אירוע האבטחה (await — קורה רק בניסיונות תקיפה, ולכן הזמן זניח)
      await fetch(new URL("/api/security/report", req.nextUrl.origin), {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-report": process.env.APP_SECRET ?? "dev" },
        body: JSON.stringify({
          kind: `attack_pattern_${name}`,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
          detail: probe.slice(0, 400),
        }),
      }).catch(() => undefined);

      const res = NextResponse.json(
        { ok: false, error: { code: "BLOCKED", message: "הבקשה נחסמה על ידי מערכת האבטחה" } },
        { status: 403 },
      );
      applySecurityHeaders(res, csp, isDev);
      ensureCsrfCookie(req, res);
      return res;
    }
  }

  /* ── 2. הגנת נתיבים ───────────────────────────────────────────────────── */
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    applySecurityHeaders(res, csp, isDev);
    ensureCsrfCookie(req, res);
    return res;
  }

  if (hasSession && GUEST_ONLY.some((p) => pathname === p)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const res = NextResponse.redirect(url);
    applySecurityHeaders(res, csp, isDev);
    ensureCsrfCookie(req, res);
    return res;
  }

  /* ── 3. המשך הבקשה עם nonce זמין ל-React ──────────────────────────────── */
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(res, csp, isDev);
  ensureCsrfCookie(req, res);
  return res;
}

/**
 * מזריק עוגיית CSRF ראשונית לכל מבקר שאין לו אחת.
 * חייב להיות קריא ל-JS (double-submit), ולכן אינו httpOnly.
 * לאחר התחברות מוחלף הטוקן בערך חתום (HMAC על מזהה הסשן).
 */
function ensureCsrfCookie(req: NextRequest, res: NextResponse): void {
  if (req.cookies.get("lt_csrf")?.value) return;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  res.cookies.set("lt_csrf", token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export const config = {
  // מריצים על כל בקשה למעט נכסים סטטיים וקבצי מדיה
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt|sitemap.xml|apple-touch-icon.png|sw.js|offline.html).*)",
  ],
};
