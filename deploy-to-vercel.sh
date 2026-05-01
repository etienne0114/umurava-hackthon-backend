#!/bin/bash

# Vercel Deployment Script for Backend API
# This script deploys the backend to Vercel with proper configuration

set -e  # Exit on error

echo "🚀 Starting Vercel Deployment Process..."
echo ""

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the backend directory."
    exit 1
fi

# Check if vercel.json exists
if [ ! -f "vercel.json" ]; then
    echo "❌ Error: vercel.json not found."
    exit 1
fi

echo "✅ Configuration files found"
echo ""

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist/
echo "✅ Clean complete"
echo ""

# Run build locally to verify
echo "🔨 Building TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix TypeScript errors before deploying."
    exit 1
fi
echo "✅ Build successful"
echo ""

# Check if dist folder was created
if [ ! -d "dist" ]; then
    echo "❌ Error: dist/ folder not created. Build may have failed."
    exit 1
fi

echo "✅ dist/ folder created successfully"
echo ""

# Test if api/index.js can load the app
echo "🧪 Testing serverless entry point..."
node -e "process.env.VERCEL='1'; try { const app = require('./api/index.js'); console.log('✅ App loads successfully'); } catch(e) { console.error('❌ Failed to load app:', e.message); process.exit(1); }" 2>&1 | grep -E "(✅|❌)"
if [ $? -ne 0 ]; then
    echo "❌ Serverless entry point test failed"
    exit 1
fi
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI not found. Installing..."
    npm install -g vercel
    echo "✅ Vercel CLI installed"
    echo ""
fi

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
echo ""
echo "Choose deployment type:"
echo "  1) Production deployment (--prod)"
echo "  2) Preview deployment (default)"
echo ""
read -p "Enter choice (1 or 2): " choice

if [ "$choice" = "1" ]; then
    echo ""
    echo "🚀 Deploying to PRODUCTION..."
    vercel --prod
else
    echo ""
    echo "🚀 Deploying to PREVIEW..."
    vercel
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Check deployment logs in Vercel dashboard"
echo "  2. Test the API: curl https://your-deployment-url.vercel.app/api/health"
echo "  3. Update frontend .env with the new backend URL"
echo ""
