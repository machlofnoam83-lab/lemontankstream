import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "התחברות", description: "התחבר לחשבון LemonTank Stream שלך" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : "/";

  return (
    <div className="card-surface rounded-2xl p-6 md:p-8">
      <h1 className="text-2xl font-black">ברוך שובך 👋</h1>
      <p className="mt-1 text-sm text-ink-400">התחבר כדי להמשיך לצפות מהמקום שעצרת.</p>

      {params.reset === "1" ? (
        <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          הסיסמה הוחלפה בהצלחה — אפשר להתחבר עכשיו.
        </p>
      ) : null}

      <LoginForm next={next} />
    </div>
  );
}
