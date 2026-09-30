#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  בחירת פורט פנוי — כדי שהאתר תמיד יעלה, גם אם 3000 תפוס
 *
 *  למה זה קיים: הסיבה הנפוצה ביותר ל-ERR_CONNECTION_REFUSED היא שהשרת בכלל
 *  לא עלה — כי פורט 3000 כבר תפוס (הפעלה קודמת שלא נסגרה, אתר אחר, WSL, Docker),
 *  או שהחלון נסגר מיד עם שגיאה. הסקריפט הזה:
 *    1. בודק אם הפורט המבוקש פנוי
 *    2. אם כן — מחזיר אותו (או שומר על PORT מהסביבה)
 *    3. אם לא — מחפש פורט פנוי בסביבה הקרובה ומדווח בעברית מה קורה
 *    4. אם הפורט תפוס ע"י **האתר הזה עצמו** (הוא כבר רץ) — אומר זאת במפורש
 *
 *  הרצה:
 *    node scripts/pick-port.mjs            # מדפיס את הפורט שנבחר (בשביל קובצי .cmd)
 *    node scripts/pick-port.mjs --json     # פלט מכונה: {"port":3000,"busy":false,…}
 *    A=1 && PORT=$(node scripts/pick-port.mjs)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import net from "node:net";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const preferred = Number(process.env.PORT ?? 3000);
const CANDIDATES = [preferred, 3001, 3002, 3003, 3004, 3005, 3010, 3020, 8080];

const isFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "0.0.0.0");
  });

/** האם על הפורט הזה עונה אתר של LemonTank (כדי לא להציע "תפוס" סתם) */
async function lemonTankHere(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(1500),
      redirect: "manual",
    });
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return false;
    const body = await res.text();
    return /לימונטנק|LemonTank/i.test(body) || res.status < 400;
  } catch {
    return false;
  }
}

let chosen = null;
let existing = false;
for (const port of CANDIDATES) {
  if (await isFree(port)) {
    chosen = port;
    break;
  }
  if (port === preferred && (await lemonTankHere(port))) existing = true;
}

if (chosen === null) {
  // כל הפורטים תפוסים — מחזירים את המועדף ונותנים לשרת להתלונן בעצמו
  chosen = preferred;
  if (!JSON_OUT) {
    console.error(`⚠️  כל הפורטים המוכרים תפוסים — מנסה בכל זאת את ${preferred}`);
  }
} else if (chosen !== preferred) {
  if (!JSON_OUT) {
    console.error(
      existing
        ? `ℹ️  האתר כבר רץ על הפורט ${preferred} — עולים במקביל על ${chosen}`
        : `ℹ️  הפורט ${preferred} תפוס (תוכנית אחרת) — עולים על ${chosen}`,
    );
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ port: chosen, preferred, busy: chosen !== preferred, existing }, null, 0));
} else {
  console.log(chosen);
}
