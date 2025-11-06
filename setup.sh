#!/bin/bash
# Setup script for Formula OCR Web

set -e

echo "🚀 Formula OCR Web - Setup Script"
echo "=================================="
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 18"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be >= 18 (current: $(node -v))"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server
npm install
cd ..

# Install web dependencies
echo "📦 Installing web dependencies..."
cd web
npm install
cd ..

# Setup .env if not exists
if [ ! -f "server/.env" ]; then
    echo "⚙️  Creating server/.env from .env.example..."
    cp server/.env.example server/.env
    echo ""
    echo "⚠️  Please edit server/.env and set OCR_BASE to your PaddleOCR service URL"
    echo "   Example: OCR_BASE=http://127.0.0.1:8118/v1"
else
    echo "✅ server/.env already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit server/.env and configure OCR_BASE"
echo "     Example: OCR_BASE=http://127.0.0.1:8118/v1"
echo ""
echo "  2. Start development server:"
echo "     npm run dev          # Start both frontend and backend"
echo ""
echo "     Or start separately for easier debugging:"
echo "     cd server && npm run dev   # Terminal 1"
echo "     cd web && npm run dev      # Terminal 2"
echo ""
echo "  3. Open http://localhost:5173 in your browser"
echo ""

