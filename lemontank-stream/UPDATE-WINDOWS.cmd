@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title LemonTank Stream - עדכון לַגרסה האחרונה

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

node scripts\update.mjs
if errorlevel 1 goto FAILED

echo.
echo  ------------------------------------------------------------
echo    עכשיו מפעילים את האתר. רוצה שזה יקרה לבד?  npm run autostart
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

:GIT_MISSING
echo  [!] Git לא מותקן - בלעדיו אי אפשר להוריד את הקוד החדש.
echo.
echo      זו ההתקנה הרשמית (חינם, ברירת מחדל עד הסוף):
start "" https://git-scm.com/download/win
echo.
echo      אחרי ההתקנה: סגור את כל חלונות ה-cmd, ופתח שוב את הקובץ הזה.
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
