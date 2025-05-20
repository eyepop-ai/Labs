1. Install dependencies

If you haven’t already, install the necessary packages:

npm install
npm install --save @eyepop.ai/eyepop
npm install --save-dev ts-node typescript @types/node

2. Ensure TypeScript is configured

If you don’t already have a tsconfig.json file, generate one:

npx tsc --init

3. Set your API key

Make sure your EYEPOP_API_KEY is set in your environment. You can set it inline or use a .env file.

Inline (one-time run):

EYEPOP_API_KEY=your_real_key npx ts-node main.ts your-account-uuid your-dataset-uuid

4. Run the script

Once everything is set up, run:

npm run start -- your-account-uuid your-dataset-uuid

Replace your-account-uuid and your-dataset-uuid with actual UUIDs.
