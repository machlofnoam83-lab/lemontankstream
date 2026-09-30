import type { NextConfig } from "next";

/**
 * LemonTank Stream — Next.js configuration
 *
 * הערות אבטחה:
 *  - כל כותרות האבטחה מוזרקות ב-middleware (כולל CSP עם nonce לכל בקשה).
 *  - אין כאן X-Frame-Options בכוונה: אנחנו משתמשים ב-CSP frame-ancestors
 *    כדי לאפשר גם תצוגה מקדימה מוטמעת (iframe) וגם הגנה מפני clickjacking.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,          // מסתיר X-Powered-By (הפחתת מידע לזיהוי גרסאות)
  compress: true,
  images: {
    // ללא sharp — תמונות מוגשות כמו שהן (חוסך תלות נייטיבית בסביבה הזו)
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    // קבצים גדולים (העלאת סרטונים) — ברירת המחדל קטנה מדי
    serverActions: { bodySizeLimit: "512mb" },
  },
  serverExternalPackages: [],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        // קבצים סטטיים — קאשינג אגרסיבי ובטוח
        source: "/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
