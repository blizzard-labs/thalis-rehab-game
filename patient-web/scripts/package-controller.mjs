import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
// Small stored ZIP: no external archiver is needed on Windows or macOS.
const directory = new URL("../../game-controller-extension/", import.meta.url);
const parts = [],
  central = [];
let offset = 0;
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
for (const entry of (await readdir(directory)).sort()) {
  if (!/\.(js|json|html|md)$/.test(entry)) continue;
  const name = Buffer.from("neuroreach-game-controller/" + entry);
  const data = await readFile(new URL(entry, directory));
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(33, 12); // 1980-01-01, deterministic ZIP date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(33, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(data.length, 20);
  record.writeUInt32LE(data.length, 24);
  record.writeUInt16LE(name.length, 28);
  record.writeUInt32LE(offset, 42);
  parts.push(local, name, data);
  central.push(record, name);
  offset += local.length + name.length + data.length;
}
const directoryBytes = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(central.length / 2, 8);
end.writeUInt16LE(central.length / 2, 10);
end.writeUInt32LE(directoryBytes.length, 12);
end.writeUInt32LE(offset, 16);
await writeFile(
  fileURLToPath(
    new URL("../public/game-controller-extension.zip", import.meta.url),
  ),
  Buffer.concat([...parts, directoryBytes, end]),
);
