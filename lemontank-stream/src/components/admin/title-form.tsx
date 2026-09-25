"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client/api";
import { Alert, Button, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { MediaUploader } from "./media-uploader";
import { useToast } from "@/components/ui/toast";

type Genre = { id: number; name_he: string; icon: string | null };

export type TitleFormValues = {
  id?: number;
  kind: "movie" | "series";
  name_he: string;
  name_en: string;
  slug?: string;
  tagline: string;
  overview: string;
  year: string;
  runtime_min: string;
  maturity: string;
  country: string;
  director: string;
  cast_text: string;
  poster_url: string;
  backdrop_url: string;
  trailer_url: string;
  color: string;
  plan_access: "free" | "plus";
  status: "draft" | "scheduled" | "published" | "archived";
  quality_max: string;
  rating_imdb: string;
  keywords: string;
  seo_description: string;
  is_featured: boolean;
  is_original: boolean;
  is_downloadable: boolean;
  genres: number[];
};

const EMPTY: TitleFormValues = {
  kind: "movie",
  name_he: "",
  name_en: "",
  tagline: "",
  overview: "",
  year: String(new Date().getFullYear()),
  runtime_min: "",
  maturity: "12+",
  country: "ישראל",
  director: "",
  cast_text: "",
  poster_url: "",
  backdrop_url: "",
  trailer_url: "",
  color: "#f5b301",
  plan_access: "free",
  status: "draft",
  quality_max: "1080p",
  rating_imdb: "",
  keywords: "",
  seo_description: "",
  is_featured: false,
  is_original: false,
  is_downloadable: false,
  genres: [],
};

/**
 * טופס יצירה/עריכה של סרט או סדרה.
 * ההחלטה הקריטית: plan_access — האם הכותר חינם לכולם או זמין למנויי פלוס בלבד.
 */
export function TitleForm({ initial, genres, isNew = false }: { initial?: Partial<TitleFormValues>; genres: Genre[]; isNew?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<TitleFormValues>({ ...EMPTY, ...initial, genres: initial?.genres ?? [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof TitleFormValues>(key: K, value: TitleFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setError(null);
    if (values.name_he.trim().length < 1) {
      setError("חייב שם בעברית");
      return;
    }
    setSaving(true);

    const payload = {
      kind: values.kind,
      name_he: values.name_he,
      name_en: values.name_en || null,
      tagline: values.tagline || null,
      overview: values.overview || null,
      year: values.year ? Number(values.year) : null,
      runtime_min: values.runtime_min ? Number(values.runtime_min) : null,
      maturity: values.maturity,
      country: values.country || null,
      director: values.director || null,
      cast_text: values.cast_text || null,
      poster_url: values.poster_url || null,
      backdrop_url: values.backdrop_url || null,
      trailer_url: values.trailer_url || null,
      color: values.color,
      plan_access: values.plan_access,
      status: values.status,
      quality_max: values.quality_max,
      rating_imdb: values.rating_imdb ? Number(values.rating_imdb) : null,
      keywords: values.keywords || null,
      seo_description: values.seo_description || null,
      is_featured: values.is_featured,
      is_original: values.is_original,
      is_downloadable: values.is_downloadable,
      genres: values.genres,
    };

    const res = isNew
      ? await apiCall<{ id: number; slug: string }>("/api/titles", { method: "POST", body: payload })
      : await apiCall<{ item: { id: number } }>(`/api/titles/${values.id}`, { method: "PATCH", body: payload });

    setSaving(false);

    if (!res.ok) {
      setError(res.error.message);
      toast.push(res.error.message, "error");
      return;
    }

    toast.push(isNew ? "הכותר נוצר! אפשר להוסיף פרקים ומדיה 🎉" : "השינויים נשמרו ✓", "success");

    if (isNew) {
      const id = (res.data as { id: number }).id;
      router.push(`/admin/titles/${id}`);
    } else {
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="p-5">
        <h2 className="text-sm font-bold">פרטים בסיסיים</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="סוג התוכן" required>
            <Select value={values.kind} onChange={(e) => set("kind", e.target.value as "movie" | "series")}>
              <option value="movie">🎬 סרט</option>
              <option value="series">📺 סדרה</option>
            </Select>
          </Field>

          <Field label="שם בעברית" required htmlFor="name_he">
            <Input id="name_he" value={values.name_he} onChange={(e) => set("name_he", e.target.value)} placeholder="לדוגמה: החופשה הגדולה" maxLength={160} />
          </Field>

          <Field label="שם באנגלית" htmlFor="name_en">
            <Input id="name_en" value={values.name_en} onChange={(e) => set("name_en", e.target.value)} dir="ltr" placeholder="The Big Vacation" maxLength={160} />
          </Field>

          <Field label="סלוגן (tagline)" htmlFor="tagline">
            <Input id="tagline" value={values.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="הקיץ שלא יישכח" maxLength={200} />
          </Field>

          <Field label="שנת יציאה" htmlFor="year">
            <Input id="year" type="number" value={values.year} onChange={(e) => set("year", e.target.value)} min={1890} max={2100} />
          </Field>

          <Field label={values.kind === "movie" ? "אורך (דקות)" : "אורך פרק טיפוסי (דקות)"} htmlFor="runtime">
            <Input id="runtime" type="number" value={values.runtime_min} onChange={(e) => set("runtime_min", e.target.value)} min={1} max={600} />
          </Field>

          <Field label="דירוג גיל" htmlFor="maturity">
            <Select id="maturity" value={values.maturity} onChange={(e) => set("maturity", e.target.value)}>
              {["0+", "7+", "12+", "16+", "18+"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>

          <Field label="איכות מקסימלית" htmlFor="quality">
            <Select id="quality" value={values.quality_max} onChange={(e) => set("quality_max", e.target.value)}>
              {["480p", "720p", "1080p", "1440p", "4K"].map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </Select>
          </Field>

          <Field label="במאי" htmlFor="director">
            <Input id="director" value={values.director} onChange={(e) => set("director", e.target.value)} maxLength={160} />
          </Field>

          <Field label="שחקנים (מופרד בפסיק)" htmlFor="cast">
            <Input id="cast" value={values.cast_text} onChange={(e) => set("cast_text", e.target.value)} placeholder="ליאור אשכנזי, רותם סלע" maxLength={1000} />
          </Field>

          <div className="md:col-span-2">
            <Field label="תקציר" htmlFor="overview" hint="2–4 משפטים עלילתיים. זה מה שמופיע בעמוד הכותר ובכרטיס.">
              <Textarea id="overview" value={values.overview} onChange={(e) => set("overview", e.target.value)} maxLength={6000} className="min-h-28" />
            </Field>
          </div>

          <Field label="מילות מפתח לחיפוש" htmlFor="keywords">
            <Input id="keywords" value={values.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="קומדיה, משפחה, קיץ" maxLength={500} />
          </Field>

          <Field label="תיאור SEO" htmlFor="seo">
            <Input id="seo" value={values.seo_description} onChange={(e) => set("seo_description", e.target.value)} maxLength={400} />
          </Field>
        </div>
      </Card>

      {/* ── הרשאת גישה: ההחלטה של האדמין ── */}
      <Card className="border-lemon-400/25 p-5">
        <h2 className="text-sm font-bold">🔑 הרשאת צפייה (חינם / פלוס)</h2>
        <p className="mt-1 text-xs text-ink-400">
          כאן קובעים מי יכול לצפות בכותר. האכיפה מתבצעת בשרת — משתמש במסלול חינם לא יקבל קישור וידאו לתוכן פלוס.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className={`cursor-pointer rounded-xl border p-3 ${values.plan_access === "free" ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10"}`}>
            <input type="radio" name="plan_access" className="sr-only" checked={values.plan_access === "free"} onChange={() => set("plan_access", "free")} />
            <div className="font-bold text-emerald-400">🆓 חינם לכולם</div>
            <p className="mt-1 text-[11px] text-ink-400">גם משתמשים ללא מנוי (עם פרסומות).</p>
          </label>
          <label className={`cursor-pointer rounded-xl border p-3 ${values.plan_access === "plus" ? "border-plus-500/50 bg-plus-500/10" : "border-white/10"}`}>
            <input type="radio" name="plan_access" className="sr-only" checked={values.plan_access === "plus"} onChange={() => set("plan_access", "plus")} />
            <div className="font-bold text-plus-400">⭐ פלוס בלבד</div>
            <p className="mt-1 text-[11px] text-ink-400">רק מנויי פלוס. משתמש חינם יראה מסך שדרוג.</p>
          </label>
          <Field label="סטטוס פרסום">
            <Select value={values.status} onChange={(e) => set("status", e.target.value as TitleFormValues["status"])}>
              <option value="draft">טיוטה (לא גלוי באתר)</option>
              <option value="published">מפורסם (גלוי לכולם)</option>
              <option value="scheduled">מתוזמן</option>
              <option value="archived">ארכיון</option>
            </Select>
          </Field>
        </div>
      </Card>

      {/* ── מדיה ── */}
      <Card className="p-5">
        <h2 className="text-sm font-bold">🖼️ תמונות וטריילר</h2>
        <p className="mt-1 text-xs text-ink-400">פוסטר אנכי (2:3), תמונת רקע אופקית (16:9) וטריילר MP4/WebM.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <MediaUploader
            kind="image"
            label="פוסטר (אנכי)"
            accept="image/jpeg,image/png,image/webp,image/avif"
            attach={values.id ? "poster" : undefined}
            titleId={values.id}
            hint="JPG/PNG/WebP עד 8MB"
            currentUrl={values.poster_url || null}
            onUploaded={({ url }) => { if (url) set("poster_url", url); }}
          />
          <MediaUploader
            kind="image"
            label="תמונת רקע (אופקי)"
            accept="image/jpeg,image/png,image/webp,image/avif"
            attach={values.id ? "backdrop" : undefined}
            titleId={values.id}
            currentUrl={values.backdrop_url || null}
            onUploaded={({ url }) => { if (url) set("backdrop_url", url); }}
          />
          <MediaUploader
            kind="trailer"
            label="טריילר"
            accept="video/mp4,video/webm"
            attach={values.id ? "trailer" : undefined}
            titleId={values.id}
            hint="MP4/WebM — עד 2GB"
            currentUrl={values.trailer_url || null}
            onUploaded={({ url }) => { if (url) set("trailer_url", url); }}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="צבע דומיננטי" htmlFor="color" hint="משמש כגרדיאנט כשאין פוסטר">
            <Input id="color" type="color" value={values.color} onChange={(e) => set("color", e.target.value)} className="h-11 w-24 p-1" />
          </Field>
        </div>
      </Card>

      {/* ── ז'אנרים ודגלים ── */}
      <Card className="p-5">
        <h2 className="text-sm font-bold">🏷️ ז'אנרים ותכונות</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {genres.map((g) => {
            const active = values.genres.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => set("genres", active ? values.genres.filter((id) => id !== g.id) : [...values.genres, g.id])}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-lemon-400 bg-lemon-400/20 text-lemon-200" : "border-white/15 text-ink-300 hover:bg-white/10"}`}
              >
                {g.icon} {g.name_he}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <Checkbox label="⭐ מומלץ (בבאנר הראשי)" checked={values.is_featured} onChange={(e) => set("is_featured", e.target.checked)} />
          <Checkbox label="🍋 מקורי LemonTank" checked={values.is_original} onChange={(e) => set("is_original", e.target.checked)} />
          <Checkbox label="⬇️ ניתן להורדה (פלוס)" checked={values.is_downloadable} onChange={(e) => set("is_downloadable", e.target.checked)} />
        </div>

        <Field label="דירוג IMDb" htmlFor="imdb" hint="אופציונלי — מוצג בכרטיס">
          <Input id="imdb" type="number" step="0.1" min={0} max={10} value={values.rating_imdb} onChange={(e) => set("rating_imdb", e.target.value)} className="max-w-32" />
        </Field>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="subtle" onClick={() => router.back()} type="button">ביטול</Button>
        <Button onClick={save} loading={saving} size="lg" type="button">
          {isNew ? "צור כותר" : "שמור שינויים"}
        </Button>
      </div>
    </div>
  );
}
