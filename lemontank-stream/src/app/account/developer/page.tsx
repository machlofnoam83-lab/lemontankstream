import type { Metadata } from "next";
import { Card } from "@/components/ui/primitives";
import { DeveloperKeys } from "@/components/site/developer-keys";
import { listApiKeys } from "@/lib/apikeys";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "מפתחים ו-API", robots: { index: false } };
export const dynamic = "force-dynamic";

const EXAMPLES = [
  {
    title: "הקטלוג שלי",
    desc: "כל הסרטים והסדרות שפורסמו",
    code: `curl -H "Authorization: Bearer lt_live_…" \\
  "https://lemontank.co.il/api/v1/titles?limit=20"`,
  },
  {
    title: "חיפוש",
    desc: "חיפוש חופשי לפי שם",
    code: `curl -H "Authorization: Bearer lt_live_…" \\
  "https://lemontank.co.il/api/v1/titles?q=מטריקס"`,
  },
  {
    title: "כותר בודד",
    desc: "כל הפרטים + רשימת הפרקים",
    code: `curl -H "Authorization: Bearer lt_live_…" \\
  "https://lemontank.co.il/api/v1/titles/the-matrix"`,
  },
  {
    title: "הפרופיל שלי",
    desc: "מי אני והסטטיסטיקות שלי",
    code: `curl -H "Authorization: Bearer lt_live_…" \\
  "https://lemontank.co.il/api/v1/me"`,
  },
];

export default async function DeveloperPage() {
  const user = await requireUser();
  const keys = listApiKeys(user.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">🔑 מפתחים ו-API</h1>
        <p className="mt-1 text-ink-300">
          גישה לקטלוג שלך מתוכניות חיצוניות, בוטים או אתרים — עם מפתח אישי, מכסה משלו וביטול מיידי.
        </p>
      </header>

      <DeveloperKeys initial={keys} />

      <Card className="p-4">
        <h2 className="text-xl font-bold">איך משתמשים</h2>
        <p className="mt-1 text-[0.95rem] text-ink-300">
          כל בקשה נושאת כותרת <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono" dir="ltr">Authorization: Bearer &lt;המפתח&gt;</code>.
          המפתח עובד מהשרת שלך בלבד — <b>אסור</b> לשים אותו בקוד דפדפן, אחרת כל מי שיפתח את הכלי יראה אותו.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {EXAMPLES.map((example) => (
            <div key={example.title} className="rounded-xl bg-black/40 p-3">
              <div className="font-bold">{example.title}</div>
              <div className="text-[0.85rem] text-ink-400">{example.desc}</div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[0.8rem] text-lemon-200" dir="ltr">
                {example.code}
              </pre>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-xl font-bold">מגבלות ושימוש הוגן</h2>
        <ul className="mt-2 space-y-1.5 text-[0.95rem] text-ink-300">
          <li>· כל מפתח נושא מכסה משלו (ברירת מחדל 120 בקשות בדקה).</li>
          <li>· המפתחות נשמרים כ-Hash בלבד — גם אנחנו לא יכולים לקרוא אותם.</li>
          <li>· ביטול מפתח הוא מיידי, בלי לפגוע בשאר המפתחות.</li>
          <li>· שימוש לרעה (עומס, scraping אגרסיבי) מפעיל את מערכת האבטחה וחוסם את הכתובת.</li>
          <li>· פרטי תשלום, סיסמאות ותוכן מוגן בפלוס — לא נגישים דרך ה-API.</li>
        </ul>
      </Card>
    </div>
  );
}
