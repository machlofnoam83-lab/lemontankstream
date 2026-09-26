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

echo  [1/3] מתכונן... (בפעם הראשונה זה יכול לקחת כמה דקות)
echo.
node scripts\local-setup.mjs
if errorlevel 1 goto FAILED

echo.
echo  [2/3] בוחר פורט פנוי...
for /f "delims=" %%p in ('node scripts\pick-port.mjs') do set PORT=%%p
if "%PORT%"=="" set PORT=3000
echo       פורט: %PORT%

echo.
echo  [3/3] מדליק את האתר...
echo.
start /min "" cmd /c "node scripts\open-later.mjs http://localhost:%PORT%"
echo  ------------------------------------------------------------
echo    האתר רץ בכתובת:  http://localhost:%PORT%
echo    כניסת מנהל:      admin@lemontank.local / ChangeMe-Admin-2026!
echo.
echo    חשוב: השאר את החלון הזה פתוח כל עוד אתה רוצה שהאתר יעבוד.
echo    לעצירה: לחץ Ctrl+C כאן.
echo  ------------------------------------------------------------
echo.
set PORT=%PORT%
call npm run start
echo.
echo  האתר נעצר. (החלון הזה הוא מה שהריץ אותו - אם הוא נסגר, האתר נופל)
pause
exit /b 0

:NODE_MISSING
echo  [!] Node.js לא מותקן במחשב הזה - זה מה שמריץ את האתר.
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
echo      פתרון לתקלות נפוצות: RUN-LOCALLY.md
echo.
pause
exit /b 1
