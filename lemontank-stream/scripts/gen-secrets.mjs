#!/usr/bin/env node
/**
 * מפיק סודות חזקים ל-.env.local
 *
 *   node scripts/gen-secrets.mjs            → הדפסה למסך
 *   node scripts/gen-secrets.mjs --write    → כתיבה ל-.env.local (לא דורס קיים!)
 *   node scripts/gen-secrets.mjs --force    → כתיבה/דריסה
 *
 * אין שרת, אין תלויות — רק node:crypto. הסודות נוצרים מקומית ולא נשלחים לשום מקום.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const write = args.has("--write") || args.has("--force");
const force = args.has("--force");
const root = process.cwd();
const envLocal = path.join(root, ".env.local");

const secret = (bytes = 48) => crypto.randomBytes(bytes).toString("base64url");
const password = () => {
  // סיסמה חזקה וקלה להקראה: 4 גושי מילים-בסיס-36
  return Array.from({ length: 4 }, () => crypto.randomBytes(6).toString("base64url").slice(0, 6)).join("-");
};

const values = {
  APP_SECRET: secret(48),
  CSRF_SECRET: secret(48),
  MEDIA_SECRET: secret(48),
  // מפתח ייעודי לגיבויים מוצפנים — נפרד מסודות האפליקציה, כדי שאפשר יהיה
  // למסור גיבוי לגורם חיצוני בלי למסור את סודות המערכת.
  BACKUP_KEY: secret(48),
  DATABASE_FILE: "./data/lemontank.db",
  APP_URL: "http://localhost:3000",
  COOKIE_SECURE: "false",
  MAX_IMAGE_UPLOAD_MB: "8",
  MAX_VIDEO_UPLOAD_MB: "2048",
  SEED_ADMIN_EMAIL: "admin@lemontank.local",
  SEED_ADMIN_PASSWORD: password(),
  SEED_ADMIN_NAME: "מנהל המערכת",
};

const content = [
  "# ── נוצר ע\"י scripts/gen-secrets.mjs — אין להעלות את הקובץ הזה ל-Git ──",
  "# החלף COOKIE_SECURE ל-true ו-APP_URL לדומיין האמיתי לפני עלייה לאוויר.",
  ...Object.entries(values).map(([k, v]) => `${k}=${v}`),
  "",
].join("\n");

if (!write) {
  console.log(content);
  console.log("טיפ: הרץ עם --write כדי לכתוב את הקובץ אוטומטית.");
  process.exit(0);
}

if (fs.existsSync(envLocal) && !force) {
  console.error(`✋ ${path.relative(root, envLocal)} כבר קיים. לא דורסים סודות קיימים.`);
  console.error("   אם באמת רוצה להחליף הכול — הרץ עם --force.");
  process.exit(1);
}

fs.writeFileSync(envLocal, content, { mode: 0o600 });
console.log(`✅ נכתב ${path.relative(root, envLocal)}`);
console.log(`   אימייל מנהל: ${values.SEED_ADMIN_EMAIL}`);
console.log(`   סיסמת מנהל:  ${values.SEED_ADMIN_PASSWORD}`);
console.log("   שמור את הסיסמה במקום בטוח — היא לא מוצגת שוב.");
