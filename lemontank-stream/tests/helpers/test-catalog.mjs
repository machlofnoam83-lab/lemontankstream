#!/usr/bin/env node
/**
 * כותר בדיקה זמני — לבדיקות שדורשות תוכן בקטלוג.
 *
 * האתר נשלח עם **קטלוג ריק בכוונה** (רק הבעלים מוסיף תוכן). לכן בדיקות
 * שדורשות "כותר כלשהו" לא יכולות להניח שיש תוכן — הן יוצרות כותר זמני
 * דרך ה-API (בדיוק כמו שהבעלים היה עושה), ומסירות אותו בסוף.
 *
 * הכל מסומן בקידומת מזוהה (`🧪 בדיקה`) כדי שלא יתבלבל עם תוכן אמיתי, וגם
 * אם ניקוי נכשל — קל למצוא ולמחוק אותו.
 */

const MARK = "🧪 בדיקה";
const PREFIX = "zz-test-";

export const TEST_TITLE_MARK = MARK;

/**
 * מחזיר כותר זמין: קיים מהקטלוג, ואם הקטלוג ריק — יוצר אחד זמני.
 * @returns {{ id: number, slug: string, created: boolean, item: object }}
 */
export async function ensureTestTitle(client, { name = "כותר בדיקה אוטומטי" } = {}) {
  const list = await client.get("/api/titles?limit=1");
  const existing = list.body?.data?.items?.[0] ?? list.body?.data?.titles?.[0] ?? null;
  if (existing) return { id: existing.id, slug: existing.slug, created: false, item: existing };

  const slug = `${PREFIX}${Date.now().toString(36)}`;
  const created = await client.post("/api/titles", {
    kind: "movie",
    name_he: `${MARK} — ${name}`,
    slug,
    overview: "כותר שנוצר אוטומטית על ידי חבילת הבדיקות. אין להשתמש בו כתוכן אמיתי.",
    year: 2026,
    runtime_min: 90,
    maturity: "12+",
    color: "#f5b301",
    plan_access: "free",
    status: "published",
    is_downloadable: true,
  });

  const item = created.body?.data?.title ?? created.body?.data ?? null;
  const id = item?.id ?? null;
  if (!id) {
    throw new Error(`יצירת כותר בדיקה נכשלה: ${JSON.stringify(created.body).slice(0, 200)}`);
  }
  return { id, slug: item.slug ?? slug, created: true, item };
}

/** מוסיף עונה ופרק לכותר בדיקה — לבדיקות שמדברות על פרקים */
export async function addTestEpisode(client, titleId) {
  const season = await client.post(`/api/titles/${titleId}/seasons`, { title_id: titleId, number: 1, name_he: "עונה 1" });
  const seasonId = season.body?.data?.season?.id ?? season.body?.data?.id ?? null;
  if (!seasonId) return null;
  const episode = await client.post(`/api/titles/${titleId}/episodes`, {
    title_id: titleId,
    season_id: seasonId,
    number: 1,
    name_he: "פרק בדיקה",
    runtime_min: 30,
  });
  return episode.body?.data?.episode?.id ?? episode.body?.data?.id ?? null;
}

/** הסרת כותר הבדיקה (ונכשל בשקט — ניקוי לא מפיל בדיקה) */
export async function removeTestTitle(client, id) {
  if (!id) return false;
  try {
    const res = await client.del(`/api/titles/${id}`);
    if (res.status === 200 || res.status === 204) return true;
  } catch {
    /* מתעלמים: ניקוי */
  }
  return false;
}

/** כל כותרי הבדיקה שנשארו בקטלוג (אם ניקוי נכשל בריצה קודמת) */
export async function leftoverTestTitles(client) {
  try {
    const list = await client.get("/api/titles?limit=100&q=%D7%91%D7%93%D7%99%D7%A7%D7%94");
    const items = list.body?.data?.items ?? list.body?.data?.titles ?? [];
    return items.filter((item) => String(item.slug ?? "").startsWith(PREFIX));
  } catch {
    return [];
  }
}
