import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError, clientIp } from "@/lib/http";
import { all, get, run } from "@/lib/db";
import { logSecurityEvent, writeAudit } from "@/lib/audit";
import { optimizeDb, runMaintenance } from "@/server/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * ייצוא נתונים:
 *   ?type=my-data        → ייצוא אישי (GDPR) של המשתמש המחובר
 *   ?type=backup (owner) → גיבוי מלא של הקטלוג והמשתמשים (ללא סיסמאות/סודות)
 *   ?type=catalog        → ייצוא קטלוג בלבד (CSV/JSON) לייבוא במערכת אחרת
 *
 * אין ייצוא של: password_hash, twofa_secret, csrf_secret, token_hash — לעולם.
 */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", rateLimit: "api" }, async (ctx) => {
    const type = new URL(req.url).searchParams.get("type") ?? "my-data";
    const format = new URL(req.url).searchParams.get("format") ?? "json";

    /* ── ייצוא אישי (זכות עיון) ── */
    if (type === "my-data") {
      const userId = ctx.user!.id;
      const data = {
        exportedAt: new Date().toISOString(),
        account: get(
          `SELECT id, email, name, role, plan_code, locale, created_at, email_verified, twofa_enabled, marketing_opt_in, referral_code, coins
           FROM users WHERE id = ?`,
          [userId],
        ),
        profiles: all("SELECT name, is_kid, maturity_limit, created_at FROM profiles WHERE user_id = ?", [userId]),
        watchHistory: all(
          `SELECT t.name_he AS title, e.name_he AS episode, wp.percent, wp.completed, wp.updated_at
           FROM watch_progress wp JOIN titles t ON t.id = wp.title_id
           LEFT JOIN episodes e ON e.id = wp.episode_id WHERE wp.user_id = ?`,
          [userId],
        ),
        watchlist: all("SELECT t.name_he AS title, w.kind, w.created_at FROM watchlist w JOIN titles t ON t.id = w.title_id WHERE w.user_id = ?", [userId]),
        ratings: all("SELECT t.name_he AS title, r.stars, r.created_at FROM ratings r JOIN titles t ON t.id = r.title_id WHERE r.user_id = ?", [userId]),
        reviews: all("SELECT t.name_he AS title, r.headline, r.body, r.stars, r.created_at FROM reviews r JOIN titles t ON t.id = r.title_id WHERE r.user_id = ?", [userId]),
        comments: all("SELECT body, created_at FROM comments WHERE user_id = ?", [userId]),
        subscriptions: all("SELECT plan_code, status, started_at, current_period_end FROM subscriptions WHERE user_id = ?", [userId]),
        payments: all("SELECT amount, currency, status, invoice_no, created_at FROM payments WHERE user_id = ?", [userId]),
        sessions: all("SELECT device_label, ip, created_at, last_seen_at FROM sessions WHERE user_id = ?", [userId]),
      };
      return jsonOk(data, undefined, req);
    }

    /* ── גיבוי מלא / ייצוא קטלוג ── */
    const isBackup = type === "backup";
    if (isBackup && ctx.user!.role !== "owner") throw new ApiError("FORBIDDEN", 403, undefined, "גיבוי מלא דורש הרשאת בעלים");

    const includeUnpublished = ["editor", "admin", "owner"].includes(ctx.user!.role);
    const titles = all(
      `SELECT id, kind, slug, name_he, name_en, overview, year, runtime_min, maturity, plan_access, status, is_featured,
              is_original, quality_max, poster_url, backdrop_url, trailer_url, rating_imdb, created_at, updated_at
       FROM titles WHERE deleted_at IS NULL ${includeUnpublished ? "" : "AND status='published'"}`,
    );
    const episodes = all(
      `SELECT id, title_id, season_number, number, name_he, overview, runtime_sec, plan_access, status, thumb_url, air_date
       FROM episodes WHERE deleted_at IS NULL ${includeUnpublished ? "" : "AND status='published'"}`,
    );
    const seasons = all("SELECT id, title_id, number, name_he, plan_access FROM seasons");
    const genres = all("SELECT id, slug, name_he, icon FROM genres");
    const links = all("SELECT title_id, genre_id FROM title_genres");
    const collections = all("SELECT id, slug, name_he, layout, plan_access, is_auto, rule_json, sort_order FROM collections");
    const collectionItems = all("SELECT collection_id, title_id, sort_order FROM collection_titles");

    const payload: Record<string, unknown> = { exportedAt: new Date().toISOString(), titles, seasons, episodes, genres, links, collections, collectionItems };

    if (isBackup) {
      if (ctx.user!.role !== "owner") throw new ApiError("FORBIDDEN", 403);
      payload.users = all(
        `SELECT id, email, name, role, status, plan_code, created_at, last_login_at, referral_code, coins, max_profiles, mature_allowed
         FROM users WHERE deleted_at IS NULL`,
      );
      payload.plans = all("SELECT * FROM plans");
      payload.subscriptions = all("SELECT * FROM subscriptions");
      payload.payments = all("SELECT * FROM payments");
      payload.settings = all("SELECT key, value FROM settings");
      payload.featureFlags = all("SELECT key, enabled, rollout_pct FROM feature_flags");
      payload.auditTail = all("SELECT action, entity, entity_id, severity, created_at FROM audit_log ORDER BY id DESC LIMIT 500");

      // אופטימיזציה אוטומטית לפני גיבוי + לוג
      const maintenance = runMaintenance({ analyticsDays: 365 });
      const optimization = optimizeDb();
      payload.maintenance = { ...maintenance, ...optimization };

      writeAudit({ action: "admin.backup", entity: "database", severity: "critical", after: { tables: Object.keys(payload).length } }, { req, actorId: ctx.user!.id, actorEmail: ctx.user!.email });
      await logSecurityEvent({ kind: "backup_created", severity: "warning", ip: clientIp(req), userId: ctx.user!.id, detail: `format=${format}` });
    }

    if (format === "csv") {
      const header = "id,kind,slug,name_he,name_en,year,plan_access,status,rating_imdb";
      const rows = titles.map((t) => {
        const row = t as Record<string, unknown>;
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        return [row.id, row.kind, row.slug, esc(row.name_he), esc(row.name_en), row.year, row.plan_access, row.status, row.rating_imdb].join(",");
      });
      return new Response(`\uFEFF${header}\n${rows.join("\n")}`, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="lemontank-catalog-${Date.now()}.csv"`,
        },
      });
    }

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="lemontank-${isBackup ? "backup" : "catalog"}-${Date.now()}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}

/** ייבוא קטלוג מ-JSON (מנהל תוכן) */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", permission: "content.create", rateLimit: "write", maxBodyBytes: 8 * 1024 * 1024, audit: { action: "admin.export", entity: "catalog" } },
    async (ctx) => {
      const body = await ctx.body<{ titles?: unknown[]; genres?: unknown[] }>();
      const titles = Array.isArray(body?.titles) ? body.titles.slice(0, 5000) : [];
      if (!titles.length) throw new ApiError("BAD_REQUEST", 400, undefined, "לא נמצאו כותרים לייבוא");

      let imported = 0;
      let skipped = 0;

      for (const raw of titles) {
        const t = raw as Record<string, unknown>;
        const nameHe = String(t.name_he ?? "").slice(0, 160);
        if (!nameHe) {
          skipped++;
          continue;
        }
        const slugBase = String(t.slug ?? nameHe).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
        const exists = get<{ id: number }>("SELECT id FROM titles WHERE slug = ?", [slugBase]);
        if (exists) {
          skipped++;
          continue;
        }
        run(
          `INSERT INTO titles(kind, slug, name_he, name_en, overview, year, runtime_min, maturity, plan_access, status, poster_url, created_by, published_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            t.kind === "series" ? "series" : "movie",
            slugBase,
            nameHe,
            t.name_en ?? null,
            t.overview ?? null,
            t.year ?? null,
            t.runtime_min ?? null,
            typeof t.maturity === "string" ? t.maturity : "12+",
            t.plan_access === "plus" ? "plus" : "free",
            t.status === "published" ? "published" : "draft",
            t.poster_url ?? null,
            ctx.user!.id,
            t.status === "published" ? new Date().toISOString() : null,
          ],
        );
        imported++;
      }

      run(
        "INSERT INTO import_jobs(source, status, total, processed, failed, started_by, finished_at) VALUES('json','done',?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        [titles.length, imported, skipped, ctx.user!.id],
      );

      return jsonOk({ imported, skipped, total: titles.length, message: `יובאו ${imported} כותרים (${skipped} דולגו)` }, undefined, req);
    },
  );
}
