"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Alert, Button, Card, Checkbox, Field, Input, Select, Switch, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { AppSettings } from "@/lib/settings";

/** טופס הגדרות המערכת — כל שינוי נשמר בשרת ונרשם ביומן הביקורת */
export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<AppSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await apiCall<{ settings: AppSettings }>("/api/settings", { method: "PATCH", body: values });
    setBusy(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.push("ההגדרות נשמרו ✓", "success");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="p-5">
        <h2 className="text-sm font-bold">🏷️ מיתוג ותצוגה</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="שם האתר" htmlFor="site_name">
            <Input id="site_name" value={values.site_name} onChange={(e) => set("site_name", e.target.value)} maxLength={60} />
          </Field>
          <Field label="סלוגן" htmlFor="site_tagline">
            <Input id="site_tagline" value={values.site_tagline} onChange={(e) => set("site_tagline", e.target.value)} maxLength={120} />
          </Field>
          <div className="md:col-span-2">
            <Field label="הודעת הכרזה עליונה (ריק = ללא)" htmlFor="announcement">
              <Textarea id="announcement" value={values.announcement} onChange={(e) => set("announcement", e.target.value)} maxLength={200} className="min-h-16" />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold">⚙️ תפעול</h2>
        <div className="mt-2">
          <Switch
            checked={values.maintenance_mode}
            onChange={(v) => set("maintenance_mode", v)}
            label="מצב תחזוקה"
            description="מציג הודעת תחזוקה בראש האתר. המשתמשים עדיין יכולים לגלוש, אבל כדאי ליידע אותם."
          />
          <Field label="הודעת התחזוקה" htmlFor="maint_msg">
            <Input id="maint_msg" value={values.maintenance_message} onChange={(e) => set("maintenance_message", e.target.value)} maxLength={200} />
          </Field>
          <Switch checked={values.registration_open} onChange={(v) => set("registration_open", v)} label="הרשמה פתוחה" description="כיבוי חוסם יצירת חשבונות חדשים (בדיקת השרת, לא רק UI)." />
          <Switch checked={values.require_email_verification} onChange={(v) => set("require_email_verification", v)} label="חובת אימות אימייל" description="המשתמש יקבל הוראה לאמת את כתובת המייל." />
          <Switch checked={values.force_2fa_for_admins} onChange={(v) => set("force_2fa_for_admins", v)} label="חובת 2FA למנהלים" description="מומלץ בחום — מונע השתלטות על חשבון ניהול גם אם הסיסמה נחשפה." />
          <Switch checked={values.comments_enabled} onChange={(v) => set("comments_enabled", v)} label="תגובות" description="הפעלה/כיבוי של תגובות בכל האתר." />
          <Switch checked={values.reviews_require_approval} onChange={(v) => set("reviews_require_approval", v)} label="ביקורות דורשות אישור" description="ביקורות יופיעו רק אחרי אישור מנהל." />
          <Switch checked={values.downloads_enabled} onChange={(v) => set("downloads_enabled", v)} label="הורדות אופליין" description="זמין למנויי פלוס בלבד." />
          <Switch checked={values.kids_mode_enabled} onChange={(v) => set("kids_mode_enabled", v)} label="מצב ילדים" description="מאפשר יצירת פרופיל ילדים מוגבל תוכן." />
          <Switch checked={values.free_plan_has_ads} onChange={(v) => set("free_plan_has_ads", v)} label="פרסומות במסלול חינם" description="הצגת פרסומות למנויי חינם." />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold">💎 ברירות מחדל למנויים</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="מסלול הרשמה ברירת מחדל" htmlFor="signup_plan">
            <Select id="signup_plan" value={values.default_signup_plan} onChange={(e) => set("default_signup_plan", e.target.value as "free" | "plus")}>
              <option value="free">חינם</option>
              <option value="plus">פלוס</option>
            </Select>
          </Field>
          <Field label="ימי ניסיון" htmlFor="trial">
            <Input id="trial" type="number" value={values.trial_days} onChange={(e) => set("trial_days", Number(e.target.value))} min={0} max={90} />
          </Field>
          <Field label="מסכים במקביל (חינם)" htmlFor="ms-free">
            <Input id="ms-free" type="number" value={values.max_streams_free} onChange={(e) => set("max_streams_free", Number(e.target.value))} min={1} max={10} />
          </Field>
          <Field label="מסכים במקביל (פלוס)" htmlFor="ms-plus">
            <Input id="ms-plus" type="number" value={values.max_streams_plus} onChange={(e) => set("max_streams_plus", Number(e.target.value))} min={1} max={10} />
          </Field>
          <Field label="איכות מקסימלית (חינם)" htmlFor="q-free">
            <Select id="q-free" value={values.free_quality} onChange={(e) => set("free_quality", e.target.value as AppSettings["free_quality"])}>
              {["480p", "720p", "1080p"].map((q) => <option key={q} value={q}>{q}</option>)}
            </Select>
          </Field>
          <Field label="איכות מקסימלית (פלוס)" htmlFor="q-plus">
            <Select id="q-plus" value={values.plus_quality} onChange={(e) => set("plus_quality", e.target.value as AppSettings["plus_quality"])}>
              {["1080p", "1440p", "4K"].map((q) => <option key={q} value={q}>{q}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold">📞 יצירת קשר ו-SEO</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="אימייל תמיכה" htmlFor="contact_email">
            <Input id="contact_email" type="email" value={values.contact_email} onChange={(e) => set("contact_email", e.target.value)} dir="ltr" />
          </Field>
          <Field label="טלפון" htmlFor="contact_phone">
            <Input id="contact_phone" value={values.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} dir="ltr" />
          </Field>
          <div className="md:col-span-2">
            <Field label="מילות מפתח SEO (מופרד בפסיק)" htmlFor="seo_keywords">
              <Input id="seo_keywords" value={values.seo_keywords} onChange={(e) => set("seo_keywords", e.target.value)} maxLength={300} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold">🛡️ אבטחה</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="תוקף סשן (ימים)" htmlFor="session_ttl">
            <Input id="session_ttl" type="number" value={values.session_ttl_days} onChange={(e) => set("session_ttl_days", Number(e.target.value))} min={1} max={365} />
          </Field>
          <Field label="מקסימום ניסיונות התחברות" htmlFor="max_attempts">
            <Input id="max_attempts" type="number" value={values.max_login_attempts} onChange={(e) => set("max_login_attempts", Number(e.target.value))} min={3} max={50} />
          </Field>
          <Field label="שמירת יומן ביקורת (ימים)" htmlFor="audit_days">
            <Input id="audit_days" type="number" value={values.audit_retention_days} onChange={(e) => set("audit_retention_days", Number(e.target.value))} min={30} max={3650} />
          </Field>
        </div>
        <div className="mt-3">
          <Checkbox label="פרסומות במסלול חינם מושבתות למנויי פלוס גם כשהם מורידים" checked={false} disabled />
        </div>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} loading={busy} size="lg">שמור הגדרות</Button>
      </div>
    </div>
  );
}
