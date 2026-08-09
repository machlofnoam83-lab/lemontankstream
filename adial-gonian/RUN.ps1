# Adial Gonian - One-Click Run
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ⚡ אדיאל גוניון - Adial Gonian ⚡" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $BaseDir

# Check Python
Write-Host "[1/2] Checking Python..." -ForegroundColor Yellow
try {
    $v = python --version 2>&1
    Write-Host "      $v" -ForegroundColor Green
} catch {
    Write-Host "      Python NOT found! Please install from https://python.org" -ForegroundColor Red
    Write-Host "      Make sure to check 'Add Python to PATH' during install" -ForegroundColor Red
    Read-Host "Press Enter to exit"; exit 1
}

# Install packages
Write-Host "[2/2] Installing packages (first time only)..." -ForegroundColor Yellow
if (-not (Test-Path ".pip_done")) {
    pip install -r requirements.txt 2>&1 | ForEach-Object { Write-Host "      $_" }
    New-Item -Path ".pip_done" -ItemType File -Force | Out-Null
    Write-Host "      Done!" -ForegroundColor Green
} else {
    Write-Host "      Already installed" -ForegroundColor DarkGray
}

# LAUNCH!
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ⚡  אדיאל גוניון is starting!  ⚡" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

python adial_gonian.py
