import csv
import argparse

parser = argparse.ArgumentParser(description='Sort a CSV file based on the first column numerically.')
parser.add_argument('--input', type=str, help='Path to the input CSV file.')
parser.add_argument('--output', type=str, help='Path to the output sorted CSV file.')
args = parser.parse_args()

with open(args.input, mode='r', newline='') as f:
    reader = csv.reader(f)
    header = next(reader) 
    sorted_data = sorted(reader, key=lambda row: float(row[0]))

with open(args.output, mode='w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(header)
    writer.writerows(sorted_data)

print(f"Sorted data written to {args.output}")