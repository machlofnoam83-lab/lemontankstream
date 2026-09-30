#!/usr/bin/env bash
# הרצה בקליק כפול ב-macOS (גם START-HERE-LINUX.sh עובד באותו אופן)
cd "$(dirname "$0")" || exit 1

echo
echo "  ============================================================"
echo "    LemonTank Stream  —  הרצה במחשב שלך"
echo "  ============================================================"
echo

if ! command -v node >/dev/null 2>&1; then
  cat <<'MSG'
  [!] Node.js לא מותקן — זה מה שמריץ את האתר.

      1. נפתח דף ההורדה בדפדפן
      2. התקן את גרסת ה-LTS (Next → Next → Install)
      3. סגור חלון זה, ופתח מחדש את START-HERE-MAC.command
MSG
  open "https://nodejs.org/en/download" 2>/dev/null || true
  echo
  read -r -p "  לחץ Enter לסגירה…" _
  exit 1
fi

echo "  [1/2] מתכונן… (בפעם הראשונה זה יכול לקחת כמה דקות)"
echo
if ! node scripts/local-setup.mjs; then
  echo
  echo "  [!] משהו נכשל בהכנה. גלול למעלה לשגיאה המדויקת."
  echo "      פתרונות לתקלות נפוצות: RUN-LOCALLY.md"
  echo
  read -r -p "  לחץ Enter לסגירה…" _
  exit 1
fi

echo
echo "  [3/3] מדליק את האתר…"
PORT="$(node scripts/pick-port.mjs 2>/dev/null || echo 3000)"
export PORT
echo "      פורט: $PORT"
echo
node scripts/open-later.mjs "http://localhost:$PORT" &
echo "  ------------------------------------------------------------"
echo "    האתר רץ בכתובת:  http://localhost:$PORT"
echo "    כניסת מנהל:      admin@lemontank.local / ChangeMe-Admin-2026!"
echo
echo "    חשוב: השאר את החלון הזה פתוח כל עוד אתה רוצה שהאתר יעבוד."
echo "    לעצירה: לחץ Ctrl+C."
echo "  ------------------------------------------------------------"
echo
npm run start
echo
echo "  האתר נעצר."
read -r -p "  לחץ Enter לסגירה…" _
