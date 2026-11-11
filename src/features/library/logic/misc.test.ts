import i18n from "@/i18n";
import { formatPlaytime, formatShortDate } from "./format";
import { ruleSummary } from "./ruleSummary";
import { filterByName } from "./search";
import { recentlyPlayed, sortGames } from "./sorting";
import { makeGame } from "./testGames";

const t = i18n.t.bind(i18n);

describe("formatPlaytime", () => {
  it("formats minutes and hours", () => {
    expect(formatPlaytime(45)).toBe("45 min");
    expect(formatPlaytime(2808)).toBe("46.8 h");
    expect(formatPlaytime(720)).toBe("12 h");
    expect(formatPlaytime(72_240)).toBe("1,204 h");
  });
});

describe("formatShortDate", () => {
  const today = new Date(2026, 10, 11);
  it("omits the year for the current year", () => {
    expect(formatShortDate("2026-01-06", today)).toBe("Jan 6");
    expect(formatShortDate("2024-03-02", today)).toBe("Mar 2, 2024");
    expect(formatShortDate(null, today)).toBeNull();
  });
});

describe("ruleSummary", () => {
  it("joins AND with + and OR with or", () => {
    expect(
      ruleSummary(
        {
          all: [
            { field: "tags", op: "includes", value: "Indie" },
            { field: "tags", op: "includes", value: "Hard" },
          ],
        },
        t,
      ),
    ).toBe("Indie + Hard");
    expect(
      ruleSummary(
        {
          any: [
            { field: "modes", op: "includes", value: "Coop" },
            { field: "modes", op: "includes", value: "PvP" },
          ],
        },
        t,
      ),
    ).toBe("Coop or PvP");
  });

  it("parenthesizes nested groups", () => {
    expect(
      ruleSummary(
        {
          all: [
            {
              any: [
                { field: "genre", op: "includes", value: "Platformer" },
                { field: "genre", op: "includes", value: "RPG" },
              ],
            },
            { field: "installed", op: "eq", value: true },
          ],
        },
        t,
      ),
    ).toBe("(Platformer or RPG) + Installed");
  });
});

describe("sorting & search", () => {
  const games = [
    makeGame({ appId: 1, name: "Hades", playtimeMinutes: 100, lastPlayed: "2025-12-29" }),
    makeGame({ appId: 2, name: "Celeste", playtimeMinutes: 2808, lastPlayed: "2026-01-06" }),
    makeGame({ appId: 3, name: "Pokémon Legends", playtimeMinutes: null }),
  ];

  it("sorts A–Z, by playtime and by last played with unknown values last", () => {
    expect(sortGames(games, "name").map((g) => g.appId)).toEqual([2, 1, 3]);
    expect(sortGames(games, "playtime").map((g) => g.appId)).toEqual([2, 1, 3]);
    expect(recentlyPlayed(games).map((g) => g.appId)).toEqual([2, 1]);
  });

  it("matches names case- and accent-insensitively", () => {
    expect(filterByName(games, "POKEMON").map((g) => g.appId)).toEqual([3]);
    expect(filterByName(games, "  ")).toHaveLength(3);
  });
});
