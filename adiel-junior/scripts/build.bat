@echo off
rem ============================================
rem  Adiel Junior - Build (Windows x64 Release)
rem ============================================
chcp 65001 >nul
powershell -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
if errorlevel 1 (
    echo.
    echo בנייה נכשלה. ראו הודעות למעלה.
    pause
)
