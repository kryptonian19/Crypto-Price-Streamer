Write-Host "🚀 Starting Pluto Crypto Tracker..." -ForegroundColor Green

# Check if pnpm is installed
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ pnpm is not installed. Please install pnpm first." -ForegroundColor Red
    exit 1
}

# Check if node is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
pnpm install

Write-Host "🎭 Installing Playwright browsers..." -ForegroundColor Yellow
Set-Location backend
pnpm exec playwright install chromium
Set-Location ..

Write-Host "🔧 Generating ConnectRPC code..." -ForegroundColor Yellow
pnpm exec buf generate

Write-Host "🔄 Starting both backend and frontend servers..." -ForegroundColor Yellow
Write-Host "Backend will run on http://localhost:8080" -ForegroundColor Cyan
Write-Host "Frontend will run on http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop both servers" -ForegroundColor Yellow

# Start both servers concurrently
pnpm dev
