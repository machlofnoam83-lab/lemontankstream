import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const DOCS: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: "תנאי שימוש",
    body: [
      "השימוש ב-LemonTank Stream מותנה בקבלת התנאים האלה. השירות מיועד לשימוש אישי וביתי בלבד.",
      "חשבון אישי: אין לשתף סיסמאות. מנוי פלוס מאפשר עד 4 מסכים במקביל; שימוש חריג מעבר לכך עלול להוביל להשעיה.",
      "תוכן: התוכן המוצג מוגן בזכויות יוצרים. אין להקליט, להוריד (למעט הורדה רשמית במסלול פלוס) או להפיץ תוכן מהשירות.",
      "חיובים: מנוי פלוס מחויב חודשית, ניתן לביטול בכל רגע. הביטול נכנס לתוקף בסוף התקופה ששולמה.",
      "הגבלת אחריות: השירות מסופק כפי שהוא (AS-IS). אנחנו משתדלים לזמינות גבוהה, אך לא מתחייבים לזמינות מלאה.",
    ],
  },
  privacy: {
    title: "מדיניות פרטיות",
    body: [
      "אנחנו אוספים את המידע המינימלי הנדרש כדי להפעיל את השירות: כתובת אימייל, שם, היסטוריית צפיות ומזהי מכשיר.",
      "סיסמאות נשמרות רק כגיבוב scrypt — אנחנו לא יכולים לקרוא אותן, גם לא אם תרצה.",
      "כתובות IP נשמרות לצורך אבטחה (זיהוי ניסיונות פריצה). באנליטיקה נשמר רק גיבוב אנונימי של ה-IP.",
      "אין מכירת מידע אישי לצדדים שלישיים. אין פרסום ממוקד על בסיס פרטים אישיים.",
      "זכות עיון ומחיקה: מהאזור האישי → פרטיות ונתונים אפשר לייצא את כל המידע שלך או למחוק את החשבון לצמיתות.",
      "עוגיות: עוגיית סשן (הכרחית, httpOnly) ועוגיית CSRF. אין עוגיות פרסום.",
    ],
  },
  accessibility: {
    title: "הצהרת נגישות",
    body: [
      "אנחנו שואפים לעמידה בתקן WCAG 2.2 ברמה AA ובתקן הישראלי ת\"י 5568.",
      "האתר תומך מלאה בכיווניות מימין-לשמאל (RTL), בניווט מקלדת מלא, בקיצורי מקלדת בנגן ובכתוביות.",
      "כל האלמנטים האינטראקטיביים כוללים תוויות ARIA, וקיים קישור 'דלג לתוכן הראשי'.",
      "אם נתקלת בבעיית נגישות — כתוב לנו דרך עמוד התמיכה ונטפל בזה בהקדם.",
    ],
  },
  dmca: {
    title: "הודעת זכויות יוצרים (DMCA)",
    body: [
      "אם אתה בעל זכויות וסבור שתוכן בפלטפורמה מפר את זכויותיך, שלח הודעה מסודרת עם: פרטי הזכות, הקישור המדויק לתוכן, ופרטי קשר.",
      "אנחנו מסירים תוכן מפר תוך 72 שעות מפנייה מאומתת, ומעדכנים את המגיש בפעולה שנעשתה.",
      "חשבונות שמפרים זכויות שוב ושוב ייחסמו לצמיתות.",
    ],
  },
  cookies: {
    title: "מדיניות עוגיות",
    body: [
      "עוגיית lt_session — הכרחית לניהול ההתחברות. httpOnly, SameSite=Lax. אינה מכילה מידע אישי, רק טוקן אקראי.",
      "עוגיית lt_csrf — הכרחית להגנת CSRF (double submit). קריאה ל-JS לצורך שליחת הכותרת המתאימה.",
      "אין עוגיות פרסום, אין עוגיות צד-שלישי, אין ריטרגטינג.",
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  const data = DOCS[doc];
  return { title: data ? data.title : "מסמך משפטי" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const data = DOCS[doc];
  if (!data) notFound();

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-black md:text-3xl">{data.title}</h1>
      <p className="text-xs text-ink-400">עדכון אחרון: {new Date().toLocaleDateString("he-IL")}</p>
      <div className="space-y-3 text-sm leading-relaxed text-ink-200">
        {data.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <p className="text-xs text-ink-400">שאלות? {SITE.supportEmail}</p>
    </article>
  );
}
