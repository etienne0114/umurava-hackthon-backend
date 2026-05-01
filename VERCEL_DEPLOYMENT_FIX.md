# Vercel Deployment Fix - Backend API 404 Issue

## Problem Identified
The backend API was returning "404 NOT_FOUND" on Vercel because:
1. The `vercel.json` configuration wasn't explicitly including the `dist/` folder
2. The serverless function entry point needed better error handling
3. The routing configuration needed simplification

## Changes Made

### 1. Updated `vercel.json`
```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node",
      "config": {
        "includeFiles": ["dist/**"]
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/api/index.js"
    }
  ]
}
```

**Key changes:**
- Added `"includeFiles": ["dist/**"]` to explicitly include compiled TypeScript files
- Simplified routing to a single catch-all rule
- All requests now route to `/api/index.js`

### 2. Enhanced `api/index.js`
Added better error handling and logging:
- Sets `VERCEL=1` environment variable explicitly
- Logs successful app loading
- Validates that the Express app is properly exported
- Better error messages for debugging

## Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)
```bash
cd backend
npm install -g vercel  # If not already installed
vercel --prod
```

### Option 2: Deploy via Git Push
```bash
git add backend/vercel.json backend/api/index.js
git commit -m "fix: Update Vercel configuration for proper serverless deployment"
git push origin main
```

Vercel will automatically detect the push and redeploy.

### Option 3: Redeploy from Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Find your project: `umurava-hackthon-backend`
3. Click "Deployments" tab
4. Click "Redeploy" on the latest deployment
5. Select "Use existing Build Cache" = NO (force fresh build)

## Verification Steps

After deployment, test the API:

```bash
# Test health endpoint
curl https://umurava-hackthon-backend.vercel.app/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2026-05-01T...",
  "services": {
    "database": "ok",
    "gemini": "ok"
  }
}
```

## Environment Variables Checklist

Ensure these are set in Vercel Dashboard → Project Settings → Environment Variables:

- ✅ `MONGODB_URI` - Your MongoDB connection string
- ✅ `JWT_SECRET` - Secret for JWT token generation
- ✅ `GEMINI_API_KEY` - Google Gemini API key
- ✅ `OPENROUTER_API_KEY` - OpenRouter API key (fallback)
- ✅ `NODE_ENV` - Set to `production`
- ✅ `PORT` - Set to `3000` (optional, Vercel handles this)
- ✅ `ALLOWED_ORIGINS` - Frontend URL (e.g., `https://your-frontend.vercel.app`)

## Troubleshooting

### If still getting 404:
1. Check Vercel build logs:
   - Go to Vercel Dashboard → Deployments → Click on latest deployment
   - Check "Building" and "Deployment" logs
   - Look for errors during `npm run vercel-build`

2. Verify `dist/` folder is created:
   - In build logs, look for TypeScript compilation output
   - Should see "tsc" command completing successfully

3. Check function logs:
   - Go to Vercel Dashboard → Deployments → Functions tab
   - Click on `api/index.js` function
   - Check runtime logs for errors

### If getting 500 errors:
1. Check environment variables are set correctly
2. Verify MongoDB connection string is accessible from Vercel
3. Check function logs for specific error messages

## Local Testing

Test the serverless function locally:
```bash
cd backend
npm run build
node -e "process.env.VERCEL='1'; const app = require('./api/index.js'); console.log('App loaded:', typeof app);"
```

Should output:
```
Successfully loaded Express app from dist/server.js
App loaded: function
Is function: true
```

## Next Steps

1. **Redeploy to Vercel** using one of the options above
2. **Test the API** using the curl command
3. **Update frontend** `.env` file with the correct backend URL
4. **Monitor logs** in Vercel dashboard for any runtime errors

## Additional Notes

- The `vercel-build` script runs `npm run build` which compiles TypeScript to `dist/`
- The `api/index.js` file is the serverless function entry point
- Vercel automatically detects and runs `vercel-build` during deployment
- The `dist/` folder must be included in the deployment (not in `.vercelignore`)
