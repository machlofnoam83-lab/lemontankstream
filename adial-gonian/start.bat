@echo off
chcp 65001 >nul 2>&1
title אדיאל גוניון - Adial Gonian

echo ============================================
echo   אדיאל גוניון - Adial Gonian
echo   Smart Desktop Assistant
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed!
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

:: ============================================
:: 1. Setup Backend (first run)
:: ============================================
if not exist "backend\.installed" (
    echo [1/4] Installing Python dependencies...
    cd backend
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install Python dependencies
        cd ..
        pause
        exit /b 1
    )
    echo. > .installed
    cd ..
) else (
    echo [1/4] Python dependencies already installed
)

:: ============================================
:: 2. Setup Frontend (first run)
:: ============================================
if not exist "frontend\node_modules" (
    echo [2/4] Installing Node.js dependencies...
    cd frontend
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install Node.js dependencies
        cd ..
        pause
        exit /b 1
    )
    cd ..
) else (
    echo [2/4] Node.js dependencies already installed
)

:: ============================================
:: 3. Create .env if not exists
:: ============================================
if not exist ".env" (
    echo [3/4] Creating .env from template...
    copy .env.example .env
    echo.
    echo [IMPORTANT] Edit .env and add your API keys!
    echo   - OPENAI_API_KEY or ANTHROPIC_API_KEY
    echo.
) else (
    echo [3/4] .env file exists
)

:: ============================================
:: 4. Download Vosk model (first run)
:: ============================================
if not exist "backend\models\vosk-model-small-en-us-0.15" (
    echo [4/4] Downloading Vosk model...
    if not exist "backend\models" mkdir "backend\models"
    cd backend\models
    echo Downloading from alphacephei.com...
    powershell -Command "Invoke-WebRequest -Uri 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip' -OutFile 'vosk-model.zip'"
    if exist "vosk-model.zip" (
        echo Extracting...
        powershell -Command "Expand-Archive -Path 'vosk-model.zip' -DestinationPath '.' -Force"
        del vosk-model.zip
    )
    cd ..\..
) else (
    echo [4/4] Vosk model already exists
)

echo.
echo ============================================
echo   Starting אדיאל גוניון...
echo ============================================
echo.

:: Start Backend in background
echo Starting backend server on port 8765...
start "Adial Gonian - Backend" /min cmd /c "cd backend && python main.py"

:: Wait for backend to be ready
echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

:: Start Frontend (Electron)
echo Starting HUD frontend...
cd frontend
call npm run electron:dev
cd ..

echo.
echo אדיאל גוניון has been shut down.
pause
