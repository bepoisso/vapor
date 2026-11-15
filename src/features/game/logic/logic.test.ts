import type { Achievement } from "@/lib/bindings";
import { makeGame, makeShelf } from "@/features/library/logic/testGames";
import { filterAndSort } from "./achievements";
import { appearsIn } from "./appearsIn";
import { formatFullDate, formatHours, formatSize, lastSession, percent } from "./format";
import { classificationValues, moreLikeThis } from "./similar";
import { readTab, writeTab } from "./tabs";

const celeste = makeGame({
  appId: 504230,
  name: "Celeste",
  genre: "Platformer",
  modes: ["Solo"],
  tags: ["Indie", "Hard"],
});

describe("moreLikeThis", () => {
  const library = [
    celeste,
    makeGame({
      appId: 268910,
      name: "Cuphead",
      genre: "Platformer",
      modes: ["Solo", "Coop"],
      tags: ["Indie", "Hard"],
    }),
    makeGame({
      appId: 367520,
      name: "Hollow Knight",
      genre: "Metroidvania",
      modes: ["Solo"],
      tags: ["Indie", "Hard", "Exploration"],
      lastPlayed: "2025-12-14",
    }),
    makeGame({
      appId: 1145360,
      name: "Hades",
      genre: "Roguelike",
      modes: ["Solo"],
      tags: ["Indie", "Action"],
      lastPlayed: "2025-12-29",
    }),
    makeGame({ appId: 105600, name: "Terraria", modes: ["Solo"], tags: ["Indie"] }),
    makeGame({ appId: 730, name: "Counter-Strike 2", genre: "FPS", modes: ["PvP"] }),
  ];

  it("ranks by shared values, then by most recently played, and leaves out the game", () => {
    const similar = moreLikeThis(celeste, library);
    expect(similar.map((entry) => entry.game.name)).toEqual([
      "Cuphead",
      "Hollow Knight",
      "Hades",
      "Terraria",
    ]);
    expect(similar[0]?.shared).toEqual(["Platformer", "Solo", "Indie", "Hard"]);
    // Hades and Terraria share two values each; Hades was played more recently.
    expect(similar[2]?.shared).toEqual(["Solo", "Indie"]);
  });

  it("caps the list", () => {
    expect(moreLikeThis(celeste, library, 2)).toHaveLength(2);
  });

  it("lists genre, modes and tags once each", () => {
    expect(
      classificationValues(makeGame({ appId: 1, name: "X", tags: ["Solo"], modes: ["Solo"] })),
    ).toEqual(["Solo"]);
  });
});

describe("appearsIn", () => {
  const shelf = (name: string, value: string) =>
    makeShelf({ id: name, name }, [{ field: "tags", values: [value] }]);

  it("lists matching shelves, then matching moods", () => {
    const places = appearsIn(
      celeste,
      [shelf("Demanding indies", "Hard"), shelf("Big stories", "Story")],
      [
        {
          name: "A challenge",
          rule: { match: "all", conditions: [{ field: "tags", values: ["Hard"] }] },
        },
        {
          name: "Unwind",
          rule: { match: "all", conditions: [{ field: "tags", values: ["Chill"] }] },
        },
      ],
      Date.now(),
    );
    expect(places).toEqual([
      { kind: "shelf", name: "Demanding indies" },
      { kind: "mood", name: "A challenge" },
    ]);
  });
});

describe("format", () => {
  it("shows hours with one decimal", () => {
    expect(formatHours(2808)).toBe("46.8 h");
    expect(formatHours(30)).toBe("0.5 h");
    expect(formatHours(74_100)).toBe("1,235.0 h");
  });

  it("shows sizes in binary units", () => {
    expect(formatSize(850 * 1024 * 1024)).toBe("850 MB");
    expect(formatSize(1.25 * 1024 ** 3)).toBe("1.3 GB");
    expect(formatSize(512 * 1024)).toBe("512 KB");
  });

  it("names the last session relative to today", () => {
    const now = new Date(2026, 0, 7, 15);
    expect(lastSession("2026-01-07", now)).toEqual({ kind: "today" });
    expect(lastSession("2026-01-06", now)).toEqual({ kind: "yesterday" });
    expect(lastSession("2025-12-14", now)).toEqual({ kind: "date", label: "Dec 14, 2025" });
    expect(lastSession(null, now)).toEqual({ kind: "never" });
  });

  it("rounds percentages and keeps the year on full dates", () => {
    expect(percent(18, 32)).toBe(56);
    expect(percent(0, 0)).toBe(0);
    expect(formatFullDate("2024-11-27")).toBe("Nov 27, 2024");
    expect(formatFullDate(null)).toBe("");
  });
});

describe("filterAndSort", () => {
  const achievement = (
    apiName: string,
    unlockedAt: string | null,
    globalPercent: number | null,
  ): Achievement => ({
    apiName,
    name: apiName,
    description: null,
    icon: null,
    iconGray: null,
    hidden: false,
    unlocked: unlockedAt !== null,
    unlockedAt,
    globalPercent,
  });
  const items = [
    achievement("CH1", "2025-01-01T00:00:00Z", 70),
    achievement("CH2", "2025-06-01T00:00:00Z", 60),
    achievement("HEART", null, 20),
    achievement("SECRET", null, null),
  ];

  it("puts the newest unlocks first, then the locked ones in game order", () => {
    expect(filterAndSort(items, "all", "unlockDate").map((a) => a.apiName)).toEqual([
      "CH2",
      "CH1",
      "HEART",
      "SECRET",
    ]);
  });

  it("sorts by rarity, rarest first, unknown last", () => {
    expect(filterAndSort(items, "all", "rarity").map((a) => a.apiName)).toEqual([
      "HEART",
      "CH2",
      "CH1",
      "SECRET",
    ]);
  });

  it("filters unlocked and locked", () => {
    expect(filterAndSort(items, "unlocked", "unlockDate")).toHaveLength(2);
    expect(filterAndSort(items, "locked", "rarity").map((a) => a.apiName)).toEqual([
      "HEART",
      "SECRET",
    ]);
  });
});

describe("tabs", () => {
  beforeEach(() => localStorage.clear());

  it("remembers the last tab per game, overview by default", () => {
    expect(readTab(504230)).toBe("overview");
    writeTab(504230, "notes");
    writeTab(620, "news");
    expect(readTab(504230)).toBe("notes");
    expect(readTab(620)).toBe("news");
  });

  it("ignores unreadable storage", () => {
    localStorage.setItem("vapor.gameTabs", "{not json");
    expect(readTab(504230)).toBe("overview");
    localStorage.setItem("vapor.gameTabs", JSON.stringify([[504230, "bogus"]]));
    expect(readTab(504230)).toBe("overview");
  });
});
