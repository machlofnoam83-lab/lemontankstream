#!/usr/bin/env node
/**
 * ייבוא קטלוג אמיתי — סרטים וסדרות אמיתיים, עם פוסטרים מוויקיפדיה.
 *
 *   node scripts/seed-real-catalog.mjs                 → מוסיף/מעדכן את הקטלוג (בלי כפילויות)
 *   node scripts/seed-real-catalog.mjs --posters       → גם שולף תמונות מוויקיפדיה (מטמון מקומי)
 *   node scripts/seed-real-catalog.mjs --offline       → בלי רשת: משתמש במטמון בלבד
 *   node scripts/seed-real-catalog.mjs --reset         → מוחק את כותרי הקטלוג הזה ומייבא מחדש
 *   node scripts/seed-real-catalog.mjs --collections   → גם בונה אוספים (שורות) לבית
 *
 * מהיכן הנתונים:
 *   • scripts/data/catalog-movies-a.mjs, catalog-movies-b.mjs,
 *     catalog-series.mjs, catalog-israeli.mjs — המטא-דאטה (שם, שנה, ז'אנרים, תקציר…)
 *   • he.wikipedia — שם הכותר בעברית (רשמי, אם קיים)
 *   • en.wikipedia — תמונת הפוסטר. התוצאות נשמרות במטמון scripts/data/enrichment.json
 *
 * ⚠️ זכויות יוצרים: הפוסטרים מוויקיפדיה אינם חופשיים לשימוש מסחרי.
 *    הם מיועדים לזיהוי הכותר ולהתרשמות בלבד. לפני עלייה לאוויר החליפו אותם
 *    בתמונות שלכם (או בחומר שקיבלתם ברישיון) דרך /admin/titles.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = new Set(process.argv.slice(2));
const doReset = args.has("--reset");
const fetchPosters = args.has("--posters") || args.has("--net");
const offline = args.has("--offline");
const buildCollections = args.has("--collections");

/* ── מיקום המסד והמטמון ─────────────────────────────────────────────────── */
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    // הסרת גרשיים עוטפים — בדיוק כמו ש-Next טוען את .env.local
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
  }
}
const dbFile = path.resolve(process.cwd(), process.env.DATABASE_FILE ?? "./data/lemontank.db");
if (!fs.existsSync(dbFile)) {
  console.error(`❌ לא נמצא מסד נתונים ב-${path.relative(process.cwd(), dbFile)} — הרץ קודם: node scripts/seed.mjs`);
  process.exit(1);
}

const dataDir = path.join(process.cwd(), "scripts", "data");
const cacheFile = path.join(dataDir, "enrichment.json");

const db = new DatabaseSync(dbFile);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 8000");

const insert = (sql, params = []) => Number(db.prepare(sql).run(...params).lastInsertRowid);
const get = (sql, params = []) => db.prepare(sql).get(...params);

/* ── טעינת הקטלוג ───────────────────────────────────────────────────────── */
const moviesA = (await import("./data/catalog-movies-a.mjs")).default;
const moviesB = (await import("./data/catalog-movies-b.mjs")).default;
const series = (await import("./data/catalog-series.mjs")).default;
const israeli = (await import("./data/catalog-israeli.mjs")).default;

const entries = [
  ...moviesA.filter((e) => !e.hidden).map((e) => ({ ...e, kind: "movie" })),
  ...moviesB.filter((e) => !e.hidden).map((e) => ({ ...e, kind: "movie" })),
  ...israeli.filter((e) => !e.hidden).map((e) => ({ ...e, kind: e.s ? "series" : "movie" })),
  ...series.filter((e) => !e.hidden).map((e) => ({ ...e, kind: "series" })),
];

