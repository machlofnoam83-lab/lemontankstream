#!/usr/bin/env node
/**
 * מחולל כרזות קולנועיות — יוצר אמנות מקורית לכל כותר (פוסטר + רקע רחב).
 *
 *   node scripts/gen-posters.mjs              → יוצר כרזות לכל הכותרים בלי תמונה
 *   node scripts/gen-posters.mjs --all        → יוצר מחדש לכולם (כולל כאלה שכבר יש להם)
 *   node scripts/gen-posters.mjs --slug x-1972 → כותר בודד
 *
 * למה מחולל ולא תמונות אמיתיות:
 *   • פוסטרים של סרטים מוגנים בזכויות יוצרים — אסור להעלות אותם בלי רישיון.
 *   • זו אמנות טיפוגרפית מקורית: כל כותר מקבל פלטה לפי הז'אנר, דפוס גרפי
 *     דטרמיניסטי (מתוך ה-slug), שם בעברית, שם מקורי, שנה, דירוג ופרטי בימוי.
 *
 * הפלט נשמר ב-public/posters/real/<slug>.svg (וגם ‎-wide.svg לרקע הבמה),
 * ומתעדכן בשדות poster_url / backdrop_url. להחלפה בתמונה אמיתית:
 * /admin/titles → עריכת כותר → העלאת תמונה (או ייבוא דרך /admin/import).
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = new Set(process.argv.slice(2));
const all = args.has("--all");
const onlySlug = process.argv[process.argv.indexOf("--slug") + 1];
const useSlug = args.has("--slug");

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const dbFile = path.resolve(process.cwd(), process.env.DATABASE_FILE ?? "./data/lemontank.db");
const db = new DatabaseSync(dbFile);
const outDir = path.join(process.cwd(), "public", "posters", "real");
fs.mkdirSync(outDir, { recursive: true });

/* ── פלטות לפי ז'אנר ─────────────────────────────────────────────────────── */
const PALETTES = {
  action:     { a: "#ff5a3c", b: "#2a0b06", c: "#ffb199" },
  comedy:     { a: "#ffc93c", b: "#2a1f04", c: "#fff0b8" },
  drama:      { a: "#7aa2ff", b: "#070d24", c: "#cddcff" },
  thriller:   { a: "#38d6c4", b: "#04191c", c: "#b6f5ec" },
  scifi:      { a: "#5ec8ff", b: "#050b1e", c: "#b8e6ff" },
  horror:     { a: "#e8452f", b: "#120303", c: "#ffb1a6" },
  romance:    { a: "#ff7ab8", b: "#2a0718", c: "#ffcfe4" },
  animation:  { a: "#ffd166", b: "#06202a", c: "#fff2cf" },
  kids:       { a: "#7be495", b: "#04200f", c: "#d6ffe2" },
  documentary:{ a: "#cbb089", b: "#181310", c: "#f0e4d2" },
  israeli:    { a: "#4f9bff", b: "#050f22", c: "#c9e0ff" },
  anime:      { a: "#b388ff", b: "#150524", c: "#e2d4ff" },
  default:    { a: "#f7c22b", b: "#0a0a10", c: "#ffeec2" },
};

const GENRE_HE = {
  action: "אקשן", comedy: "קומדיה", drama: "דרמה", thriller: "מתח", scifi: "מדע בדיוני",
  horror: "אימה", romance: "רומנטיקה", animation: "אנימציה", kids: "ילדים",
  documentary: "דוקומנטרי", israeli: "ישראלית", anime: "אנימה",
};

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** שבירת טקסט עברי לשורות לפי רוחב משוער */
function wrapHe(text, maxChars, maxLines = 3) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    // עברית רחבה מליטינית: ~0.62 יחידות תו
    const width = [...candidate].reduce((sum, ch) => sum + (ch === " " ? 0.32 : /[A-Za-z0-9]/.test(ch) ? 0.5 : 0.62), 0);
    if (width > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  else if (line) lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
  return lines;
}

