import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { ToastProvider } from "@/components/ui/toast";
import { getCurrentUser } from "@/lib/session";

/** פריסת האתר הציבורי — כותרת, תוכן, כותרת תחתונה והתראות */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader user={user} />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          {children}
        </main>
        <SiteFooter />
      </div>
    </ToastProvider>
  );
}
