Write-Host "🚀 Setting up Pluto Crypto Tracker..." -ForegroundColor Green

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ pnpm is not installed. Installing via npm..." -ForegroundColor Red
    npm install -g pnpm
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites check passed" -ForegroundColor Green

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
pnpm install --recursive

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Generate protobuf files
Write-Host "🔧 Generating protocol buffer files..." -ForegroundColor Yellow
pnpm generate

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to generate protobuf files" -ForegroundColor Red
    exit 1
}

# Install Playwright browsers
Write-Host "🎭 Installing Playwright browsers..." -ForegroundColor Yellow
Set-Location backend
pnpm exec playwright install chromium
Set-Location ..

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install Playwright browsers" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the application, run:" -ForegroundColor Cyan
Write-Host "  .\run.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Or manually:" -ForegroundColor Cyan
Write-Host "  pnpm dev" -ForegroundColor White
