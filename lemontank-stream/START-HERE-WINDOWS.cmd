@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title LemonTank Stream - האתר שלי

echo.
echo  ============================================================
echo    LemonTank Stream  -  הרצה במחשב שלך
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto NODE_MISSING

echo  [1/2] מתכונן... (בפעם הראשונה זה יכול לקחת כמה דקות)
echo.
node scripts\local-setup.mjs
if errorlevel 1 goto FAILED

echo.
echo  [2/2] מדליק את האתר...
echo.
start /min "" cmd /c "node scripts\open-later.mjs http://localhost:3000"
echo  ------------------------------------------------------------
echo    האתר רץ בכתובת:  http://localhost:3000
echo    כניסת מנהל:      admin@lemontank.local / ChangeMe-Admin-2026!
echo.
echo    לעצירה: לחץ Ctrl+C בחלון הזה
echo  ------------------------------------------------------------
echo.
call npm run start
echo.
echo  האתר נעצר.
pause
exit /b 0

:NODE_MISSING
echo  [!] Node.js לא מותקן במחשב הזה — זה מה שמריץ את האתר.
echo.
echo      1. נפתח לך חלון דפדפן עם דף ההורדה
echo      2. הורד ולחץ "Next" עד הסוף (הכול ברירת מחדל)
echo      3. סגור את החלון הזה, ופתח מחדש את הקובץ הזה (START-HERE-WINDOWS)
echo.
start "" https://nodejs.org/en/download
pause
exit /b 1

:FAILED
echo.
echo  [!] משהו נכשל בהכנה. גלול למעלה ותראה את השגיאה המדויקת.
echo      פתרון לתקלות נפוצות: קובץ RUN-LOCALLY.md
echo.
pause
exit /b 1
