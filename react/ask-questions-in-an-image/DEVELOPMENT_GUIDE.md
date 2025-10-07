# Ask Questions in an Image - Development Guide

## Project Overview

This is a React application that allows users to upload images and ask questions about them using the EyePop.ai API. The app processes images and provides AI-powered answers to user-defined questions.

## Tech Stack

- **Frontend**: React 19.1.1 with Create React App
- **Build Tool**: react-app-rewired (for webpack customization)
- **API**: Node.js serverless functions (Vercel API routes)
- **AI Service**: EyePop.ai SDK (@eyepop.ai/eyepop v2.0.0)
- **Deployment**: Vercel
- **Styling**: Custom CSS with EyePop branding

## Architecture

### Frontend (React App)
- **Location**: `/src/App.js`
- **Purpose**: UI for image upload, question management, and results display
- **Key Features**:
  - Drag-and-drop image upload
  - Predefined question sets (Image Description, Content Monitoring, Car Inspection, etc.)
  - Custom question addition/removal
  - Results display with confidence scores

### Backend (API Routes)
- **Location**: `/api/ask-image.js`
- **Purpose**: Serverless function that processes images with EyePop.ai
- **Flow**:
  1. Receives POST request with base64 image and questions array
  2. Connects to EyePop.ai worker endpoint
  3. Configures inference component with user questions
  4. Processes image and returns classification results

### Configuration Files
- **`config-overrides.js`**: Webpack configuration for Node.js polyfills
- **`vercel.json`**: Vercel deployment configuration
- **`.env.local`**: Environment variables (API keys)

## Local Development Setup

### Prerequisites
- Node.js and npm installed
- Vercel CLI access via npx

### Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   - File: `.env.local` (already exists)
   - Contains: `EYEPOP_API_KEY` for EyePop.ai service

3. **Run Local Development**
   ```bash
   npx vercel dev
   ```
   - **Note**: Use `npx vercel dev` instead of `npm start`
   - This properly handles `/api` routes locally
   - Available at `http://localhost:3000`

### Why Vercel Dev vs npm start?

- **npm start**: Only serves React app, `/api` routes return 404
- **npx vercel dev**: Serves React app + handles API routes locally
- Mimics production Vercel environment exactly

## Key Files Structure

```
ask-questions-in-an-image/
├── src/
│   ├── App.js              # Main React component
│   ├── App.css             # Styling
│   └── index.js            # React entry point
├── api/
│   └── ask-image.js        # EyePop.ai integration API
├── public/                 # Static assets
├── config-overrides.js     # Webpack polyfill config
├── vercel.json            # Vercel configuration
├── .env.local             # Environment variables
└── package.json           # Dependencies and scripts
```

## EyePop.ai Integration Details

### Current Implementation
- **API Route**: `/api/ask-image.js`
- **SDK Usage**: Server-side only (not in React frontend)
- **Component**: `PopComponentType.INFERENCE` with `eyepop.image-contents:latest`
- **Input**: Base64 image + question array
- **Output**: Classification results with confidence scores

### Available Question Sets
1. **Image Description**: General image analysis
2. **Content Monitoring**: Content safety and appropriateness
3. **Car Inspection**: Vehicle condition assessment
4. **Home Inspection**: Property condition evaluation
5. **Person Style**: Clothing and appearance analysis
6. **Person Action**: Human activity detection
7. **Fireplace Inspection**: Fireplace condition assessment
8. **Water Heater Inspection**: Water heater evaluation

## Common Issues & Solutions

### 1. 404 Errors on API Routes
**Problem**: Using `npm start` instead of `npx vercel dev`
**Solution**: Always use `npx vercel dev` for local development

### 2. Webpack Polyfill Errors
**Problem**: EyePop SDK requires Node.js `path` module
**Solution**: 
- `config-overrides.js` provides `path-browserify` polyfill
- `vercel.json` ensures `react-app-rewired` is used

### 3. Missing Environment Variables
**Problem**: API calls fail without EyePop key
**Solution**: Ensure `.env.local` contains valid `EYEPOP_API_KEY`

## Two Demo Pages

### 1. Image Q&A (Original - `/`)
- **Location**: `/src/App.js`
- **API Route**: `/api/ask-image.js`
- **Capability**: Direct image analysis with `eyepop.image-contents:latest`
- **Use Case**: Ask questions about the entire image content
- **Flow**: Upload image → Ask questions → Get answers

### 2. Detect Anything + Ask Anything (NEW - `/detect-and-ask`)
- **Location**: `/src/DetectAndAsk.js`
- **API Route**: `/api/detect-and-ask.js`
- **Capability**: Object detection with `eyepop.localize-objects:latest` → crop → `image-contents:latest`
- **Use Case**: Detect specific objects, then ask questions about each detected object
- **Flow**: 
  1. Upload image
  2. Enter detection prompt (e.g., "water heater", "car", "person")
  3. Enter analysis questions
  4. See bounding boxes + per-object analysis results

### Architecture Comparison

**Image Q&A Pipeline:**
```
Image → eyepop.image-contents:latest → Questions → Results
```

**Detect + Ask Pipeline:**
```
Image → eyepop.localize-objects:latest (detect) 
     → CROP operator 
     → eyepop.image-contents:latest (analyze) 
     → Results with bounding boxes
```

### Key Technical Details

**Detect + Ask Implementation:**
- Uses EyePop's `ForwardOperatorType.CROP` to extract detected regions
- Each detected object is cropped and forwarded to image-contents
- Results include both spatial data (bounding boxes) and semantic analysis (Q&A)
- Canvas rendering displays bounding boxes with labels overlaid on the original image

## Deployment

### Production (Vercel)
- **Auto-deployment**: Pushes to main branch trigger deployment
- **Environment**: Set `EYEPOP_API_KEY` in Vercel dashboard
- **Build**: Uses `react-app-rewired build` command

### Development Workflow
1. Make changes locally with `npx vercel dev`
2. Test functionality
3. Commit and push to git
4. Vercel auto-deploys to production

## Dependencies

### Core Dependencies
- `react`: ^19.1.1
- `@eyepop.ai/eyepop`: ^2.0.0
- `react-scripts`: 5.0.1

### Development Dependencies  
- `react-app-rewired`: ^2.2.1
- `path-browserify`: ^1.0.1

## Environment Variables

```bash
# .env.local
EYEPOP_API_KEY=your_eyepop_api_key_here

# Legacy (not used but referenced in README)
NEXT_PUBLIC_ANYTHING_POP_API_KEY=your_eyepop_api_key_here
```

---

**Last Updated**: $(date)
**Status**: Working local development environment established
**Next Goal**: Integrate EyePop object localization with existing image contents analysis