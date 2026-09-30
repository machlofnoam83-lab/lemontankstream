import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, run, tx, get } from "@/lib/db";
import { listCatalog, catalogStats } from "@/lib/catalog";
import { titleSchema, sanitizeText, sanitizeMultiline, slugify } from "@/lib/validate";
import { isStaff } from "@/lib/rbac";
import { getMaturityCeiling } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** רשימת כותרים — פומבית, עם סינון לפי הרשאת המנוי */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "optional" }, async (ctx) => {
    const sp = new URL(req.url).searchParams;
    const staff = isStaff(ctx.user?.role);

    // משתמש חינם לא רואה פריטי פלוס בהאשפה הכללית — הסינון נעשה ב-SQL
    // (ולא אחרי החלוקה לעמודים, אחרת המספר הכולל לא מתאים למה שמוצג).
    const isPlus = ctx.user?.effective_plan === "plus";
    const requestedPlan = (sp.get("plan") as "free" | "plus") || undefined;
    const effectivePlan = staff || isPlus || requestedPlan === "plus" ? requestedPlan : "free";

    // מצב ילדים: הפרופיל הפעיל מגביל את הגיל — הסינון מתבצע בשאילתה עצמה
    const ceiling = await getMaturityCeiling();

    const { items, total } = listCatalog({
      maturityMax: ceiling,
      kind: (sp.get("kind") as "movie" | "series") || undefined,
      plan: effectivePlan,
      genreSlug: sp.get("genre") || undefined,
      year: sp.get("year") ? Number(sp.get("year")) : undefined,
      q: sanitizeText(sp.get("q") ?? "", 80) || undefined,
      sort: sp.get("sort") ?? "trending",
      limit: Number(sp.get("limit") ?? 24),
      offset: Number(sp.get("offset") ?? 0),
      includeUnpublished: staff && sp.get("includeDrafts") === "1",
      originalsOnly: sp.get("originals") === "1",
      downloadableOnly: sp.get("downloadable") === "1",
    });

    return jsonOk({ items, total, stats: staff ? catalogStats() : undefined }, undefined, req);
  });
}

/** יצירת כותר חדש (סרט או סדרה) — עורך ומעלה */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    {
      auth: "required",
      permission: "content.create",
      rateLimit: "write",
      audit: { action: "title.create", entity: "title" },
    },
    async (ctx) => {
      const raw = await ctx.body<Record<string, unknown>>();
      const input = titleSchema.parse(raw);

      const slug = slugify(String(input.slug || input.name_he));
      const exists = get<{ id: number }>("SELECT id FROM titles WHERE slug = ?", [slug]);
      const finalSlug = exists ? `${slug}-${Date.now().toString(36).slice(-4)}` : slug;

      const id = tx(() => {
        const res = run(
          `INSERT INTO titles(kind, slug, name_he, name_en, tagline, overview, year, release_date, runtime_min, maturity,
                              country, language, director, cast_text, poster_url, backdrop_url, trailer_url, color,
                              plan_access, status, is_featured, is_original, is_downloadable, quality_max, rating_imdb,
                              keywords, seo_title, seo_description, scheduled_at, created_by, updated_by, published_at,
                              age_rating_age)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            input.kind,
            finalSlug,
            sanitizeText(input.name_he, 160),
            input.name_en ? sanitizeText(input.name_en, 160) : null,
            input.tagline ? sanitizeText(input.tagline, 200) : null,
            input.overview ? sanitizeMultiline(input.overview, 6000) : null,
            input.year ?? null,
            input.release_date ?? null,
            input.runtime_min ?? null,
            input.maturity,
            input.country ?? null,
            input.language,
            input.director ? sanitizeText(input.director, 160) : null,
            input.cast_text ? sanitizeText(input.cast_text, 1000) : null,
            input.poster_url ?? null,
            input.backdrop_url ?? null,
            input.trailer_url ?? null,
            input.color,
            input.plan_access,           // ← ההחלטה של האדמין: חינם / פלוס
            input.status,
            input.is_featured ? 1 : 0,
            input.is_original ? 1 : 0,
            input.is_downloadable ? 1 : 0,
            input.quality_max,
            input.rating_imdb ?? null,
            input.keywords ? sanitizeText(input.keywords, 500) : null,
            input.seo_title ? sanitizeText(input.seo_title, 200) : null,
            input.seo_description ? sanitizeText(input.seo_description, 400) : null,
            input.scheduled_at ?? null,
            ctx.user!.id,
            ctx.user!.id,
            input.status === "published" ? new Date().toISOString() : null,
            Number(input.maturity.replace("+", "")) || 12,
          ],
        );
        const newId = Number(res.lastInsertRowid);

        for (const genreId of input.genres ?? []) {
          run("INSERT OR IGNORE INTO title_genres(title_id, genre_id) VALUES(?,?)", [newId, genreId]);
        }
        // סדרה חדשה מקבלת עונה 1 ריקה כדי שאפשר להוסיף פרקים מיד
        if (input.kind === "series") {
          run("INSERT INTO seasons(title_id, number, name_he) VALUES(?, 1, 'עונה 1')", [newId]);
        }
        return newId;
      });

      const created = get<{ id: number; slug: string }>("SELECT id, slug FROM titles WHERE id = ?", [id]);
      return jsonOk({ id: created?.id, slug: created?.slug, message: "הכותר נוצר בהצלחה" }, { status: 201 }, req);
    },
  );
}

/** מחיקת כמה כותרים בבת אחת */
export async function DELETE(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", permission: "content.delete", audit: { action: "title.bulk_update", entity: "title", severity: "warning" } },
    async (ctx) => {
      const body = await ctx.body<{ ids?: number[] }>();
      const ids = Array.isArray(body?.ids) ? body.ids.slice(0, 200).map(Number).filter(Number.isFinite) : [];
      if (!ids.length) throw new ApiError("BAD_REQUEST", 400, undefined, "לא נבחרו כותרים");

      const placeholders = ids.map(() => "?").join(",");
      // Soft delete — שומרים על הנתונים וההיסטוריה
      const changes = run(
        `UPDATE titles SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), status='archived' WHERE id IN (${placeholders})`,
        ids,
      ).changes;

      void all;
      return jsonOk({ deleted: changes }, undefined, req);
    },
  );
}
