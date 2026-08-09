@echo off
chcp 65001 >nul 2>&1
echo ============================================
echo   אדיאל גוניון - Installation Script
echo ============================================
echo.

:: Check prerequisites
echo Checking prerequisites...
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [MISSING] Python 3.10+ - Install from https://python.org
) else (
    python --version
    echo [OK] Python found
)

node --version >nul 2>&1
if errorlevel 1 (
    echo [MISSING] Node.js 18+ - Install from https://nodejs.org
) else (
    node --version
    echo [OK] Node.js found
)

ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo [MISSING] FFmpeg - Recommended for audio playback
) else (
    echo [OK] FFmpeg found
)

echo.
echo ============================================
echo   Installing Python dependencies...
echo ============================================
cd backend
pip install -r requirements.txt
cd ..

echo.
echo ============================================
echo   Installing Node.js dependencies...
echo ============================================
cd frontend
call npm install
cd ..

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo Next steps:
echo   1. Copy .env.example to .env
echo   2. Edit .env and add your API keys
echo   3. Run start.bat to launch the assistant
echo.
pause
