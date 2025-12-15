import utils

result = utils.infer_image_description_with_file(
                "./images/Screenshot 2025-12-12 at 2.30.02 PM.png", 
                "Describe the image in detail.", 
                token, 
                worker_release="qwen3-instruct", 
                max_new_tokens=5000
            )