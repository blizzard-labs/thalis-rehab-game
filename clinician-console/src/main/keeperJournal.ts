import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** Only the cumulative story counter is sent to the patient display. The
 * workstation's roster ID and simulation/live distinction stay here. */
export function keeperJournal(
  directory: string,
  profile: string,
  source: "live" | "sim",
) {
  const key = createHash("sha256")
    .update(JSON.stringify([profile, source]))
    .digest("hex");
  const folder = join(directory, "keeper-progress");
  const file = join(folder, key);
  function read() {
    if (!existsSync(file)) return 0;
    const total = JSON.parse(readFileSync(file, "utf8"));
    if (!Number.isSafeInteger(total) || total < 0)
      throw new Error("Keeper journal could not be read");
    return total as number;
  }
  return {
    read,
    save(total: number) {
      if (!Number.isSafeInteger(total) || total < 0)
        throw new Error("Invalid keeper progress");
      if (total <= read()) return;
      mkdirSync(folder, { recursive: true });
      writeFileSync(file + ".tmp", JSON.stringify(total), { mode: 0o600 });
      renameSync(file + ".tmp", file);
    },
  };
}
