import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const repository = fileURLToPath(new URL("../../", import.meta.url));
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// A deterministic stored ZIP, readable by the store and standard OS tools.
function zip(files, prefix = "") {
  const parts = [], central = [];
  let offset = 0;
  for (const [filename, data] of files) {
    const name = Buffer.from(prefix + filename);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(33, 12);
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
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

export async function packageController({
  outputDirectory = join(repository, "dist/extension"),
  publicDirectory = join(repository, "patient-web/public"),
} = {}) {
  const source = join(repository, "game-controller-extension");
  const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
  const names = ["manifest.json", "background.js", "bridge.js", "protocol.js", "sites.js",
    "popup.html", "popup.js", "sidebar.html", "sidebar.js", "camera.html", "camera.js", "privacy.html",
    ...Object.values(manifest.icons)].sort();
  const files = await Promise.all(names.map(async name => [name, await readFile(join(source, name))]));
  files.push(["LICENSE", await readFile(join(repository, "LICENSE"))]);
  const store = zip(files);
  const manual = zip([...files, ["README.md", await readFile(join(source, "README.md"))]], "neuroreach-game-controller/");
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(publicDirectory, { recursive: true });
  const filename = `NeuroReach-Game-Controller-${manifest.version}.zip`;
  await writeFile(join(outputDirectory, filename), store);
  await writeFile(join(outputDirectory, "SHA256SUMS.txt"), `${createHash("sha256").update(store).digest("hex")}  ${filename}\n`);
  await writeFile(join(publicDirectory, "game-controller-extension.zip"), manual);
  await writeFile(join(publicDirectory, "neuroreach-game-controller-store.zip"), store);
  await writeFile(join(publicDirectory, "extension-privacy.html"), await readFile(join(source, "privacy.html")));
  return { filename, outputDirectory, version: manifest.version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await packageController();
  console.log(`Packaged Game Controller ${result.version}: manual installation and Chrome Web Store ZIPs.`);
}
