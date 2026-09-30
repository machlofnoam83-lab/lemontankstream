#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  שחזור סביבת פיתוח אחרי איפוס סביבה (sandbox / מכונה חדשה)
#
#  אחרי איפוס נמחקים: node_modules, ‎.next, data/, ‎.env.local —
#  אבל **כל הקוד שמור ב-Git**. הסקריפט הזה מחזיר את הכל למצב עובד בפקודה אחת:
#    1. מוודא שאין שינויים לא-מקומטים (כדי לא לאבד עבודה) — ואז מסנכרן מ-origin
#    2. מתקין תלויות (npm ci)
#    3. מייצר סודות אם חסרים ומוודא סיסמת מנהל/מפתח גיבוי ידועים לפיתוח
#    4. מזריע את המסד אם חסר (קטלוג ריק — רק אתה מוסיף תוכן)
#    5. בונה (next build) אם אין ‎.next
#
#  הרצה:
#    bash scripts/recover-dev.sh              # שחזור מלא, כולל בנייה
#    bash scripts/recover-dev.sh --no-build   # שחזור בלי בנייה (מהיר)
#    bash scripts/recover-dev.sh --force      # גם אם יש שינויים לא-מקומטים
#
#  אחרי השחזור:  npm run start        (או npm run dev)
#  לאיפוס תוכן:   node scripts/clear-content.mjs
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

DO_BUILD=1
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    --force)    FORCE=1 ;;
    -h|--help)  sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "אפשרות לא מוכרת: $arg"; exit 2 ;;
  esac
done

C_OFF=$'\033[0m'; C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'
ok()   { printf "  ${C_G}✓${C_OFF} %s\n" "$*"; }
warn() { printf "  ${C_Y}!${C_OFF} %s\n" "$*"; }
bad()  { printf "  ${C_R}✗${C_OFF} %s\n" "$*"; }
step() { printf "\n${C_B}%s${C_OFF}\n" "$*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

step "1️⃣  סנכרון קוד ($BRANCH)"

if [[ -n "$(git status --porcelain)" && $FORCE -eq 0 ]]; then
  warn "יש שינויים לא-מקומטים — הם יימחקו בסנכרון:"
  git status --short | sed 's/^/     /'
  bad "גיבוי ל-/tmp/keep ואז הרצה מחדש עם --force, או קומט קודם."
  exit 1
fi

git fetch origin '+refs/heads/*:refs/remotes/origin/*' --quiet
if git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
  git reset --hard "origin/$BRANCH" --quiet
  ok "אופס ל-origin/$BRANCH — $(git log --oneline -1)"
else
  warn "אין origin/$BRANCH — ממשיך מהענף המקומי"
fi

if [[ ! -f .env.example || ! -f package.json ]]; then
  bad "לא נמצא פרויקט LemonTankStream בתיקייה $ROOT"
  exit 1
fi

step "2️⃣  תלויות"
if [[ -d node_modules ]]; then
  ok "node_modules קיים — מדלג (להתקנה מחדש: rm -rf node_modules)"
else
  npm ci --no-fund --no-audit 2>&1 | tail -1
  ok "הותקנו תלויות"
fi

step "3️⃣  סודות (.env.local)"
if [[ ! -f .env.local ]]; then
  node scripts/gen-secrets.mjs --write >/dev/null
  ok "נוצר .env.local עם סודות אקראיים"
else
  ok ".env.local קיים — לא נוגע בסודות"
fi

node - <<'NODE'
const fs = require("fs");
const PIN = {
  SEED_ADMIN_PASSWORD: '"ChangeMe-Admin-2026!"',
  BACKUP_KEY: "backup-key-for-local-dev-0123456789abcdef",
};
let t = fs.readFileSync(".env.local", "utf8");
let changed = 0;
for (const [k, v] of Object.entries(PIN)) {
  const re = new RegExp("^" + k + "=.*$", "m");
  if (re.test(t)) { if (!t.includes(k + "=" + v)) { t = t.replace(re, k + "=" + v); changed++; } }
  else { t = t.replace(/\n?$/, "\n") + k + "=" + v + "\n"; changed++; }
}
fs.writeFileSync(".env.local", t, { mode: 0o600 });
console.log(changed ? "  ✓ סיסמת מנהל ומפתח גיבוי עודכנו לערכי פיתוח" : "  ✓ ערכי פיתוח כבר במקום");
NODE

step "4️⃣  מסד נתונים"
if [[ -f data/lemontank.db ]]; then
  ok "data/lemontank.db קיים — מדלג"
else
  node scripts/seed.mjs 2>&1 | grep -E "✅|קובץ מסד" | sed 's/^/  /'
  ok "המסד נוצר (קטלוג ריק — רק אתה מוסיף תוכן)"
fi

if [[ $DO_BUILD -eq 1 ]]; then
  step "5️⃣  בנייה"
  if [[ -d .next ]]; then
    ok ".next קיים — מדלג (לבנייה מחדש: rm -rf .next)"
  else
    npm run build 2>&1 | tail -2 | sed 's/^/  /'
    ok "הבנייה הושלמה"
  fi
else
  step "5️⃣  בנייה — דולגה (--no-build)"
fi

step "✅ מוכן"
cat <<EOF
  הרצה:            npm run start        (http://localhost:3000)
  פיתוח:           npm run dev
  כניסת מנהל:      admin@lemontank.local / ChangeMe-Admin-2026!
  הוספת תוכן:      /admin/titles/new    (סרט · סדרה · פרקים)
  מחיקת תוכן:      node scripts/clear-content.mjs
  חמקן (חבוי):     node scripts/stealth.mjs on drop
EOF
