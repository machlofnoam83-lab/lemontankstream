import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { SITE } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: `${SITE.nameHe} — סרטים וסדרות בעברית`, template: `%s | ${SITE.nameHe}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: ["סרטים", "סדרות", "סטרימינג", "עברית", "צפייה ישירה", "LemonTank"],
  authors: [{ name: SITE.name }],
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: SITE.nameHe,
    title: `${SITE.nameHe} — סרטים וסדרות במקום אחד`,
    description: SITE.description,
  },
  twitter: { card: "summary_large_image", title: SITE.nameHe, description: SITE.description },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0d0d12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // nonce מוזרק ע"י ה-middleware; שימוש בו מאפשר ל-Next לחתום על הסקריפטים שלו
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const settings = getSettings();

  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://image.tmdb.org" />
        <meta name="color-scheme" content="dark" />
        {nonce ? <meta name="csp-nonce" content={nonce} /> : null}
      </head>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-[100] focus:rounded-lg focus:bg-lemon-400 focus:px-4 focus:py-2 focus:text-black"
        >
          דלג לתוכן הראשי
        </a>
        {settings.maintenance_mode ? (
          <div className="bg-lemon-400/20 border-b border-lemon-400/40 px-4 py-2 text-center text-sm text-lemon-200">
            🔧 {settings.maintenance_message}
          </div>
        ) : null}
        {settings.announcement ? (
          <div className="bg-plus-500/20 border-b border-plus-500/40 px-4 py-2 text-center text-sm text-plus-400">
            {settings.announcement}
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
