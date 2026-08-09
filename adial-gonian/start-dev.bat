@echo off
chcp 65001 >nul 2>&1
echo ============================================
echo   אדיאל גוניון - Development Mode
echo   Backend only (no Electron)
echo ============================================
echo.
echo Starting backend on http://localhost:8765
echo.
echo API docs: http://localhost:8765/docs
echo.

cd backend
python main.py
