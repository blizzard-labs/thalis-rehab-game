// Official game pages, not copied games or unlicensed embedded builds.
export const services = [
  {
    name: "Poki",
    url: "https://poki.com/",
    detail: "Familiar favorites, skill games and quick arcade rounds.",
    logo: "/library-logos/poki.webp",
  },
  {
    name: "Coolmath Games",
    url: "https://www.coolmathgames.com/",
    detail: "Puzzles, strategy, number games and patient-paced challenges.",
    logo: "/library-logos/coolmath-games.webp",
  },
  {
    name: "Playgama",
    url: "https://playgama.com/",
    detail: "A broad library of arcade, puzzle, racing and casual games.",
    logo: "/library-logos/playgama.webp",
  },
  {
    name: "CrazyGames",
    url: "https://www.crazygames.com/",
    detail: "Explore action, sports, driving and browser classics.",
    logo: "/library-logos/crazygames.webp",
  },
] as const;
export const familiarGames = [
  {
    name: "Fruit Ninja",
    preset: "slice",
    url: "https://poki.com/en/g/fruit-ninja",
    provider: "Poki",
    controls: "Pointer · slice",
    logo: "/library-logos/fruit-ninja.webp",
    description: "Slice flying fruit and avoid the bombs.",
  },
  {
    name: "Angry Birds Friends",
    preset: "drag",
    url: "https://redsclub.com/ab-friends/play/",
    provider: "Rovio · desktop web",
    controls: "Pointer · drag",
    logo: "/library-logos/angry-birds-friends.webp",
    description: "Aim the slingshot, pull back and release.",
  },
  {
    name: "2048",
    preset: "arrows",
    url: "https://play2048.co/",
    provider: "Original game",
    controls: "Arrow keys",
    logo: "/library-logos/2048.webp",
    description: "Merge matching tiles into bigger numbers.",
  },
  {
    name: "Subway Surfers",
    preset: "arrows",
    url: "https://poki.com/en/g/subway-surfers",
    provider: "Poki",
    controls: "Arrow keys",
    logo: "/library-logos/subway-surfers.webp",
    description: "Dodge obstacles, change lanes and collect coins.",
  },
  {
    name: "Crossy Road",
    preset: "arrows",
    url: "https://poki.com/en/g/crossy-road",
    provider: "Poki",
    controls: "Arrow keys",
    logo: "/library-logos/crossy-road.webp",
    description: "Time each step through traffic and across rivers.",
  },
  {
    name: "Jetpack Joyride",
    preset: "hold",
    url: "https://poki.com/en/g/jetpack-joyride",
    provider: "Poki",
    controls: "Pointer · hold",
    logo: "/library-logos/jetpack-joyride.webp",
    description: "Lift off and weave through a side-scrolling adventure.",
  },
  {
    name: "Temple Run 2",
    preset: "arrows",
    url: "https://poki.com/en/g/temple-run-2",
    provider: "Poki",
    controls: "Arrow keys",
    logo: "/library-logos/temple-run-2.webp",
    description: "Jump gaps, slide under traps and turn through the temple ruins.",
  },
  {
    name: "Cut the Rope",
    preset: "slice",
    url: "https://www.crazygames.com/game/cut-the-rope-ebx",
    provider: "CrazyGames",
    controls: "Pointer · slice",
    logo: "/library-logos/cut-the-rope.webp",
    description: "Time each rope cut to drop the candy into Om Nom’s mouth.",
  },
  {
    name: "Doodle Jump",
    preset: "steer",
    url: "https://service.play.works/service/apps/doodle_jump_old/index.html",
    provider: "Play.Works",
    controls: "Hold arrow keys · steer",
    logo: "/library-logos/doodle-jump.webp",
    description: "Steer each bounce onto the next platform and climb past the monsters.",
  },
  {
    name: "Master Chess",
    preset: "pointer",
    url: "https://poki.com/en/g/master-chess",
    provider: "Poki",
    controls: "Pointer · click",
    logo: "/library-logos/master-chess.webp",
    description: "Pick a piece and its destination to play a match against the computer or a friend.",
  },
  {
    name: "Stickman Hook",
    preset: "hold",
    url: "https://poki.com/en/g/stickman-hook",
    provider: "Poki",
    controls: "Pointer · hold",
    logo: "/library-logos/stickman-hook.webp",
    description: "Hold on to a hook, build momentum and release to swing across the finish line.",
  },
  {
    name: "Bubbleshooter",
    preset: "pointer",
    url: "https://poki.com/en/g/bubbleshooter",
    provider: "Poki",
    controls: "Pointer · click",
    logo: "/library-logos/bubbleshooter.webp",
    description: "Aim a bubble into a cluster of its color to pop three or more at once.",
  },
  {
    name: "Moto X3M",
    preset: "steer",
    url: "https://poki.com/en/g/moto-x3m",
    provider: "Poki",
    controls: "Hold arrow keys · drive",
    logo: "/library-logos/moto-x3m.webp",
    description: "Race a motorbike over ramps and lean into the landing to stay upright.",
  },
  {
    name: "Blocky Blast Puzzle",
    preset: "drag",
    url: "https://poki.com/en/g/blocky-blast-puzzle",
    provider: "Poki",
    controls: "Pointer · drag",
    logo: "/library-logos/blocky-blast-puzzle.webp",
    description: "Fit shapes onto the board to clear complete rows and columns.",
  },
  {
    name: "Drive Mad",
    preset: "steer",
    url: "https://poki.com/en/g/drive-mad",
    provider: "Poki",
    controls: "Hold arrow keys · drive",
    logo: "/library-logos/drive-mad.webp",
    description: "Ease a truck over uneven bridges and steep ramps without tipping it over.",
  },
  {
    name: "Tiny Fishing",
    preset: "drag",
    url: "https://poki.com/en/g/tiny-fishing",
    provider: "Poki",
    controls: "Pointer · drag",
    logo: "/library-logos/tiny-fishing.webp",
    description: "Cast your line, steer your hook toward fish and upgrade your rod between catches.",
  },
] as const;

export type ControlPreset = (typeof familiarGames)[number]["preset"];

export function suggestedPreset(gameUrl?: string): ControlPreset {
  if (!gameUrl) return "arrows";
  try {
    const page = new URL(gameUrl);
    const address = page.origin + page.pathname.replace(/\/$/, "");
    return familiarGames.find((game) => game.url.replace(/\/$/, "") === address)?.preset ?? "arrows";
  } catch {
    return "arrows";
  }
}
