// The saved session ID addresses the same stretch of countryside on every display.
export function trailSeed(id: string) {
  return parseInt(id.slice(0, 8), 16) >>> 0;
}

export function variation(seed: number, tile: number, detail = 0) {
  let n =
    seed ^ Math.imul(tile + 1, 0x9e3779b1) ^ Math.imul(detail + 1, 0x85ebca77);
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  return ((n ^ (n >>> 15)) >>> 0) / 0x100000000;
}

export function visibleTiles(distance: number, width: number) {
  const first = Math.floor(distance / width) - 1;
  return Array.from(
    { length: Math.ceil(960 / width) + 2 },
    (_, i) => first + i,
  );
}
