# Deployment Checklist for Ask Questions in an Image

## Files Modified/Created

### ✅ New Files Created
1. **`src/DetectAndAsk.js`** - New "Detect Anything + Ask Anything" page component
2. **`api/detect-and-ask.js`** - API endpoint for localize-objects → image-contents pipeline
3. **`DEPLOYMENT_CHECKLIST.md`** - This file

### ✅ Modified Files
1. **`src/index.js`** - Added React Router and routes for both pages
2. **`src/App.js`** - Added navigation links in header
3. **`DEVELOPMENT_GUIDE.md`** - Updated with new architecture documentation
4. **`package.json`** - Added react-router-dom dependency

## Required Dependencies

### New Package Added
```bash
npm install react-router-dom
```

This was already installed in development, but make sure it's in `package.json`:
```json
{
  "dependencies": {
    "react-router-dom": "^6.x.x"
  }
}
```

## Environment Variables Required

### `.env.local` (for local development)
```bash
EYEPOP_API_KEY=your_eyepop_api_key_here
```

### Vercel Dashboard (for production)
Set in Vercel project settings → Environment Variables:
- **Variable Name**: `EYEPOP_API_KEY`
- **Value**: Your EyePop API key
- **Environments**: Production, Preview, Development

## Files to Commit and Push

### All modified files:
```bash
git add src/DetectAndAsk.js
git add api/detect-and-ask.js
git add src/index.js
git add src/App.js
git add DEVELOPMENT_GUIDE.md
git add DEPLOYMENT_CHECKLIST.md
git add package.json
git add package-lock.json
```

### Files NOT to commit (should be in .gitignore):
- `.env.local` - Contains your API key
- `node_modules/` - Dependencies folder
- `.vercel/` - Vercel build cache

## Pre-Push Checklist

- [ ] **Verify `.gitignore` exists and contains:**
  ```
  .env.local
  .env*.local
  node_modules
  .vercel
  ```

- [ ] **Test locally with `npx vercel dev`**
  - [ ] Original page works at `http://localhost:3000/`
  - [ ] New Detect + Ask page works at `http://localhost:3000/detect-and-ask`
  - [ ] Navigation between pages works
  - [ ] Image upload works on both pages
  - [ ] API calls work (check Network tab)
  - [ ] Results display properly

- [ ] **Verify all files are tracked:**
  ```bash
  git status
  ```

- [ ] **Review changes:**
  ```bash
  git diff
  ```

## Deployment Steps

### 1. Local Testing
```bash
cd /Users/sharozjavaid/Desktop/StartupWeekDemo/Labs/react/ask-questions-in-an-image
npm install
npx vercel dev
```
Test both pages thoroughly.

### 2. Commit Changes
```bash
git add .
git commit -m "Add Detect Anything + Ask Anything feature with confidence threshold slider"
```

### 3. Push to Repository
```bash
git push origin main
```

### 4. Verify Vercel Deployment
- Vercel will auto-deploy when you push to main
- Check Vercel dashboard for deployment status
- Verify environment variables are set in Vercel

### 5. Test Production
- Visit your Vercel URL
- Test both pages
- Verify API calls work in production

## Features Added

### 1. Detect Anything + Ask Anything Page
- **Route**: `/detect-and-ask`
- **Features**:
  - Object detection using `eyepop.localize-objects:latest`
  - Crop detected regions
  - Forward to `eyepop.image-contents:latest` for Q&A analysis
  - Bounding box visualization on canvas
  - Confidence threshold slider (0-100%)
  - Real-time filtering of results
  - Only shows detections with analysis results

### 2. Confidence Threshold Slider
- Adjustable from 0% to 100%
- Filters detections in real-time
- Only shows detections that have Q&A answers
- Redraws canvas when threshold changes
- Shows "X of Y detections with analysis results"

### 3. Navigation
- Header navigation on both pages
- Link to original "Image Q&A" page
- Link to new "Detect + Ask" page

## Architecture

### Original Page (`/`)
```
Image → eyepop.image-contents:latest → Questions → Results
```

### New Page (`/detect-and-ask`)
```
Image → eyepop.localize-objects:latest (detect prompt)
     → CROP operator
     → eyepop.image-contents:latest (questions)
     → Results with bounding boxes + Q&A
```

## Troubleshooting

### If deployment fails:
1. Check Vercel build logs
2. Verify `EYEPOP_API_KEY` is set in Vercel
3. Check `package.json` has all dependencies
4. Verify all imports use correct paths

### If API calls fail in production:
1. Check Vercel Function logs
2. Verify environment variable is accessible
3. Check CORS settings if needed

### If routing doesn't work:
1. Verify `vercel.json` has rewrites configured
2. Check React Router setup in `src/index.js`

## Post-Deployment Testing

- [ ] Test original Image Q&A page
- [ ] Test new Detect + Ask page
- [ ] Upload different image types
- [ ] Test confidence slider
- [ ] Test navigation between pages
- [ ] Check mobile responsiveness
- [ ] Verify results display correctly

## Support

For issues:
- Check browser console for errors
- Check Vercel function logs
- Review EyePop API documentation
- Check `DEVELOPMENT_GUIDE.md` for technical details

---

**Last Updated**: October 6, 2025
**Status**: Ready for deployment
**Required Action**: Set `EYEPOP_API_KEY` in Vercel before deploying


