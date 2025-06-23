# EyePop.ai Data Ingestion Demo

This repository contains a Python script that demonstrates how to ingest data into a dataset on EyePop.ai for training computer vision models.

## What It Does

The demo script (`main.py`) walks through the following process:

1. Reads a sample image from the `input/` folder
2. Authenticates with the EyePop.ai API using a secret key
3. Uploads the image to a specified dataset
4. Waits for the asset to be processed and accepted
5. Adds sample ground truth annotation (bounding box + keypoint)
6. Retrieves and displays the asset details including annotations

## Requirements

- Python 3.8+
- Install dependencies with:

```bash
pip install -r requirements.txt
```

You will also need:
- An EyePop.ai API Key (set it as `EYEPOP_API_KEY` in your environment)

### Setting the API Key

You must set the `EYEPOP_API_KEY` environment variable before running the script. Here's how:

**On macOS/Linux (bash or zsh):**

Temporarily (per session):
```bash
export EYEPOP_API_KEY=your_actual_api_key
```

Permanently (in `~/.bashrc` or `~/.zshrc`):
```bash
echo 'export EYEPOP_API_KEY=your_actual_api_key' >> ~/.zshrc
source ~/.zshrc  # or source ~/.bashrc
```

**On Windows (Command Prompt):**

Temporarily:
```cmd
set EYEPOP_API_KEY=your_actual_api_key
```

Permanently:
1. Open “System Properties” → “Environment Variables…”
2. Under "User variables", click "New..."
3. Enter:
   - **Name:** `EYEPOP_API_KEY`
   - **Value:** your actual API key
4. Restart your terminal

- A dataset UUID and account UUID from your EyePop.ai workspace

## Usage

```bash
python main.py <accountUUID> <datasetUUID>
```

Replace `<accountUUID>` and `<datasetUUID>` with values from your EyePop.ai account.

## Folder Structure

- `main.py` – The main demo script
- `input/sample.jpeg` – A placeholder image file to upload (you can replace it with your own)
- `readme.md` – This documentation

## Notes

- You can edit the `build_ground_truth` function in `main.py` to match your actual labeling schema.
- This script is designed for demo and onboarding purposes and may not include full production-grade error handling.