/** גוף הכרזה — דפוס גרפי דטרמיניסטי */
function posterArt(t, palette, seed) {
  const r = (n) => ((seed >> (n * 3)) % 1000) / 1000;
  const variant = seed % 4;

  const shapes = [];
  if (variant === 0) {
    // פסים אלכסוניים
    for (let i = 0; i < 7; i++) {
      const x = -200 + i * 130 + r(i) * 60;
      shapes.push(`<rect x="${x.toFixed(0)}" y="-260" width="${(16 + r(i + 2) * 40).toFixed(0)}" height="1500" fill="url(#beam)" opacity="${(0.10 + r(i + 3) * 0.20).toFixed(2)}" transform="rotate(18 300 600)"/>`);
    }
  } else if (variant === 1) {
    // עיגולים קונצנטריים
    for (let i = 1; i <= 5; i++) {
      shapes.push(`<circle cx="${(300 + (r(i) - 0.5) * 180).toFixed(0)}" cy="${(360 + (r(i + 1) - 0.5) * 160).toFixed(0)}" r="${(90 + i * 78).toFixed(0)}" fill="none" stroke="${palette.a}" stroke-width="${(1.4 + r(i) * 1.6).toFixed(1)}" opacity="${(0.30 - i * 0.045).toFixed(2)}"/>`);
    }
  } else if (variant === 2) {
    // גבעה/אופק + שמש
    shapes.push(`<circle cx="${(300 + (r(1) - 0.5) * 120).toFixed(0)}" cy="${(330 + r(2) * 60).toFixed(0)}" r="${(70 + r(3) * 50).toFixed(0)}" fill="${palette.a}" opacity="0.38"/>`);
    shapes.push(`<path d="M-40 ${(560 + r(4) * 60).toFixed(0)} Q 160 ${(430 + r(5) * 80).toFixed(0)} 340 ${(560 + r(6) * 50).toFixed(0)} T 640 ${(530 + r(7) * 60).toFixed(0)} L 640 900 L -40 900 Z" fill="${palette.b}" opacity="0.92"/>`);
  } else {
    // סריג מסך/פילם
    for (let i = 0; i < 9; i++) {
      shapes.push(`<rect x="${(30 + i * 62).toFixed(0)}" y="${(90 + (i % 3) * 26).toFixed(0)}" width="34" height="${(24 + r(i) * 34).toFixed(0)}" rx="6" fill="${palette.a}" opacity="${(0.12 + r(i + 1) * 0.16).toFixed(2)}"/>`);
    }
    shapes.push(`<circle cx="300" cy="760" r="210" fill="url(#glow)"/>`);
  }
  return shapes.join("\n      ");
}

