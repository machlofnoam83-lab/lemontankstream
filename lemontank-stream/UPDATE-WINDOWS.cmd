@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title LemonTank Stream - עדכון לגרסה האחרונה

set BRANCH=arena/01a0d612-lemontankstream
set REPO=https://github.com/machlofnoam83-lab/lemontankstream.git

echo.
echo  ============================================================
echo    LemonTank Stream  -  מעדכן את האתר לגרסה האחרונה
echo  ============================================================
echo.
echo  מה זה עושה:
echo    1. מוריד את הקוד החדש מ-GitHub
echo    2. מתקין מה שחסר
echo    3. בונה מחדש
echo.
echo  מה זה לא נוגע בו: המשתמשים, הכותרים, הקודים והגיבויים שלך.
echo  הם שמורים ב-data\lemontank.db ובחיבור ל-GitHub בכלל לא מופיעים.
echo.

where node >nul 2>nul
if errorlevel 1 goto NODE_MISSING

where git >nul 2>nul
if errorlevel 1 goto GIT_MISSING

:: ── שלב 1: הורדת הקוד עצמו ─────────────────────────────────────────────
:: זה חייב לקרות כאן, ולא בתוך סקריפט, כי גם הסקריפט עצמו מגיע בעדכון.
git rev-parse --git-dir >nul 2>nul
if errorlevel 1 goto NOT_REPO

echo  [1/3] בודק אם יש קוד חדש...
git fetch origin !BRANCH! >nul 2>nul
if errorlevel 1 goto NO_NET

git rev-parse --verify --quiet "refs/heads/!BRANCH!" >nul 2>nul
if errorlevel 1 (
  echo        עובר לענף הראשי של הפרויקט...
  git checkout -B !BRANCH! FETCH_HEAD
  if errorlevel 1 goto PULL_FAILED
) else (
  git checkout !BRANCH! >nul 2>nul
  git merge --ff-only FETCH_HEAD
  if errorlevel 1 goto LOCAL_CHANGES
)

:: ── שלב 2: עדכון מלא (תלויות, מסד, בנייה) ──────────────────────────────
echo.
echo  [2/3] מכין את האתר...
if exist scripts\update.mjs (
  node scripts\update.mjs --no-build
  if errorlevel 1 goto FAILED
) else (
  node scripts\local-setup.mjs --no-build
  if errorlevel 1 goto FAILED
)

:: ── שלב 3: בנייה ───────────────────────────────────────────────────────
echo.
echo  [3/3] בונה את האתר (זה החלק שלוקח הכי הרבה זמן)...
call npm run build
if errorlevel 1 goto BUILD_FAILED

echo.
echo  ------------------------------------------------------------
echo    האתר מעודכן ומוכן.
echo.
echo    להפעלה:        npm run watchdog      (מרים ומשגיח - מחזיר לבד אם נופל)
echo    שהאתר יקום לבד: npm run autostart     (פעם אחת)
echo  ------------------------------------------------------------
echo.
pause
exit /b 0

:NOT_REPO
echo  [!] התיקייה הזאת אינה מאגר git - אי אפשר להוריד עדכונים ממנה.
echo.
echo      אפשרויות:
echo        א. אם יש לך תיקייה אחרת עם קובץ package.json - הרץ את הקובץ הזה משם.
echo        ב. מורידים את הפרויקט מחדש:
echo              git clone %REPO%
echo              cd lemontankstream\lemontank-stream
echo              npm run setup
echo.
pause
exit /b 1

:NO_NET
echo  [!] לא הצלחתי להתחבר ל-GitHub.
echo.
echo      בדוק שיש אינטרנט. אם יש, נסה שוב בעוד דקה.
echo      בינתיים אפשר להריץ בגרסה הנוכחית:  npm run setup
echo.
pause
exit /b 1

:LOCAL_CHANGES
echo  [!] יש שינויים מקומיים בקוד, ולכן לא הורדתי עדכון - כדי לא לדרוס אותם.
echo.
echo      אם אלה שינויים שאתה לא צריך, הרץ כאן:
echo            git stash
echo        ואז הפעל שוב את הקובץ הזה.
echo.
echo      (האתר עצמו ימשיך לעבוד גם בלי העדכון:  npm run setup )
echo.
pause
exit /b 1

:PULL_FAILED
echo  [!] ההורדה נכשלה. הרץ כאן כדי לראות את השגיאה בעיניים:
echo            git fetch origin %BRANCH%
echo.
pause
exit /b 1

:BUILD_FAILED
echo  [!] הבנייה נכשלה. הרץ את זה כדי לקבל דוח מלא:
echo            npm run doctor -- --report
echo        ואז שלח לי את הקובץ lemontank-report.txt
echo.
pause
exit /b 1

:FAILED
echo.
echo  [!] העדכון לא הושלם. השגיאה האמיתית מופיעה ממש מעל השורה הזו.
echo.
echo      שלב א': העתק לי את 20 השורות האחרונות שמופיעות כאן.
echo      שלב ב': הרץ את זה כדי לקבל דוח מלא:
echo                 npm run doctor -- --report
echo              ואז שלח לי את הקובץ lemontank-report.txt
echo.
pause
exit /b 1

:NODE_MISSING
echo  [!] Node.js לא מותקן במחשב הזה - זה מה שמריץ את האתר.
echo.
echo      1. נפתח לך חלון דפדפן עם דף ההורדה
echo      2. הורד ולחץ "Next" עד הסוף (הכול ברירת מחדל)
echo      3. אחרי ההתקנה: סגור את כל חלונות ה-cmd, ופתח שוב את הקובץ הזה
echo.
start "" https://nodejs.org/en/download
pause
exit /b 1

:GIT_MISSING
echo  [!] Git לא מותקן - בלעדיו אי אפשר להוריד את הקוד החדש.
echo.
echo      זו ההתקנה הרשמית (חינם, ברירת מחדל עד הסוף):
start "" https://git-scm.com/download/win
echo.
echo      אחרי ההתקנה: סגור את כל חלונות ה-cmd, ופתח שוב את הקובץ הזה.
echo      בינתיים אפשר להריץ את האתר בגרסה הנוכחית:  npm run setup
echo.
pause
exit /b 1
