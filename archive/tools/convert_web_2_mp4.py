import os
import subprocess
import sys

def convert_webm_to_mp4(root_folder):
    for dirpath, _, filenames in os.walk(root_folder):
        for filename in filenames:
            if filename.lower().endswith('.webm'):
                webm_path = os.path.join(dirpath, filename)
                mp4_path = os.path.splitext(webm_path)[0] + '.mp4'
                if os.path.exists(mp4_path):
                    print(f"Skipping (already exists): {mp4_path}")
                    continue
                print(f"Converting: {webm_path} -> {mp4_path}")
                try:
                    subprocess.run([
                        'ffmpeg', '-y', '-i', webm_path, '-c:v', 'libx264', '-c:a', 'aac', mp4_path
                    ], check=True)
                except subprocess.CalledProcessError as e:
                    print(f"Error converting {webm_path}: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python convert_web_2_mp4.py <folder>")
        sys.exit(1)
    folder = sys.argv[1]
    convert_webm_to_mp4(folder)