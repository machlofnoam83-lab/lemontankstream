import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { Icon } from "@/components/ui/icons";
import { OrnamentRule } from "@/components/ui/ornaments";

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
    <div className="card-surface chamfer relative animate-ink-in p-6 md:p-8">
      <span aria-hidden="true" className="pointer-events-none absolute inset-[6px] border border-brass-400/10 chamfer" />

      <div className="relative">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.3em] text-brass-300/80">כניסה</p>
        <h1 className="mt-2 flex items-center gap-2 font-display text-2xl font-bold text-parchment-50 md:text-3xl">
          <Icon name="lantern" className="size-6 text-brass-300" />
          ברוך שובך
        </h1>
        <p className="mt-1.5 text-sm text-parchment-200/75">התחבר כדי להמשיך מהמקום שעצרת.</p>

        {params.reset === "1" ? (
          <p className="mt-4 flex items-start gap-2 border border-verdigris-400/40 bg-verdigris-400/10 px-4 py-3 text-sm text-verdigris-300 chamfer animate-ink-in">
            <Icon name="check" className="mt-0.5 size-4 shrink-0" />
            הסיסמה הוחלפה בהצלחה — אפשר להתחבר עכשיו.
          </p>
        ) : null}

        <LoginForm next={next} />

        <OrnamentRule className="mt-6" />
      </div>
    </div>
  );
}
