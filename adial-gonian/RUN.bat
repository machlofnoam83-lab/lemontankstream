@echo off
chcp 65001 >nul 2>&1
title Adial Gonian - Setup and Run
color 0A

echo.
echo ============================================
echo   Adial Gonian - Smart Desktop Assistant
echo   One-Click Setup and Run
echo ============================================
echo.

set "BASEDIR=%~dp0"
cd /d "%BASEDIR%"

echo [1/6] Checking Python...
where python >nul 2>&1
if errorlevel 1 (
    echo     Python NOT found! Installing...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe' -OutFile '%TEMP%\py_install.exe'"
    "%TEMP%\py_install.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1
    del "%TEMP%\py_install.exe" >nul 2>&1
    echo     Python installed!
) else (
    for /f "tokens=*" %%i in ('python --version 2^>^&1') do echo     Found: %%i
)

echo [2/6] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo     Node.js NOT found! Installing...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.16.0/node-v20.16.0-x64.msi' -OutFile '%TEMP%\node_install.msi'"
    msiexec /i "%TEMP%\node_install.msi" /qn
    del "%TEMP%\node_install.msi" >nul 2>&1
    echo     Node.js installed! Please restart terminal after this run.
) else (
    for /f "tokens=*" %%i in ('node --version 2^>^&1') do echo     Found: %%i
)

REM Refresh PATH
set "PATH=%PATH%;C:\Program Files\nodejs;%LOCALAPPDATA%\Volta\tools\image\node\20\bin"

echo [3/6] Installing Python packages...
if not exist "backend\.pip_done" (
    pip install -r backend\requirements.txt
    if not errorlevel 1 echo. > "backend\.pip_done"
    echo     Done!
) else (
    echo     Already installed
)

echo [4/6] Installing Node.js packages...
where npm >nul 2>&1
if not errorlevel 1 (
    if not exist "frontend\node_modules" (
        cd frontend
        call npm install
        cd /d "%BASEDIR%"
        echo     Done!
    ) else (
        echo     Already installed
    )
) else (
    echo     SKIPPED - npm not found. Backend will still work.
)

echo [5/6] Configuring settings...
if not exist ".env" (
    copy .env.example .env >nul
)
echo     Done!

echo [6/6] Starting Adial Gonian...
echo.
echo ============================================
echo   Adial Gonian is starting!
echo   Backend:  http://localhost:8765
echo   API Docs: http://localhost:8765/docs
echo ============================================
echo.

start "Adial Gonian Backend" /min cmd /c "cd /d "%BASEDIR%backend" && python main.py"

timeout /t 4 /nobreak >nul

where npx >nul 2>&1
if not errorlevel 1 (
    if exist "frontend\node_modules" (
        cd frontend
        call npx vite --host 0.0.0.0
        cd /d "%BASEDIR%"
    ) else (
        echo   Backend running at http://localhost:8765
        echo   Open http://localhost:8765/docs in your browser
        echo.
        echo   Press Ctrl+C to stop
        pause
    )
) else (
    echo   Backend running at http://localhost:8765
    echo   Open http://localhost:8765/docs in your browser
    echo.
    echo   To install HUD later: install Node.js from https://nodejs.org
    echo   Then restart this script.
    echo.
    echo   Press Ctrl+C to stop
    pause
)

echo.
echo Adial Gonian shut down.