/* ── יצירת פוסטר ─────────────────────────────────────────────────────────── */
function posterSvg(t) {
  const genre = String(t.primary_genre ?? "default");
  const palette = PALETTES[genre] ?? PALETTES.default;
  const seed = hash(t.slug);
  const titleLines = wrapHe(t.name_he, 12, 3);
  const isSeries = t.kind === "series";
  const badge = isSeries ? "סדרה" : "סרט";
  const meta = [];
  if (t.year) meta.push(String(t.year));
  if (isSeries && t.seasons_count) meta.push(`${t.seasons_count} עונות`);
  else if (t.runtime_min) meta.push(`${t.runtime_min} דק׳`);
  if (t.rating_imdb) meta.push(`★ ${Number(t.rating_imdb).toFixed(1)}`);

  const startY = titleLines.length === 3 ? 620 : titleLines.length === 2 ? 664 : 700;
  const titleSvg = titleLines
    .map((line, i) => `<text x="300" y="${startY + i * 68}" text-anchor="middle" direction="rtl" font-size="64" font-weight="900" fill="#ffffff" letter-spacing="-1.5">${esc(line)}</text>`)
    .join("\n    ");
  const lastLineY = startY + (titleLines.length - 1) * 68;
  const ruleY = lastLineY + 38;
  const metaY = lastLineY + 68;
  const enY = lastLineY + 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900" role="img" aria-label="${esc(t.name_he)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0%" stop-color="${palette.b}"/>
      <stop offset="55%" stop-color="#050508"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="${palette.a}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${palette.a}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.a}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${palette.c}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="45%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.92"/>
    </linearGradient>
  </defs>

  <rect width="600" height="900" fill="url(#bg)"/>
  <g>
      ${posterArt(t, palette, seed)}
  </g>
  <rect width="600" height="900" fill="url(#fade)"/>

  <!-- תג עליון -->
  <g font-family="Heebo, Assistant, Arial, sans-serif" direction="rtl">
    <rect x="${600 - 34 - (t.plan_access === "plus" ? 150 : 118)}" y="34" width="${t.plan_access === "plus" ? 176 : 118}" height="34" rx="17" fill="${palette.a}" opacity="0.92"/>
    <text x="${600 - 34 - (t.plan_access === "plus" ? 75 : 59)}" y="57" text-anchor="middle" font-size="17" font-weight="800" fill="#0a0a10">${badge}${t.plan_access === "plus" ? " · פלוס" : ""}</text>
    <text x="34" y="58" font-size="16" font-weight="700" fill="${palette.c}" opacity="0.9" direction="ltr" text-anchor="start">LEMONTANK</text>
  </g>

  <!-- כותרת -->
  <g font-family="Heebo, Assistant, Rubik, Arial, sans-serif">
    ${titleSvg}
  </g>

  <!-- מטא -->
  <g font-family="Heebo, Assistant, Arial, sans-serif" direction="rtl">
    <line x1="150" y1="${ruleY}" x2="450" y2="${ruleY}" stroke="${palette.a}" stroke-width="2" opacity="0.65"/>
    <text x="300" y="${metaY}" text-anchor="middle" font-size="23" font-weight="700" fill="${palette.c}" opacity="0.95">${esc(meta.join(" · "))}</text>
    <text x="300" y="${enY}" text-anchor="middle" font-size="17" font-weight="600" fill="#ffffff" opacity="0.62" direction="ltr">${esc(t.name_en ?? "")}</text>
  </g>

  <rect x="0.5" y="0.5" width="599" height="899" fill="none" stroke="#ffffff" stroke-opacity="0.09"/>
</svg>
`;
}

/* ── יצירת רקע רחב לבמה (16:9) ───────────────────────────────────────────── */
function backdropSvg(t) {
  const genre = String(t.primary_genre ?? "default");
  const palette = PALETTES[genre] ?? PALETTES.default;
  const seed = hash(`${t.slug}-wide`);
  const titleLines = wrapHe(t.name_he, 20, 2);
  const baseY = titleLines.length === 2 ? 400 : 430;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="${esc(t.name_he)}">
  <defs>
    <linearGradient id="bg" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.b}"/>
      <stop offset="60%" stop-color="#050508"/>
      <stop offset="100%" stop-color="#000"/>
    </linearGradient>
    <radialGradient id="glow" cx="26%" cy="42%" r="62%">
      <stop offset="0%" stop-color="${palette.a}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="${palette.a}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.a}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${palette.c}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="side" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0%" stop-color="#050508"/>
      <stop offset="52%" stop-color="#050508" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#050508" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="430" cy="380" r="440" fill="url(#glow)"/>
  ${Array.from({ length: 9 })
    .map((_, i) => {
      const r = ((seed >> (i * 2)) % 1000) / 1000;
      return `<rect x="${-900 + i * 230 + r * 80}" y="-500" width="${18 + r * 46}" height="2000" fill="url(#beam)" opacity="${(0.08 + r * 0.16).toFixed(2)}" transform="rotate(-17 800 450)"/>`;
    })
    .join("\n  ")}
  <rect width="1600" height="900" fill="#000" opacity="0.18"/>

  <rect x="0" y="0" width="1600" height="900" fill="url(#side)"/>
  <g font-family="Heebo, Assistant, Rubik, Arial, sans-serif" direction="rtl" text-anchor="middle">
    <text x="1168" y="${baseY - 66}" font-size="24" font-weight="800" fill="${palette.a}" letter-spacing="3">LEMONTANK ORIGINAL</text>
    ${titleLines.map((line, i) => `<text x="1168" y="${baseY + i * 104}" font-size="92" font-weight="900" fill="#fff" letter-spacing="-3">${esc(line)}</text>`).join("\n    ")}
  </g>
  <rect x="0" y="0" width="1600" height="900" fill="none" stroke="#ffffff" stroke-opacity="0.06"/>
</svg>
`;
}

/* ── הרצה ────────────────────────────────────────────────────────────────── */
const rows = db
  .prepare(
    `SELECT t.id, t.slug, t.name_he, t.name_en, t.kind, t.year, t.runtime_min, t.seasons_count,
            t.rating_imdb, t.plan_access, t.poster_url, t.backdrop_url,
            (SELECT g.slug FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = t.id ORDER BY g.sort LIMIT 1) AS primary_genre
     FROM titles t WHERE t.deleted_at IS NULL ${useSlug ? "AND t.slug = ?" : ""} ORDER BY t.id`,
  )
  .all(...(useSlug ? [onlySlug] : []));

let madePosters = 0;
let madeBackdrops = 0;

for (const t of rows) {
  const hasOwnPoster = t.poster_url && !String(t.poster_url).startsWith("/posters/real/");
  if (hasOwnPoster && !all) continue;

  const posterPath = `/posters/real/${t.slug}.svg`;
  const widePath = `/posters/real/${t.slug}-wide.svg`;

  fs.writeFileSync(path.join(outDir, `${t.slug}.svg`), posterSvg(t), "utf8");
  fs.writeFileSync(path.join(outDir, `${t.slug}-wide.svg`), backdropSvg(t), "utf8");
  madePosters++;
  madeBackdrops++;

  db.prepare("UPDATE titles SET poster_url = ?, backdrop_url = ? WHERE id = ?").run(posterPath, widePath, Number(t.id));
}

const totals = db
  .prepare("SELECT COUNT(*) total, SUM(CASE WHEN poster_url LIKE '/posters/real/%' THEN 1 ELSE 0 END) generated FROM titles WHERE deleted_at IS NULL")
  .get();

console.log("");
console.log("🎨 כרזות נוצרו");
console.log(`   פוסטרים: ${madePosters} · רקעים: ${madeBackdrops}`);
console.log(`   סה״כ בקטלוג: ${totals.total} (${totals.generated} עם אמנות מקורית)`);
console.log(`   תיקייה: ${path.relative(process.cwd(), outDir)}`);
console.log("");
console.log("💡 החלפה בתמונת אמיתית: /admin/titles → עריכת כותר → העלאת תמונה");
console.log("");

db.close();
