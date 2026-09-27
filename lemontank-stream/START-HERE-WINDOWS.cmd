@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title LemonTank Stream - מתקין ומפעיל

echo.
echo  ============================================================
echo    LemonTank Stream  -  מתקין ומפעיל את האתר שלך
echo  ============================================================
echo.
echo  הפעם הזו: 3 פעולות אוטומטיות ואז הדפדפן ייפתח לבד.
echo.

where node >nul 2>nul
if errorlevel 1 goto NODE_MISSING

echo  [1/3] מכין את האתר (בפעם הראשונה זה כמה דקות)...
echo.
node scripts\local-setup.mjs
if errorlevel 1 goto FAILED

echo.
echo  [2/3] בוחר פורט פנוי...
set PORT=
for /f "delims=" %%p in ('node scripts\pick-port.mjs') do set PORT=%%p
if "!PORT!"=="" set PORT=3000
echo       פורט: !PORT!

echo.
echo  [3/3] מפעיל את השרת בחלון נפרד...
start "LemonTank Server" cmd /k "set PORT=!PORT!&& npm run start"

echo       ממתין שהאתר יעלה (עד 90 שניות)...
node scripts\open-later.mjs http://localhost:!PORT!

echo.
echo  ------------------------------------------------------------
echo    הבדיקה שהאתר באמת עונה:
node scripts\status.mjs
echo  ------------------------------------------------------------
echo.
echo    ^>^>^>  האתר שלך:  http://localhost:!PORT!
echo.
echo    כניסת מנהל:  admin@lemontank.local  /  ChangeMe-Admin-2026!
echo    הוספת תוכן:  http://localhost:!PORT!/admin/titles/new
echo.
echo    חשוב מאוד:
echo      * נפתח חלון נוסף בשם "LemonTank Server" - הוא האתר עצמו.
echo        כל עוד הוא פתוח האתר חי. סגירה שלו = האתר נופל.
echo        אם האתר לא עולה, השגיאה מופיעה בחלון הזה.
echo      * אל תגלוש ל-localhost:!PORT! לפני שהשרת רץ.
echo.
echo    אפשר לסגור את החלון הזה (הנוכחי) - הוא סיים את עבודתו.
echo  ------------------------------------------------------------
echo.
pause
exit /b 0

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

:FAILED
echo.
echo  [!] ההכנה נכשלה. השגיאה האמיתית מופיעה ממש מעל השורה הזו.
echo.
echo      שלב א': העתק לי את 20 השורות האחרונות שמופיעות כאן.
echo      שלב ב': הרץ את זה כדי לקבל דוח מלא:
echo                 npm run doctor -- --report
echo              ואז שלח לי את הקובץ lemontank-report.txt
echo.
pause
exit /b 1
