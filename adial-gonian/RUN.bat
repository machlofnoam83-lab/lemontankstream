@echo off
chcp 65001 >nul 2>&1
title אדיאל גוניון - Auto Setup & Run
color 0A

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   ⚡ אדיאל גוניון - Adial Gonian ⚡     ║
echo  ║   Smart Desktop Assistant                ║
echo  ║   One-Click Setup & Run                  ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ============================================
:: 0. Find this script's directory
:: ============================================
set "BASEDIR=%~dp0"
cd /d "%BASEDIR%"

:: ============================================
:: 1. Check Python
:: ============================================
echo [1/6] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo        Python NOT found - installing...
    echo        Downloading Python 3.12...
    powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe' -OutFile '%TEMP%\python_installer.exe'"
    echo        Installing Python (please wait)...
    "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1
    del "%TEMP%\python_installer.exe" >nul 2>&1
    echo        Python installed!
) else (
    for /f "tokens=*" %%i in ('python --version 2^>^&1') do echo        Found: %%i
)

:: ============================================
:: 2. Check Node.js
:: ============================================
echo [2/6] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo        Node.js NOT found - installing...
    echo        Downloading Node.js 20...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.16.0/node-v20.16.0-x64.msi' -OutFile '%TEMP%\node_installer.msi'"
    echo        Installing Node.js (please wait)...
    msiexec /i "%TEMP%\node_installer.msi" /qn
    del "%TEMP%\node_installer.msi" >nul 2>&1
    echo        Node.js installed! Refreshing PATH...
    set "PATH=%PATH%;C:\Program Files\nodejs"
) else (
    for /f "tokens=*" %%i in ('node --version 2^>^&1') do echo        Found: %%i
)

:: ============================================
:: 3. Install Python dependencies
:: ============================================
echo [3/6] Installing Python packages...
if not exist "backend\.pip_done" (
    pip install -r backend\requirements.txt --quiet 2>nul
    if errorlevel 1 (
        pip install -r backend\requirements.txt
    )
    echo. > "backend\.pip_done"
    echo        Done!
) else (
    echo        Already installed (skip)
)

:: ============================================
:: 4. Install Node.js dependencies
:: ============================================
echo [4/6] Installing Node.js packages...
if not exist "frontend\node_modules" (
    cd frontend
    call npm install --silent 2>nul
    if errorlevel 1 (
        call npm install
    )
    cd /d "%BASEDIR%"
    echo        Done!
) else (
    echo        Already installed (skip)
)

:: ============================================
:: 5. Create .env if needed
:: ============================================
echo [5/6] Configuring settings...
if not exist ".env" (
    copy .env.example .env >nul
)
echo        Done!

:: ============================================
:: 6. Start the system!
:: ============================================
echo [6/6] Starting אדיאל גוניון...
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   ⚡  אדיאל גוניון is starting!  ⚡      ║
echo  ║                                          ║
echo  ║   Say "אדיאל גוניון" to activate!       ║
echo  ║                                          ║
echo  ║   Backend:  http://localhost:8765         ║
echo  ║   API Docs: http://localhost:8765/docs    ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Start Backend
start "Adial Gonian Backend" /min cmd /c "cd /d "%BASEDIR%backend" && python main.py"

:: Wait for backend
timeout /t 3 /nobreak >nul

:: Start Frontend (Electron)
cd frontend
call npx concurrently "npx vite --host 0.0.0.0" "wait-on http://localhost:5173 && npx electron ." 2>nul
if errorlevel 1 (
    :: Fallback: just run vite dev
    call npx vite --host 0.0.0.0
)
cd /d "%BASEDIR%"

echo.
echo אדיאל גוניון shut down. Goodbye!
pause
