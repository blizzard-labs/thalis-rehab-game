import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import selfsigned from "selfsigned";

export type Cert = { key: string; cert: string; expiresAt: number };

const FILE = "lan-cert.json";

function generate(days: number, now: number): Cert {
  const pems = selfsigned.generate([{ name: "commonName", value: "neuroreach.local" }], {
    days,
    keySize: 2048,
    algorithm: "sha256",
  });
  return { key: pems.private, cert: pems.cert, expiresAt: now + days * 86_400_000 };
}

export function loadOrCreateCert(
  dir: string,
  opts: { now?: () => number; days?: number } = {},
): Cert {
  const now = (opts.now ?? Date.now)();
  const days = opts.days ?? 365;
  const path = join(dir, FILE);
  if (existsSync(path)) {
    try {
      const cached = JSON.parse(readFileSync(path, "utf8")) as Cert;
      if (cached.key && cached.cert && cached.expiresAt > now) return cached;
    } catch {
      /* fall through to regenerate */
    }
  }
  const fresh = generate(days, now);
  writeFileSync(path, JSON.stringify(fresh), { encoding:"utf8", mode:0o600 });
  return fresh;
}
