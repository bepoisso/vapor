import { makeGame, makeShelf } from "@/features/library/logic/testGames";
import {
  autoName,
  displayOrder,
  libraryShelves,
  shelfGames,
} from "@/features/library/logic/shelves";
import { copyName, newShelf, sameName } from "./shelfDraft";

const games = [
  makeGame({ appId: 1, name: "Celeste", tags: ["Indie", "Hard"], installed: true }),
  makeGame({
    appId: 2,
    name: "Hollow Knight",
    tags: ["Indie", "Hard"],
    installed: false,
    lastPlayed: "2026-01-01",
  }),
  makeGame({ appId: 3, name: "Stardew Valley", tags: ["Indie"], installed: true }),
];
const hard = [{ field: "tags" as const, values: ["Hard"] }];

describe("shelf games", () => {
  it("fills smart shelves from their rule, without not-installed games when asked", () => {
    const shelf = makeShelf({ id: "s", name: "Hard" }, hard);
    expect(shelfGames(shelf, games)?.map((game) => game.appId)).toEqual([1, 2]);
    expect(
      shelfGames({ ...shelf, hideNotInstalled: true }, games)?.map((game) => game.appId),
    ).toEqual([1]);
  });

  it("lists hand-picked and Steam games most recently played first; unknown is null", () => {
    const favorites = makeShelf({ id: "f", name: "Favorites", kind: "manual", appIds: [1, 2, 99] });
    expect(shelfGames(favorites, games)?.map((game) => game.appId)).toEqual([2, 1]);
    const gone = makeShelf({ id: "g", name: "Gone", kind: "steam", appIds: null });
    expect(shelfGames(gone, games)).toBeNull();
  });
});

describe("library shelves", () => {
  it("shows visible shelves, pinned first, hiding empty defaults but not the user's", () => {
    const shelves = [
      makeShelf({ id: "a", name: "A", order: 0 }, hard),
      makeShelf({ id: "b", name: "B", order: 1, pinned: true }, hard),
      makeShelf({ id: "c", name: "Hidden", order: 2, visible: false }, hard),
      makeShelf({ id: "d", name: "Empty default", order: 3 }, [{ field: "tags", values: ["X"] }]),
      makeShelf({ id: "e", name: "Empty mine", order: 4, seeded: false }, [
        { field: "tags", values: ["X"] },
      ]),
    ];
    expect(displayOrder(shelves).map((shelf) => shelf.id)).toEqual(["b", "a", "c", "d", "e"]);
    expect(libraryShelves(shelves, games).map((row) => row.shelf.id)).toEqual(["b", "a", "e"]);
  });
});

describe("drafts", () => {
  it("names shelves from values and avoids duplicate copies", () => {
    expect(autoName(["Coop", "Indie"])).toBe("Coop · Indie");
    const shelves = [newShelf({ name: "Hard copy" }), newShelf({ name: "Hard" })];
    expect(copyName("Hard", shelves, "copy")).toBe("Hard copy 2");
    expect(sameName(" hard ", "Hard")).toBe(true);
  });
});
