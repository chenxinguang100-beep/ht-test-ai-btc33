import os
import subprocess
import time

# Configuration
STYLES = ['Style1', 'Style2', 'Style3', 'Style4']
WORDS = ['Word1', 'Word2', 'Word3', 'Word4', 'Word5', 'Word6']
VARIANTS = [1, 2, 3]
BASE_URL = "https://experience-class.oss-accelerate.aliyuncs.com/btc_py_2_3_3/sequences"
OUTPUT_DIR = "temp_analysis"

def download_file(url, filepath):
    try:
        # Use curl to avoid dependency issues with requests
        result = subprocess.run(['curl', '-s', '-o', filepath, url], capture_output=True)
        if result.returncode == 0:
            # Check if file size is > 0 (curl might create empty file on 404)
            if os.path.getsize(filepath) > 0:
                print(f"Downloaded: {filepath}")
                return True
            else:
                os.remove(filepath)
                print(f"Failed (Empty): {url}")
                return False
        else:
            print(f"Failed to download {url}: {result.stderr.decode('utf-8')}")
            return False
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return False

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    count = 0
    total = len(STYLES) * len(WORDS) * len(VARIANTS)

    for style in STYLES:
        for word in WORDS:
            for variant in VARIANTS:
                # Construct URL for the first frame (01.jpg)
                # URL structure matches script.js: /sequences/${styleId}/${wordId}/v${variant}/01.jpg
                url = f"{BASE_URL}/{style}/{word}/v{variant}/01.jpg"
                
                # Local filename: Style1_Word1_v1.jpg
                filename = f"{style}_{word}_v{variant}.jpg"
                filepath = os.path.join(OUTPUT_DIR, filename)

                # Skip if already exists (for retries)
                if os.path.exists(filepath):
                    print(f"Skipping existing: {filepath}")
                    count += 1
                    continue

                success = download_file(url, filepath)
                if success:
                    count += 1
                
                # Be nice to the server
                time.sleep(0.1)

    print(f"Finished. Downloaded {count}/{total} images.")

if __name__ == "__main__":
    main()
