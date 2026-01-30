import os
from PIL import Image

def convert_to_webp(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.lower().endswith(('.png', '.jpg', '.jpeg')):
                file_path = os.path.join(root, file)
                webp_path = os.path.splitext(file_path)[0] + ".webp"
                
                print(f"Converting {file_path} to {webp_path}")
                try:
                    img = Image.open(file_path)
                    img.save(webp_path, "WEBP", quality=80)
                    # Optional: Remove original file
                    # os.remove(file_path) 
                except Exception as e:
                    print(f"Failed to convert {file_path}: {e}")

if __name__ == "__main__":
    convert_to_webp("assets")
