# EyePop Dataset Ingestion Tool

This tool uploads an asset to an EyePop.ai dataset and assigns a ground truth annotation using the EyePop Node SDK.

## 1. Install Dependencies

Ensure all required packages are installed:

```bash
npm install
npm install --save @eyepop.ai/eyepop
npm install --save-dev ts-node typescript @types/node
```

## 2. Configure TypeScript

If you do not already have a `tsconfig.json`, generate one:

```bash
npx tsc --init
```

Ensure it is configured for ES modules and top-level `await`.

## 3. Set Your API Key

Provide your EyePop API key via environment variable.

**Option A: Inline**

```bash
EYEPOP_API_KEY=your_real_key npm run start -- your-account-uuid your-dataset-uuid
```

**Option B: .env file**

Create a `.env` file in the project root:

```
EYEPOP_API_KEY=your_real_key
```

## 4. Run the Ingestion Script

Use the following command to upload an asset and label it:

```bash
npm run start -- your-account-uuid your-dataset-uuid
```

Replace `your-account-uuid` and `your-dataset-uuid` with your actual values.