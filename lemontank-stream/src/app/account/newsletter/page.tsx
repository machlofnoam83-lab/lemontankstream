import type { Metadata } from "next";
import { Card } from "@/components/ui/primitives";
import { NewsletterPreferences } from "@/components/site/newsletter-form";
import { get } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "עדכונים במייל", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  const user = await requireUser();
  const row = get<{ marketing_opt_in: number }>("SELECT marketing_opt_in FROM users WHERE id = ?", [user.id]);
  const subscriber = get<{ confirmed: number; created_at: string }>(
    "SELECT confirmed, created_at FROM newsletter_subscribers WHERE email_norm = ?",
    [user.email.toLowerCase()],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">📬 עדכונים במייל</h1>
        <p className="mt-1 text-ink-300">מה חדש בקטלוג, בכותרות מקוריות ובתכונות חדשות — פעם בשבוע, בלי ספאם.</p>
      </header>

      <NewsletterPreferences
        email={user.email}
        marketingOptIn={Boolean(row?.marketing_opt_in)}
        confirmed={Boolean(subscriber?.confirmed)}
        subscribedAt={subscriber?.created_at ?? null}
      />

      <Card className="p-4">
        <h2 className="text-lg font-bold">מה נשלח?</h2>
        <ul className="mt-2 space-y-1.5 text-[0.95rem] text-ink-300">
          <li>· 🎬 כותרים חדשים שנוספו השבוע</li>
          <li>· ⭐ המלצות אישיות לפי מה שצפית</li>
          <li>· 🎁 הטבות ומבצעים לחברי פלוס</li>
          <li>· 🚀 תכונות חדשות באתר</li>
        </ul>
        <p className="mt-3 text-[0.85rem] text-ink-400">
          אפשר להסיר בכל רגע, בלחיצה אחת — בלי לשאול שאלות ובלי לפגוע בחשבון.
        </p>
      </Card>
    </div>
  );
}
