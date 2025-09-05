#!/bin/bash

echo "🚀 Starting Pluto Crypto Tracker..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm first."
    exit 1
fi

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "📦 Installing dependencies..."
pnpm install

echo "🎭 Installing Playwright browsers..."
cd backend && pnpm exec playwright install chromium && cd ..

echo "🔧 Generating ConnectRPC code..."
pnpm exec buf generate

echo "🔄 Starting both backend and frontend servers..."
echo "Backend will run on http://localhost:8080"
echo "Frontend will run on http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Start both servers concurrently
pnpm dev