/** slug יציב מתוך שם אנגלי + שנה (לזיהוי ומונעות כפילויות) */
const slugify = (entry) => {
  const base = (entry.en || entry.he)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.:!?&,()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "title"}-${entry.y}`;
};

/* ── העשרה מוויקיפדיה (שם עברי + פוסטר) ─────────────────────────────────── */
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
let cacheDirty = false;

const api = async (host, params) => {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ format: "json", ...params })}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "LemonTankStream/1.0 (catalog seed script; contact: admin@lemontank.local)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/** שם הכותר בעברית מוויקיפדיה העברית */
async function hebrewTitle(entry) {
  try {
    const data = await api("he.wikipedia.org", {
      action: "query",
      list: "search",
      srsearch: `"${entry.en}" ${entry.y}`,
      srlimit: "1",
    });
    const hit = data?.query?.search?.[0]?.title;
    if (!hit) return null;
    // הסרת סוגריים: "הסנדק (סרט)" → "הסנדק"
    return hit.replace(/\s*\([^)]*\)\s*$/, "").trim() || null;
  } catch {
    return null;
  }
}

/** פוסטר מוויקיפדיה האנגלית (תמונת האינפובוקס) */
async function poster(entry) {
  const kindWord = entry.kind === "series" ? "TV series" : "film";
  try {
    const data = await api("en.wikipedia.org", {
      action: "query",
      generator: "search",
      gsrsearch: `${entry.en} ${entry.y} ${kindWord}`,
      gsrlimit: "1",
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: "600",
      redirects: "1",
    });
    const pages = Object.values(data?.query?.pages ?? {});
    const src = pages[0]?.thumbnail?.source;
    return typeof src === "string" && src.startsWith("http") ? src : null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function enrich(list) {
  let fetched = 0;
  for (const entry of list) {
    const key = slugify(entry);
    if (cache[key]) continue;
    if (!fetchPosters || offline) continue;

    const he = await hebrewTitle(entry);
    await sleep(160);
    const img = await poster(entry);
    cache[key] = { he, poster: img };
    cacheDirty = true;
    fetched++;
    if (fetched % 25 === 0) {
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
      console.log(`   … הושלמו ${fetched} שדרוגים מוויקיפדיה`);
    }
    await sleep(160);
  }
  if (cacheDirty) fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  return fetched;
}

/* ── מזהים ─────────────────────────────────────────────────────────────── */
const admin = get("SELECT id FROM users WHERE role IN ('owner','admin') ORDER BY id LIMIT 1");
if (!admin) {
  console.error("❌ אין משתמש מנהל במסד — הרץ קודם: node scripts/seed.mjs");
  process.exit(1);
}
const adminId = Number(admin.id);

const genreMap = new Map(
  db.prepare("SELECT id, slug FROM genres").all().map((g) => [String(g.slug), Number(g.id)]),
);

/* ── מחיקה (--reset) ───────────────────────────────────────────────────── */
const allSlugs = entries.map(slugify);
if (doReset) {
  const placeholders = allSlugs.map(() => "?").join(",");
  let removed = 0;
  const chunk = 200;
  for (let i = 0; i < allSlugs.length; i += chunk) {
    const slice = allSlugs.slice(i, i + chunk);
    const ph = slice.map(() => "?").join(",");
    const ids = db.prepare(`SELECT id FROM titles WHERE slug IN (${ph})`).all(...slice).map((r) => Number(r.id));
    for (const id of ids) {
      db.prepare("DELETE FROM episodes WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM seasons WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM title_genres WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM collection_titles WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM watch_progress WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM watchlist WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM ratings WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM comments WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM reviews WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM downloads WHERE title_id = ?").run(id);
      db.prepare("DELETE FROM titles WHERE id = ?").run(id);
      removed++;
    }
  }
  console.log(`🗑️  נמחקו ${removed} כותרי קטלוג (והתלויים בהם).`);
  void placeholders;
}

/* ── ייבוא ─────────────────────────────────────────────────────────────── */
console.log(`📚 מייבא ${entries.length} כותרים אמיתיים…`);
if (fetchPosters && !offline) console.log("🌐 שולף שמות עבריים ופוסטרים מוויקיפדיה (נשמר במטמון)…");
const enriched = await enrich(entries);
if (enriched) console.log(`   ✅ ${enriched} רשומות הועשרו מוויקיפדיה`);

const now = new Date().toISOString();
let created = 0;
let updated = 0;
let withPoster = 0;

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgoIso = (days) => new Date(today.getTime() - days * 86_400_000).toISOString();

const planFor = (entry, index) => {
  // חלוקה דטרמיניסטית: רוב הקטלוג חינם (כמו שהבטחנו במסלול החינם),
  // ושליש ממנו פלוס — ככה שני המסלולים מורגשים וסביר לחדש מנוי.
  if (entry.g?.includes("kids") || entry.g?.includes("documentary")) return "free";
  return index % 10 < 3 ? "plus" : "free";
};

db.exec("BEGIN IMMEDIATE");
entries.forEach((entry, index) => {
  const slug = slugify(entry);
  const info = cache[slug] ?? {};
  const nameHe = info.he || entry.he;
  const posterUrl = info.poster || null;
  if (posterUrl) withPoster++;

  const plan = planFor(entry, index);
  const kind = entry.kind;
  const seasonsCount = kind === "series" ? (entry.s ?? 1) : 0;
  const episodesCount = kind === "series" ? (entry.ep ?? 0) : 0;
  const featured = (entry.imdb ?? 0) >= 8.4 && index % 4 === 0 ? 1 : 0;

  const existing = get("SELECT id FROM titles WHERE slug = ?", [slug]);
  let titleId;

  const values = [
    kind,
    slug,
    nameHe,
    entry.en ?? null,
    entry.ov ?? null,
    entry.y ?? null,
    entry.rt ?? null,
    seasonsCount,
    episodesCount,
    entry.m ?? "12+",
    entry.g?.includes("israeli") ? "ישראל" : null,
    entry.g?.includes("israeli") ? "he" : "en",
    entry.dir ?? null,
    entry.cast ?? null,
    posterUrl,
    posterUrl,
    entry.imdb && entry.imdb > 0 ? entry.imdb : null,
    plan,
    "published",
    featured,
    entry.imdb && entry.imdb >= 8.0 ? 70 + (index % 30) : 40 + (index % 40),
    iso(new Date((entry.y ?? 2020), 0, 1)),
    adminId,
    daysAgoIso(30 + (index % 200)),
    now,
  ];

  if (existing) {
    db.prepare(
      `UPDATE titles SET
         kind=?, name_he=?, name_en=?, overview=?, year=?, runtime_min=?,
         seasons_count=?, episodes_count=?, maturity=?, country=?, language=?,
         director=?, cast_text=?, poster_url=COALESCE(?, poster_url), backdrop_url=COALESCE(?, backdrop_url),
         rating_imdb=?, plan_access=?, status=?, is_featured=?, trending_score=?,
         release_date=?, updated_by=?, created_at=?, updated_at=?
       WHERE id = ?`,
    ).run(...[values[0], ...values.slice(2)], Number(existing.id));
    titleId = Number(existing.id);
    updated++;
  } else {
    titleId = insert(
      `INSERT INTO titles(kind, slug, name_he, name_en, overview, year, runtime_min,
         seasons_count, episodes_count, maturity, country, language,
         director, cast_text, poster_url, backdrop_url, rating_imdb, plan_access, status,
         is_featured, trending_score, release_date, created_by, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      values,
    );
    created++;
  }

  // ז'אנרים
  for (const g of entry.g ?? []) {
    const genreId = genreMap.get(g);
    if (!genreId) continue;
    db.prepare("INSERT OR IGNORE INTO title_genres(title_id, genre_id) VALUES(?,?)").run(titleId, genreId);
  }

  // שלד עונות ופרקים לסדרות — ממתין לווידאו שלך
  if (kind === "series") {
    const existingSeason = get("SELECT id FROM seasons WHERE title_id = ? LIMIT 1", [titleId]);
    if (!existingSeason) {
      const totalEpisodes = Math.max(entry.ep ?? 8, (entry.s ?? 1) * 4);
      const perSeason = Math.max(4, Math.round(totalEpisodes / (entry.s ?? 1)));
      let createdEpisodes = 0;
      for (let s = 1; s <= (entry.s ?? 1); s++) {
        const seasonYear = entry.y + (s - 1);
        const seasonId = insert(
          "INSERT INTO seasons(title_id, number, name_he, year, episodes_count, plan_access, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)",
          [titleId, s, `עונה ${s}`, seasonYear, perSeason, "inherit", now, now],
        );
        for (let ep = 1; ep <= perSeason; ep++) {
          const airDate = iso(new Date(seasonYear, 0, 1 + (ep - 1) * 7));
          insert(
            `INSERT INTO episodes(title_id, season_id, season_number, number, name_he, overview, runtime_sec, air_date,
               plan_access, status, is_premiere, is_finale, created_by, created_at, updated_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              titleId,
              seasonId,
              s,
              ep,
              `פרק ${ep}`,
              `עונה ${s} · פרק ${ep}`,
              (40 + (ep % 15)) * 60,
              airDate,
              "inherit",
              "published",
              ep === 1 ? 1 : 0,
              ep === perSeason ? 1 : 0,
              adminId,
              now,
              now,
            ],
          );
          createdEpisodes++;
        }
      }
      db.prepare("UPDATE seasons SET episodes_count = (SELECT COUNT(*) FROM episodes e WHERE e.season_id = seasons.id)").run();
      db.prepare("UPDATE titles SET episodes_count = ? WHERE id = ?").run(createdEpisodes, titleId);
    }
  }
});

db.exec("COMMIT");

/* ── אוספים (שורות לבית) ───────────────────────────────────────────────── */
if (buildCollections) {
  const collections = [
    { slug: "top-rated", he: "המדורגים הגבוהים", desc: "הכותרות עם הדירוג הגבוה בקטלוג", where: "rating_imdb >= 8.4" },
    { slug: "israeli-picks", he: "קולנוע וטלוויזיה ישראליים", desc: "הסיפורים שמכאן", where: "country = 'ישראל'" },
    { slug: "anime", he: "אנימה ומנגה", desc: "אנימציה יפנית במיטבה", where: "id IN (SELECT title_id FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE g.slug IN ('anime','animation'))" },
    { slug: "sci-fi-space", he: "מדע בדיוני וחלל", desc: "עתיד, חלל ומה שביניהם", where: "id IN (SELECT title_id FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE g.slug = 'scifi')" },
    { slug: "family-night", he: "לכל המשפחה", desc: "מתאים לצפייה משותפת", where: "id IN (SELECT title_id FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE g.slug IN ('kids','animation'))" },
    { slug: "series-must", he: "סדרות שאסור לפספס", desc: "הסדרות שכדאי להתחיל הערב", where: "kind = 'series' AND rating_imdb >= 8.5" },
  ];
  let added = 0;
  for (const [i, c] of collections.entries()) {
    const existing = get("SELECT id FROM collections WHERE slug = ?", [c.slug]);
    const collectionId = existing
      ? Number(existing.id)
      : insert(
          "INSERT INTO collections(slug, name_he, description, layout, plan_access, is_public, is_auto, sort_order, created_by, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          [c.slug, c.he, c.desc, "poster", "free", 1, 1, i + 1, adminId, now],
        );
    if (!existing) {
      const rows = db.prepare(`SELECT id FROM titles WHERE deleted_at IS NULL AND ${c.where} ORDER BY rating_imdb DESC LIMIT 20`).all();
      rows.forEach((row, idx) => {
        db.prepare("INSERT OR IGNORE INTO collection_titles(collection_id, title_id, sort_order) VALUES(?,?,?)").run(
          collectionId,
          Number(row.id),
          idx + 1,
        );
        added++;
      });
    }
  }
  console.log(`🎞️  אוספים: ${collections.length} שורות, ${added} שיוכי כותרים`);
}

/* ── דוח ───────────────────────────────────────────────────────────────── */
const totals = get(
  `SELECT
     (SELECT COUNT(*) FROM titles WHERE deleted_at IS NULL) titles,
     (SELECT COUNT(*) FROM titles WHERE poster_url IS NOT NULL AND deleted_at IS NULL) posters,
     (SELECT COUNT(*) FROM episodes WHERE deleted_at IS NULL) episodes,
     (SELECT COUNT(*) FROM seasons) seasons,
     (SELECT COUNT(*) FROM titles WHERE plan_access='plus' AND deleted_at IS NULL) plus_titles,
     (SELECT COUNT(*) FROM titles WHERE plan_access='free' AND deleted_at IS NULL) free_titles`,
);

console.log("");
console.log("✅ הקטלוג נטען");
console.log(`   נוצרו: ${created} · עודכנו: ${updated} · עם פוסטר: ${withPoster}`);
console.log("");
console.log("📊 מצב המערכת:");
console.log(`   כותרים         ${totals.titles}`);
console.log(`   עם פוסטר       ${totals.posters}`);
console.log(`   עונות / פרקים  ${totals.seasons} / ${totals.episodes}`);
console.log(`   חינם / פלוס    ${totals.free_titles} / ${totals.plus_titles}`);
if (!fetchPosters) {
  console.log("");
  console.log("💡 בלי תמונות כרגע. להוספת פוסטרים מוויקיפדיה:");
  console.log("   node scripts/seed-real-catalog.mjs --posters");
}
console.log("");
console.log("▶️  להתרשמות: npm run dev   →  /  ·  /movies  ·  /series  ·  /title/<slug>");
console.log("🗑️  להסרת הקטלוג הזה: node scripts/seed-real-catalog.mjs --reset");
console.log("");

db.close();
