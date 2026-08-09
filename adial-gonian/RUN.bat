@echo off
chcp 65001 >nul 2>&1
title Adial Gonian
color 0A
echo.
echo ============================================
echo   Adial Gonian - Smart Desktop Assistant
echo ============================================
echo.

cd /d "%~dp0"

echo [1/2] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo     Python NOT found! Install from https://python.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version 2^>^&1') do echo     %%i

echo [2/2] Installing packages...
if not exist ".pip_done" (
    pip install -r requirements.txt
    echo. > .pip_done
    echo     Done!
) else (
    echo     Already installed
)

echo.
echo ============================================
echo   Adial Gonian is starting!
echo ============================================
echo.

python adial_gonian.py
