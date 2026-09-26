"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall, uploadWithProgress } from "@/lib/client/api";
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { MediaUploader } from "./media-uploader";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatDuration, formatBytes } from "@/lib/format";

export type AdminSeason = { id: number; number: number; name_he: string | null; episodes_count: number; plan_access: string };

export type AdminEpisode = {
  id: number;
  season_id: number;
  season_number: number;
  number: number;
  name_he: string;
  overview: string | null;
  runtime_sec: number;
  thumb_url: string | null;
  video_url: string | null;
  plan_access: string;
  status: string;
  air_date: string | null;
  effective_access?: string;
  video_asset_id?: number | null;
};

/**
 * ניהול הפרקים של סדרה — הוספה, עריכה, העלאת וידאו/תמונה לכל פרק,
 * וקביעת הרשאה (חינם / פלוס / יורש מהסדרה) לכל פרק בנפרד.
 */
export function EpisodeManager({
  titleId,
  titleName,
  seasons,
  episodes,
  titlePlan,
}: {
  titleId: number;
  titleName: string;
  seasons: AdminSeason[];
  episodes: AdminEpisode[];
  titlePlan: "free" | "plus";
}) {
  const router = useRouter();
  const toast = useToast();

  const [seasonNumber, setSeasonNumber] = useState(seasons[0]?.number ?? 1);
  const [openEditor, setOpenEditor] = useState(false);
  const [editing, setEditing] = useState<AdminEpisode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; percent: number } | null>(null);

  // שדות הטופס
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [overview, setOverview] = useState("");
  const [runtime, setRuntime] = useState("");
  const [airDate, setAirDate] = useState("");
  const [planAccess, setPlanAccess] = useState<"inherit" | "free" | "plus">("inherit");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [thumbUrl, setThumbUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoAssetId, setVideoAssetId] = useState<number | null>(null);
  const [introStart, setIntroStart] = useState("");
  const [introEnd, setIntroEnd] = useState("");

  const [newSeasonNumber, setNewSeasonNumber] = useState("");
  const [newSeasonName, setNewSeasonName] = useState("");

  const filtered = useMemo(
    () => episodes.filter((e) => e.season_number === seasonNumber).sort((a, b) => a.number - b.number),
    [episodes, seasonNumber],
  );

  const resetForm = (ep?: AdminEpisode) => {
    setEditing(ep ?? null);
    setName(ep?.name_he ?? "");
    setNumber(String(ep?.number ?? (filtered.length ? Math.max(...filtered.map((f) => f.number)) + 1 : 1)));
    setOverview(ep?.overview ?? "");
    setRuntime(ep ? String(Math.round(ep.runtime_sec / 60)) : "");
    setAirDate(ep?.air_date ?? "");
    setPlanAccess((ep?.plan_access as "inherit" | "free" | "plus") ?? "inherit");
    setStatus((ep?.status as "draft" | "published") ?? "draft");
    setThumbUrl(ep?.thumb_url ?? "");
    setVideoUrl(ep?.video_url ?? "");
    setVideoAssetId(null);
    setIntroStart("");
    setIntroEnd("");
    setError(null);
    setOpenEditor(true);
  };

  const currentSeason = seasons.find((s) => s.number === seasonNumber);

  const saveEpisode = async () => {
    setError(null);
    if (!currentSeason) {
      setError("צריך לבחור עונה");
      return;
    }
    if (name.trim().length < 1) {
      setError("צריך שם לפרק");
      return;
    }

    setBusy(true);
    const body = {
      title_id: titleId,
      season_id: currentSeason.id,
      season_number: currentSeason.number,
      number: Number(number || 1),
      name_he: name,
      overview: overview || null,
      runtime_sec: runtime ? Number(runtime) * 60 : 0,
      air_date: airDate || null,
      thumb_url: thumbUrl || null,
      video_url: videoUrl || null,
      video_asset_id: videoAssetId,
      plan_access: planAccess,
      status,
      intro_start_sec: introStart ? Number(introStart) : null,
      intro_end_sec: introEnd ? Number(introEnd) : null,
    };

    const res = editing
      ? await apiCall(`/api/episodes/${editing.id}`, { method: "PATCH", body })
      : await apiCall(`/api/titles/${titleId}/episodes`, { method: "POST", body });

    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }

    toast.push(editing ? "הפרק עודכן ✓" : "הפרק נוסף לסדרה 🎉", "success");
    setOpenEditor(false);
    router.refresh();
  };

  const deleteEpisode = async (ep: AdminEpisode) => {
    if (!confirm(`למחוק את "${ep.name_he}"? הפעולה תסיר את הפרק מהסדרה.`)) return;
    const res = await apiCall(`/api/episodes/${ep.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push("הפרק נמחק", "info");
    router.refresh();
  };

  const addSeason = async () => {
    const num = Number(newSeasonNumber || (seasons.length ? Math.max(...seasons.map((s) => s.number)) + 1 : 1));
    const res = await apiCall(`/api/titles/${titleId}/seasons`, {
      method: "POST",
      body: { title_id: titleId, number: num, name_he: newSeasonName || `עונה ${num}` },
    });
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push("העונה נוספה", "success");
    setNewSeasonNumber("");
    setNewSeasonName("");
    setSeasonNumber(num);
    router.refresh();
  };

  /** העלאת קובץ וידאו ישירות מתוך עורך הפרק */
  const uploadVideoForEpisode = async (file: File) => {
    setUploadProgress({ name: file.name, percent: 0 });
    const res = await uploadWithProgress<{ asset: { id: number; url: string; bytes: number; mime: string } }>(
      "/api/upload",
      file,
      { kind: "video", title_id: String(titleId), ...(editing ? { episode_id: String(editing.id) } : {}) },
      (p) => setUploadProgress({ name: file.name, percent: p }),
    );
    setUploadProgress(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setVideoAssetId(res.data.asset.id);
    setVideoUrl(res.data.asset.url);
    toast.push(`הווידאו הועלה (${formatBytes(res.data.asset.bytes)}) — שמור כדי לשייך לפרק`, "success");
  };

  return (
    <div className="space-y-4">
      {/* ── סרגל עונות ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {seasons.map((s) => (
            <button
              key={s.id}
              onClick={() => setSeasonNumber(s.number)}
              className={`whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm ${
                seasonNumber === s.number ? "border-lemon-400 bg-lemon-400/15 font-bold text-lemon-200" : "border-white/10 hover:bg-white/10"
              }`}
            >
              {s.name_he ?? `עונה ${s.number}`} <span className="text-[0.8rem] text-ink-400">({s.episodes_count})</span>
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Input
            value={newSeasonNumber}
            onChange={(e) => setNewSeasonNumber(e.target.value.replace(/\D/g, ""))}
            placeholder="מס' עונה"
            className="w-24"
            aria-label="מספר עונה חדשה"
          />
          <Input value={newSeasonName} onChange={(e) => setNewSeasonName(e.target.value)} placeholder="שם העונה (אופציונלי)" className="w-40" aria-label="שם עונה חדשה" />
          <Button variant="ghost" onClick={addSeason} type="button">+ עונה</Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">
          פרקי {currentSeason?.name_he ?? `עונה ${seasonNumber}`} ({filtered.length})
        </h2>
        <Button onClick={() => resetForm()} disabled={!seasons.length} type="button">+ הוסף פרק</Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-ink-400">
          עוד אין פרקים בעונה הזו. לחץ "הוסף פרק" כדי להעלות את הפרק הראשון — תמונה, וידאו וכתוביות.
        </Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((ep) => {
            const access = ep.plan_access === "inherit" ? titlePlan : ep.plan_access;
            return (
              <li key={ep.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <span className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                  {ep.thumb_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ep.thumb_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xl">▶</span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="text-sm">פרק {ep.number}: {ep.name_he}</b>
                    {access === "plus" ? <Badge tone="plus">⭐ פלוס</Badge> : <Badge tone="free">חינם</Badge>}
                    {ep.plan_access === "inherit" ? <Badge tone="neutral">יורש מהסדרה</Badge> : null}
                    <Badge tone={ep.status === "published" ? "success" : "warn"}>{ep.status === "published" ? "מפורסם" : "טיוטה"}</Badge>
                    {ep.video_url || ep.video_asset_id ? <Badge tone="info">יש וידאו</Badge> : <Badge tone="danger">בלי וידאו</Badge>}
                  </span>
                  <span className="mt-1 block text-[0.85rem] text-ink-400">
                    {ep.runtime_sec ? formatDuration(ep.runtime_sec) : "אורך לא צוין"}
                    {ep.air_date ? ` · שודר ${ep.air_date}` : ""}
                  </span>
                </span>

                <span className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => resetForm(ep)} type="button">עריכה</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteEpisode(ep)} type="button">מחיקה</Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── עורך פרק ── */}
      <Modal
        open={openEditor}
        onClose={() => setOpenEditor(false)}
        title={editing ? `עריכת פרק ${editing.number}` : `הוספת פרק ל${titleName}`}
        size="lg"
        footer={
          <>
            <Button variant="subtle" onClick={() => setOpenEditor(false)} type="button">ביטול</Button>
            <Button onClick={saveEpisode} loading={busy} type="button">{editing ? "שמור פרק" : "הוסף פרק"}</Button>
          </>
        }
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="שם הפרק בעברית" required htmlFor="ep-name">
            <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: הסוד של דנה" maxLength={200} />
          </Field>
          <Field label="מספר פרק" required htmlFor="ep-number">
            <Input id="ep-number" type="number" min={0} value={number} onChange={(e) => setNumber(e.target.value)} />
          </Field>
          <Field label="אורך (דקות)" htmlFor="ep-runtime">
            <Input id="ep-runtime" type="number" value={runtime} onChange={(e) => setRuntime(e.target.value)} placeholder="42" />
          </Field>
          <Field label="תאריך שידור" htmlFor="ep-air">
            <Input id="ep-air" type="date" value={airDate} onChange={(e) => setAirDate(e.target.value)} />
          </Field>
        </div>

        <Field label="תקציר הפרק" htmlFor="ep-overview">
          <Textarea id="ep-overview" value={overview} onChange={(e) => setOverview(e.target.value)} maxLength={4000} className="min-h-20" />
        </Field>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="הרשאת צפייה לפרק" htmlFor="ep-plan" hint="ברירת מחדל: יורש מהסדרה">
            <Select id="ep-plan" value={planAccess} onChange={(e) => setPlanAccess(e.target.value as "inherit" | "free" | "plus")}>
              <option value="inherit">יורש מהסדרה ({titlePlan === "plus" ? "פלוס" : "חינם"})</option>
              <option value="free">🆓 חינם לכולם</option>
              <option value="plus">⭐ פלוס בלבד</option>
            </Select>
          </Field>
          <Field label="סטטוס" htmlFor="ep-status">
            <Select id="ep-status" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")}>
              <option value="draft">טיוטה</option>
              <option value="published">מפורסם (זמין לצפייה)</option>
            </Select>
          </Field>
        </div>

        {/* ── מדיה לפרק ── */}
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <h3 className="text-sm font-bold">🎥 וידאו הפרק</h3>

          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg bg-lemon-400 px-3 py-2 text-xs font-bold text-ink-900">
              העלה קובץ וידאו
              <input
                type="file"
                accept="video/mp4,video/webm,video/x-matroska"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadVideoForEpisode(f);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="text-[0.85rem] text-ink-400">או הדבק קישור ישיר (mp4/m3u8) בשדה למטה</span>
          </div>

          {uploadProgress ? (
            <div>
              <div className="flex justify-between text-[0.85rem] text-ink-300">
                <span className="truncate">{uploadProgress.name}</span>
                <span>{uploadProgress.percent}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-lemon-400 transition-all" style={{ width: `${uploadProgress.percent}%` }} />
              </div>
            </div>
          ) : null}

          <Field label="כתובת וידאו (URL)" htmlFor="ep-video">
            <Input id="ep-video" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} dir="ltr" placeholder="https://cdn.example.com/episode01.mp4" />
          </Field>

          {videoAssetId ? <p className="text-[0.85rem] text-emerald-400">✓ הקובץ שהועלה ישויך לפרק בעת השמירה (נכס #{videoAssetId})</p> : null}
        </div>

        <MediaUploader
          kind="image"
          label="תמונת הפרק (thumbnail)"
          accept="image/jpeg,image/png,image/webp"
          episodeId={editing?.id}
          attach={editing ? "thumb" : undefined}
          currentUrl={thumbUrl || null}
          hint="מומלץ 1280x720"
          onUploaded={({ url }) => setThumbUrl(url)}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="תחילת פתיח (שניות)" htmlFor="intro-s">
            <Input id="intro-s" type="number" value={introStart} onChange={(e) => setIntroStart(e.target.value)} placeholder="15" />
          </Field>
          <Field label="סוף פתיח (שניות)" htmlFor="intro-e">
            <Input id="intro-e" type="number" value={introEnd} onChange={(e) => setIntroEnd(e.target.value)} placeholder="75" />
          </Field>
        </div>
        <p className="text-[0.85rem] text-ink-400">
          אם תמלא את זמני הפתיח, יציג הנגן כפתור "דלג על פתיח" בדיוק בזמן.
        </p>
      </Modal>
    </div>
  );
}
