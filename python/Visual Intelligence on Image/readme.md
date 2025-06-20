# Visual Intelligence on Image

This demo uses the EyePop SDK to analyze an image using a custom natural language prompt and outputs structured results from the inference model.

## Setup Instructions

1. **Install Dependencies**  
   Make sure Python 3.10+ is installed. You can install required dependencies using:

   ```bash
   pip install -r requirements.txt
   ```

2. **Create `env.py`**

   This script depends on a file named `env.py` to securely load your EyePop API secret. You should create this file in the project root (next to `main.py`) and include the following:

   ```python
   EYEPOP_SECRET_KEY = "your-secret-key-here"
   ```

   Replace `"your-secret-key-here"` with your actual EyePop secret key from your developer dashboard.

3. **Run the Script**

   To run the script and analyze the image:

   ```bash
   python3 main.py
   ```

## What the Script Does

- Reads the EyePop secret key from `env.py`
- Constructs a prompt based on a list of questions about the object in the image (e.g. a vehicle)
- Sends the prompt to the EyePop API using the `eyepop.image-contents:latest` model
- Uploads a local image (`./images/example1.jpg`)
- Prints the structured result from the model in JSON format