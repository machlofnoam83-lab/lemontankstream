#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  התקנה אוטומטית על שרת חינמי (Oracle Cloud Always Free / GCP e2-micro / VPS)
#
#  מה הסקריפט עושה — הכל, מהתקנה נקייה ועד שירות שרץ מעצמו אחרי ריסטארט:
#    1. בודק דרישות (מערכת, ארכיטקטורה, RAM, דיסק)
#    2. מתקין Node.js 22 וכלים נדרשים
#    3. יוצר swap קטן — קריטי בשרתים חינמיים עם 1GB RAM
#    4. יוצר משתמש שירות (לא root) ומעביר אליו את הקוד
#    5. מתקין תלויות, מייצר סודות, מזריע את המסד, בונה
#    6. מתקין cloudflared (מנהרה — בלי פורטים פתוחים) ומתקין שירותי systemd
#
#  הרצה:
#    bash deploy/bootstrap-free-vm.sh --check     # בדיקה בלבד, לא משנה כלום
#    sudo bash deploy/bootstrap-free-vm.sh        # התקנה מלאה
#
#  חשוב: הסקריפט רץ **מתוך תיקיית הפרויקט** (אחרי git clone).
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

APP_USER="${APP_USER:-lemontank}"
APP_DIR="${APP_DIR:-/opt/lemontank}"
PORT="${PORT:-3000}"
NODE_MAJOR="${NODE_MAJOR:-22}"
CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

C_OFF=$'\033[0m'; C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'
say()  { printf "%s\n" "$*"; }
ok()   { printf "  ${C_G}✓${C_OFF} %s\n" "$*"; }
warn() { printf "  ${C_Y}!${C_OFF} %s\n" "$*"; }
bad()  { printf "  ${C_R}✗${C_OFF} %s\n" "$*"; }
step() { printf "\n${C_B}%s${C_OFF}\n" "$*"; }

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─────────────────────────── 1. בדיקות מקדימות ────────────────────────────────
step "1️⃣  בדיקת דרישות"

KERNEL="$(uname -s)"
ARCH="$(uname -m)"
if [[ "$KERNEL" != "Linux" ]]; then bad "הסקריפט מיועד ל-Linux (זוהה: $KERNEL)"; exit 1; fi
ok "מערכת: Linux · ארכיטקטורה: $ARCH"

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  ok "הפצה: ${PRETTY_NAME:-unknown}"
else
  warn "לא זוהתה הפצה — מניח Debian/Ubuntu"
fi

RAM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
if   (( RAM_MB < 700 )); then warn "RAM: ${RAM_MB}MB — דל. ייווצר swap, אבל האתר יהיה איטי"
elif (( RAM_MB < 1800 )); then ok "RAM: ${RAM_MB}MB — מתאים, ייווצר swap"
else ok "RAM: ${RAM_MB}MB — נוח"; fi

DISK_GB=$(df -BG --output=avail "$SRC_DIR" 2>/dev/null | tail -1 | tr -dc '0-9')
if   (( ${DISK_GB:-0} < 8 )); then bad "דיסק פנוי: ${DISK_GB}GB — נדרש 8GB לפחות (Node + build)"; exit 1
else ok "דיסק פנוי: ${DISK_GB}GB"; fi

if [[ -f "$SRC_DIR/server.mjs" ]]; then ok "הקוד זוהה: $SRC_DIR"
else bad "לא נמצא server.mjs — הרץ את הסקריפט מתוך תיקיית הפרויקט"; exit 1; fi

CREDS_OK=1
for f in package.json next.config.ts; do
  [[ -f "$SRC_DIR/$f" ]] || { bad "חסר $f"; CREDS_OK=0; }
done
(( CREDS_OK )) && ok "קבצי הפרויקט נוכחים"

if (( CHECK_ONLY )); then
  step "🔍 מצב בדיקה — לא בוצע שום שינוי."
  say ""
  say "  להמשך:${C_B} sudo bash deploy/bootstrap-free-vm.sh${C_OFF}"
  say ""
  exit 0
fi

if (( EUID != 0 )); then
  bad "צריך הרשאות root (התקנת חבילות + systemd). הרץ: sudo bash $0"
  exit 1
fi

# ─────────────────────────── 2. חבילות בסיס + Node ────────────────────────────
step "2️⃣  התקנת Node.js ${NODE_MAJOR} וכלי בסיס"

export DEBIAN_FRONTEND=noninteractive
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates git build-essential ufw >/dev/null
  ok "חבילות בסיס הותקנו"

  if command -v node >/dev/null 2>&1 && [[ "$(node -v | cut -c2- | cut -d. -f1)" -ge "$NODE_MAJOR" ]]; then
    ok "Node.js קיים: $(node -v)"
  else
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs >/dev/null
    ok "Node.js הותקן: $(node -v)"
  fi
else
  bad "הסקריפט תומך כרגע ב-Debian/Ubuntu (apt). במערכת אחרת התקן Node ${NODE_MAJOR} ידנית."
  exit 1
fi

