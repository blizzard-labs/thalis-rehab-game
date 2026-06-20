import os
import csv
import sys

# Mapping of old headers to new headers
HEADER_MAP = {
    'FZ': 'FC1',
    'C4': 'FC3',
    'PZ': 'C1',
    'PO7': 'CP1',
    'OZ': 'CP3',
    'PO8': 'C2',
}

def remap_headers_in_csv(file_path):
    with open(file_path, 'r', newline='') as infile:
        reader = csv.reader(infile)
        rows = list(reader)
    if not rows:
        return
    headers = rows[0]
    new_headers = [HEADER_MAP.get(h, h) for h in headers]
    if new_headers == headers:
        return  # No changes needed
    rows[0] = new_headers
    with open(file_path, 'w', newline='') as outfile:
        writer = csv.writer(outfile)
        writer.writerows(rows)

def process_folder(folder):
    for root, _, files in os.walk(folder):
        for fname in files:
            if ('eeg_data' in fname) and fname.endswith('.csv'):
                fpath = os.path.join(root, fname)
                remap_headers_in_csv(fpath)

def main():
    if len(sys.argv) != 2:
        print(f"Usage: python {sys.argv[0]} <folder>")
        sys.exit(1)
    folder = sys.argv[1]
    process_folder(folder)
    print("Header remapping complete.")

if __name__ == "__main__":
    main()
