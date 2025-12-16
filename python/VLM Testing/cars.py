# flake8: noqa
import utils
import os
from PIL import Image
import json
import re
    

print("Categories:")
# print(utils.categories)
print(list(utils.categories.keys()))

image_folder_path_exterior = "./images/EyePop/Ground Truth/exterior"
image_folder_path_interior = "./images/EyePop/Ground Truth/interior"
image_folder_path_other = "./images/EyePop/Ground Truth/other"

image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'}
image_files = [
    os.path.join(image_folder_path_exterior, f)
    for f in os.listdir(image_folder_path_exterior)
    if os.path.splitext(f)[1].lower() in image_extensions
    ] + [
    os.path.join(image_folder_path_interior, f)
    for f in os.listdir(image_folder_path_interior)
    if os.path.splitext(f)[1].lower() in image_extensions
    ] + [
    os.path.join(image_folder_path_other, f)
    for f in os.listdir(image_folder_path_other)
    if os.path.splitext(f)[1].lower() in image_extensions
]

for image_path in image_files:
    print(f"Processing: {image_path}")
    
    # Dynamically populate categories from utils.categories
    categories = {}
    for cat_name, cat_info in utils.categories.items():
        categories[cat_name] = {}
        for key, value in cat_info.items():
            categories[cat_name][key] = value

    text_prompt = f"""Classify the content of the image into one of the following categories: {categories}.
Provide your answer as a JSON object with the category name as the key and a list of relevant labels as the value. If none of the categories apply, use "Other" as the category with an empty list of labels.
Example response:
{{
    "Exterior": ["car exterior", "good lighting", "driver front 3/4"],
    "Interior": [],
    "Document": [],
    "Other": []
}}"""
    
    print("Generated Prompt:")
    print(text_prompt)
    print("--------------------")

    
    token = "Bearer "+"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InZUdzF6bi02cjFPcXg0NmNxRl9PMiJ9.eyJodHRwczovL2lkZW50LmV5ZXBvcC5haS9lbWFpbCI6ImFuZHlAZXllcG9wLmFpIiwiaHR0cHM6Ly9pZGVudC5leWVwb3AuYWkvYXV0aC1wcm92aWRlci1pZCI6ImF1dGgwfDY0YzQyYWI5ODc0ZGU3OGQyZTlmM2U0YSIsImh0dHBzOi8vaWRlbnQuZXllcG9wLmFpL3VzZXItdXVpZCI6ImZmOTFkNDYxNDYwZjExZWY4YTgyMGEzNTlhZTBiYjlkIiwiaHR0cHM6Ly9jbGFpbXMuZXllcG9wLmFpL2dyYW50cyI6W3sicGVybWlzc2lvbiI6ImFjY2VzczppbmZlcmVuY2UtYXBpIiwidGFyZ2V0IjoidXNlcjphdXRoMHw2NGM0MmFiOTg3NGRlNzhkMmU5ZjNlNGEifSx7InBlcm1pc3Npb24iOiJ1c2VyOmNvbXB1dGUiLCJ0YXJnZXQiOiJhY2NvdW50OjQ5MzI2ZjJlMDg1YTQ2YzM5YmE3M2Y5MWM1MmU0MzZjIn0seyJwZXJtaXNzaW9uIjoidXNlcjpjb21wdXRlIiwidGFyZ2V0IjoiYWNjb3VudDpiNDk2N2ZkY2M3ZWU0ZGYxYTA2YjM3NTU2ZGQyMWM2ZSJ9LHsicGVybWlzc2lvbiI6ImFjY2VzczpkYXRhc2V0cyIsInRhcmdldCI6ImFjY291bnQ6NDkzMjZmMmUwODVhNDZjMzliYTczZjkxYzUyZTQzNmMifSx7InBlcm1pc3Npb24iOiJhY2Nlc3M6ZGF0YXNldHMiLCJ0YXJnZXQiOiJhY2NvdW50OmI0OTY3ZmRjYzdlZTRkZjFhMDZiMzc1NTZkZDIxYzZlIn1dLCJodHRwczovL3N0YWdpbmcuZXllcG9wLnh5ei9ncm91cHMiOlsiUmVnaXN0cnlVc2VyIl0sImlzcyI6Imh0dHBzOi8vYXV0aDAuZXllcG9wLnh5ei8iLCJzdWIiOiJhdXRoMHw2NGM0MmFiOTg3NGRlNzhkMmU5ZjNlNGEiLCJhdWQiOiJodHRwczovL2Rldi1hcHAuZXllcG9wLmFpIiwiaWF0IjoxNzY1MzA5MTczLCJleHAiOjE3NjUzMTYzNzMsInNjb3BlIjoiYWNjZXNzOmRhdGFzZXRzIHVzZXI6Y29tcHV0ZSIsImF6cCI6IklVdDBwczJtYVdaVWRFbUVPUFJhUEpLdmtRVHM2WVVFIiwicGVybWlzc2lvbnMiOlsiYWNjZXNzOmRhdGFzZXRzIiwiYWNjZXNzOmluZmVyZW5jZS1hcGkiLCJhZG1pbjphcmdvY2QiLCJhZG1pbjpjbG91ZC1pbnN0YW5jZXMiLCJhZG1pbjpjbG91ZHMiLCJyZWFkOm1vZGVsLXVybHMiLCJyZWFkOnJlZ2lzdHJ5IiwidXNlcjpjb21wdXRlIl19.EE4fmZABmtHDGpQN_qlx6kPaWTGW0GZS1SHoUEkH7Q93VE62_O1tpc8_nfZvjnqPS0j8XgMH53c6yo9gmJ43eNKDRTKVRgeSB4gt8k43NFdfkICvZBi0alppGWyksWzCm3HUJ3Xt55uTSPSSKNmGeOVvTnMXF6Gy3-xa_-241qocp9JucsrJVQ8NzvJclo_k0TfgGLs9L-QkFPPEYcNPTI3h4TUZG7-6P39mggpAebM4rnXvNscFSIFOB7LExZhCM_1xWiMhCYZ3Mw0VRi8joUllws_q9CIOp1cTAMvUw86XLmW4PYZvbhFCEYwq0STilivyaIs4IWbSrzzQIPijPA"
    worker_release = "smol"
    # worker_release = "qwen3-instruct"
    
    print("VLM: "+worker_release)
    print("--------------------")

    print("Resizing image...")    
    resized_image_path = utils.resize_image(image_path)
    print("--------------------")


    result = utils.infer_image_description_with_file(
        resized_image_path, text_prompt, token, worker_release=worker_release, max_new_tokens=50
    )
    # Pretty print the result

    print("Raw Output:")
    print(result.get("raw_output", ""))

    # Try to extract and pretty print the JSON part from raw_output

    raw_output = result.get("raw_output", "")
    # Extract JSON object from raw_output
    match = re.search(r'({[\s\S]*})', raw_output)
    if match:
        json_str = match.group(1)
        try:
            parsed = json.loads(json_str)
            print("Parsed Result:")
            print(json.dumps(parsed, indent=4))
        except Exception as e:
            print("Could not parse JSON from raw_output:", e)
            print(json_str)
    else:
        print("No JSON object found in raw_output.")

    print("Full Result Dict:")
    print(json.dumps(result, indent=2, default=str))
    break


# Strategy
# grab image files from a folder
# determine Exterior, Interior, Document, or Other using VLM
# classify images based on their content
# store results in a structured format (e.g., CSV, JSON)
# Then ext gets: Exterior, Photo Quality Assessment, Sub type shot, Description of car
# Then int gets: Interior, Photo Quality Assessment, Sub type shot
# Then file gets: Document, Sub type shot
# Then other gets: Other

# Finally compile all results into a single json for analysis
# {
#     "photos": [
#         {
#             "photo_id": "xyz123",
#             "labels": [
#                 "car exterior",
#                 "poor lighting",
#                 "driver front 3/4"
#             ]
#         },
#         {
#             "photo_id": "xyz124",
#             "labels": [
#                 "document",
#                 "title or registration"
#             ]
#         },
#         {
#             "photo_id": "xyz125",
#             "labels": [
#                 "car interior",
#                 "instrument cluster",
#                 "cluster - odometer"
#             ]
#         },
#         {
#             "photo_id": "xyz126",
#             "labels": [
#                 "other"
#             ]
#         }
#     ]
# }

