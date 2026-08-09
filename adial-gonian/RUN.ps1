# Adial Gonian - One-Click Setup & Run (PowerShell)
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Adial Gonian - Smart Desktop Assistant" -ForegroundColor Cyan
Write-Host "  One-Click Setup & Run" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $BaseDir

# 1. Check Python
Write-Host "[1/6] Checking Python..." -ForegroundColor Yellow
try {
    $pyVer = python --version 2>&1
    Write-Host "      Found: $pyVer" -ForegroundColor Green
} catch {
    Write-Host "      Python NOT found! Installing..." -ForegroundColor Red
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe' -OutFile "$env:TEMP\py_install.exe"
    Start-Process -Wait -FilePath "$env:TEMP\py_install.exe" -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_pip=1"
    Remove-Item "$env:TEMP\py_install.exe" -ErrorAction SilentlyContinue
    Write-Host "      Python installed!" -ForegroundColor Green
}

# 2. Check Node.js
Write-Host "[2/6] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node --version 2>&1
    Write-Host "      Found: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "      Node.js NOT found! Installing..." -ForegroundColor Red
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.16.0/node-v20.16.0-x64.msi' -OutFile "$env:TEMP\node_install.msi"
    Start-Process -Wait -FilePath "msiexec.exe" -ArgumentList "/i `"$env:TEMP\node_install.msi`" /qn"
    Remove-Item "$env:TEMP\node_install.msi" -ErrorAction SilentlyContinue
    $env:PATH += ";C:\Program Files\nodejs"
    Write-Host "      Node.js installed!" -ForegroundColor Green
}

# 3. Install Python packages
Write-Host "[3/6] Installing Python packages..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.pip_done")) {
    pip install -r backend\requirements.txt
    New-Item -Path "backend\.pip_done" -ItemType File -Force | Out-Null
    Write-Host "      Done!" -ForegroundColor Green
} else {
    Write-Host "      Already installed" -ForegroundColor DarkGray
}

# 4. Install Node.js packages
Write-Host "[4/6] Installing Node.js packages..." -ForegroundColor Yellow
if (-not (Test-Path "frontend\node_modules")) {
    Set-Location frontend
    npm install
    Set-Location $BaseDir
    Write-Host "      Done!" -ForegroundColor Green
} else {
    Write-Host "      Already installed" -ForegroundColor DarkGray
}

# 5. Config
Write-Host "[5/6] Configuring settings..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Copy-Item .env.example .env
}
Write-Host "      Done!" -ForegroundColor Green

# 6. Start!
Write-Host "[6/6] Starting Adial Gonian..." -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Adial Gonian is starting!" -ForegroundColor Green
Write-Host "  Backend:  http://localhost:8765" -ForegroundColor White
Write-Host "  API Docs: http://localhost:8765/docs" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Start Backend
Start-Process -FilePath "python" -ArgumentList "main.py" -WorkingDirectory "$BaseDir\backend" -WindowStyle Minimized

# Wait for backend
Start-Sleep -Seconds 4

# Start Frontend
Set-Location frontend
npx vite --host 0.0.0.0
Set-Location $BaseDir

Write-Host ""
Write-Host "Adial Gonian shut down. Goodbye!" -ForegroundColor Yellow
