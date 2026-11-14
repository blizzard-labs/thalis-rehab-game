import { describe, expect, it } from "vitest";
import { familiarGames, findFavorite } from "./catalog";

describe("game controller presets", () => {
  it("recognizes every favorite when its publisher adds tracking or a fragment", () => {
    for (const game of familiarGames) {
      const url = new URL(game.url);
      url.search = "?source=library";
      url.hash = "#play";
      expect(findFavorite(url.href)).toBe(game);
    }
    expect(findFavorite("https://poki.com/en/g/drive-mad/")?.preset).toBe(
      "steer",
    );
  });

  it("leaves unrecognized pages available for manual setup", () => {
    expect(findFavorite("https://poki.com/en/g/drive-mad-2")).toBeUndefined();
    expect(findFavorite("https://example.com/en/g/drive-mad")).toBeUndefined();
    expect(findFavorite("")).toBeUndefined();
  });
});