if node -e 'require("node:sqlite")' >/dev/null 2>&1; then ok "node:sqlite זמין (נדרש למסד)"
else bad "גרסת Node ללא node:sqlite — נדרש 22 ומעלה"; exit 1; fi

# ────────────────────────────── 3. swap (אם צריך) ──────────────────────────────
step "3️⃣  זיכרון וירטואלי (swap)"
if (( RAM_MB < 2048 )); then
  if swapon --show | grep -q .; then ok "swap כבר פעיל"
  else
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "נוצר swap של 2GB (נשאר גם אחרי ריסטארט)"
  fi
else
  ok "אין צורך ב-swap (${RAM_MB}MB RAM)"
fi

# ─────────────────────────── 4. משתמש ומקום לקוד ──────────────────────────────
step "4️⃣  משתמש שירות ותיקיית האפליקציה"
if id "$APP_USER" >/dev/null 2>&1; then ok "המשתמש $APP_USER קיים"
else useradd --system --create-home --shell /bin/bash "$APP_USER" && ok "נוצר משתמש $APP_USER"; fi

mkdir -p "$APP_DIR"
if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  # rsync עדיף (מעביר רק שינויים), עם נפילה ל-cp
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude node_modules --exclude .git --exclude .next "$SRC_DIR/" "$APP_DIR/"
  else
    cp -a "$SRC_DIR/." "$APP_DIR/" && rm -rf "$APP_DIR/node_modules" "$APP_DIR/.git" "$APP_DIR/.next"
  fi
  ok "הקוד הועתק אל $APP_DIR"
else
  ok "הקוד כבר נמצא ב-$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ───────────────────── 5. התקנה, סודות, מסד ובנייה ───────────────────────────
step "5️⃣  התקנה ובנייה (כמה דקות בשרת חלש)"
sudo -u "$APP_USER" -H bash -lc "
  set -euo pipefail
  cd '$APP_DIR'
  npm ci --omit=dev --no-audit --no-fund
  [[ -f .env.local ]] || cp .env.example .env.local
  node scripts/gen-secrets.mjs --write
  node scripts/seed.mjs
  npm run build
"
ok "התלויות הותקנו, הסודות נוצרו והבנייה עברה"

# ───────────────────── 6. שירות systemd + מנהרה ──────────────────────────────
step "6️⃣  שירות שרץ מעצמו (systemd)"

if [[ -f "$APP_DIR/deploy/lemontank.service" ]]; then
  sed -e "s#/opt/lemontank#$APP_DIR#g" -e "s#User=lemontank#User=$APP_USER#" \
      "$APP_DIR/deploy/lemontank.service" > /etc/systemd/system/lemontank.service
  systemctl daemon-reload
  systemctl enable --now lemontank
  ok "השירות lemontank פעיל (מתחיל לבד אחרי ריסטארט)"
else
  warn "לא נמצא deploy/lemontank.service — צריך להרים את השירות ידנית"
fi

# מנהרת Cloudflare — בלי פורטים פתוחים, בלי IP חשוף
if ! command -v cloudflared >/dev/null 2>&1; then
  CF_ARCH="amd64"; [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]] && CF_ARCH="arm64"
  if curl -fsSL -o /tmp/cloudflared.deb \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb"; then
    dpkg -i /tmp/cloudflared.deb >/dev/null && ok "cloudflared הותקן"
  else
    warn "הורדת cloudflared נכשלה — התקן ידנית (ר' deploy/cloudflared-config.yml)"
  fi
else
  ok "cloudflared כבר מותקן"
fi

# ───────────────────────────── 7. מה נשאר לך ─────────────────────────────────
step "✅ השרת מוכן — נשארו שלושה שלבים בדפדפן"
say ""
say "  1. חבר את הדומיין למנהרה:"
say "       cloudflared tunnel login && cloudflared tunnel create lemontank"
say "       sudo cp $APP_DIR/deploy/cloudflared-config.yml /etc/cloudflared/config.yml"
say "       # החלף בו <TUNNEL-ID> ו-<domain> · ואז:"
say "       sudo cloudflared service install && sudo systemctl enable --now cloudflared"
say ""
say "  2. הפעל את מצב החמקן וקח את הסימן הסודי:"
say "       cd $APP_DIR && node scripts/stealth.mjs on drop"
say "       node scripts/stealth.mjs token          # הסימן → כותרת ב-Cloudflare"
say ""
say "  3. עדכן ב-.env.local ואתחל:"
say "       APP_URL=\"https://your-domain\""
say "       COOKIE_SECURE=\"true\""
say "       sudo systemctl restart lemontank"
say ""
say "  בדיקה: ${C_B}curl -I https://your-domain${C_OFF}  (צריך לעבוד)"
say "         ${C_B}curl -I http://localhost:$PORT${C_OFF}  (בלי סימן — לא אמור לענות)"
say ""
say "  סיסמת המנהל נמצאת ב-$APP_DIR/.env.local (SEED_ADMIN_PASSWORD) — שמור אותה."
say ""
