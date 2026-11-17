import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/app/App";
import { useToastStore } from "@/components/Toast/toastStore";
import { commands, type Shelf } from "@/lib/bindings";
import { EMPTY_SELECTION } from "@/features/library/logic/facets";
import { makeGame, makeShelf } from "@/features/library/logic/testGames";
import { useFiltersStore } from "@/features/library/store/filtersStore";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { useSessionStore } from "@/features/library/store/sessionStore";

vi.mock("@/lib/bindings", () => ({
  commands: {
    saveShelf: vi.fn(),
    deleteShelf: vi.fn(),
    reorderShelves: vi.fn(),
    importSteamCollections: vi.fn(),
    launchGame: vi.fn().mockResolvedValue(null),
  },
  events: {},
}));

const games = [
  makeGame({
    appId: 504230,
    name: "Celeste",
    genre: "Platformer",
    modes: ["Solo"],
    tags: ["Indie", "Hard"],
    installed: true,
  }),
  makeGame({
    appId: 367520,
    name: "Hollow Knight",
    genre: "Metroidvania",
    modes: ["Solo"],
    tags: ["Indie", "Hard"],
    installed: false,
  }),
  makeGame({
    appId: 413150,
    name: "Stardew Valley",
    genre: "Simulation",
    modes: ["Solo", "Coop"],
    tags: ["Indie", "Chill"],
    installed: true,
  }),
  makeGame({ appId: 730, name: "Counter-Strike 2", genre: "FPS", modes: ["PvP"] }),
];

const demanding = makeShelf({ id: "demanding-indies", name: "Demanding indies", pinned: true }, [
  { field: "tags", values: ["Indie"] },
  { field: "tags", values: ["Hard"] },
]);
const online = makeShelf({ id: "online", name: "Online", order: 1 }, [
  { field: "modes", values: ["PvP"] },
]);
const favorites = makeShelf({
  id: "favorites",
  name: "Favorites",
  kind: "manual",
  order: 2,
  appIds: [413150],
});
const steam = makeShelf({
  id: "steam-uc-1",
  name: "Valve",
  kind: "steam",
  order: 3,
  visible: false,
  steamCollectionId: "uc-1",
  appIds: null,
});
const shelves: Shelf[] = [demanding, online, favorites, steam];

/** The backend echoes the saved shelf back (with an id for new ones). */
function echoSaves() {
  vi.mocked(commands.saveShelf).mockImplementation((shelf) => {
    const current = useLibraryStore.getState().shelves;
    return Promise.resolve(
      shelf.id
        ? current.map((item) => (item.id === shelf.id ? shelf : item))
        : [...current, { ...shelf, id: "shelf-new", order: current.length }],
    );
  });
}

function renderAt(hash: string) {
  useLibraryStore.setState({ status: "ready", games, shelves, error: null });
  useFiltersStore.setState({ selection: EMPTY_SELECTION, sort: "name", moodId: "friends" });
  useSessionStore.setState({ runningAppId: null, launchingAppId: null, error: null });
  useToastStore.setState({ toast: null });
  window.location.hash = hash;
  render(<App />);
}

describe("smart shelves screens", () => {
  // The pages are lazy-loaded: load them once up front.
  beforeAll(async () => {
    await Promise.all([
      import("./ShelfPage"),
      import("./ShelfBuilderPage"),
      import("./ManageShelvesPage"),
    ]);
  });
  beforeEach(() => {
    vi.mocked(commands.saveShelf).mockReset();
    vi.mocked(commands.deleteShelf).mockReset();
    vi.mocked(commands.reorderShelves).mockReset();
    vi.mocked(commands.launchGame).mockClear();
    echoSaves();
  });

  describe("shelf page", () => {
    it("shows the shelf, its rule, its games and the games almost in", async () => {
      renderAt("#/shelf/demanding-indies");
      expect(
        await screen.findByRole("heading", { level: 1, name: "Demanding indies" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Smart shelf")).toBeInTheDocument();
      expect(screen.getByText("2 games · updates itself")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pinned" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      const grid = screen.getByRole("region", { name: "Games in this shelf" });
      expect(within(grid).getByRole("link", { name: /^Celeste/ })).toBeInTheDocument();
      expect(within(grid).getByRole("link", { name: /^Hollow Knight/ })).toBeInTheDocument();

      const almost = screen.getByRole("region", { name: "Almost in" });
      expect(within(almost).getByText("Stardew Valley")).toBeInTheDocument();
      expect(within(almost).getByText("missing: Hard")).toBeInTheDocument();
    });

    it("edits the rule live, saves it and offers Undo", async () => {
      const user = userEvent.setup();
      renderAt("#/shelf/demanding-indies");
      await user.click(await screen.findByRole("button", { name: "Remove Vibe Hard" }));
      const saved = vi.mocked(commands.saveShelf).mock.calls[0]?.[0];
      expect(saved?.rule?.conditions).toEqual([{ field: "tags", values: ["Indie"] }]);
      expect(await screen.findByText("3 games · updates itself")).toBeInTheDocument();
      expect(screen.getByText("Saved")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Undo" }));
      expect(vi.mocked(commands.saveShelf).mock.calls[1]?.[0]).toEqual(demanding);

      await user.click(screen.getByRole("button", { name: "Chill" }));
      expect(vi.mocked(commands.saveShelf).mock.calls[2]?.[0].rule?.conditions).toContainEqual({
        field: "tags",
        values: ["Chill"],
      });
    });

    it("plays a random installed game of the shelf", async () => {
      const user = userEvent.setup();
      renderAt("#/shelf/demanding-indies");
      await user.click(await screen.findByRole("button", { name: "Play a random one" }));
      // Hollow Knight isn't installed: Celeste is the only pick.
      expect(commands.launchGame).toHaveBeenCalledWith(504230);
    });

    it("shows a hand-picked shelf without a rule bar, and says when it is gone", async () => {
      renderAt("#/shelf/favorites");
      expect(await screen.findByText("Shelf")).toBeInTheDocument();
      expect(screen.getByText("1 game")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Rule" })).not.toBeInTheDocument();
    });

    it("explains when the shelf doesn't exist", async () => {
      renderAt("#/shelf/nope");
      expect(
        await screen.findByRole("heading", { name: "This shelf doesn’t exist anymore." }),
      ).toBeInTheDocument();
    });
  });

  describe("builder", () => {
    it("builds a shelf with a live preview and creates it", async () => {
      const user = userEvent.setup();
      renderAt("#/shelves/new");
      const name = await screen.findByRole("textbox", { name: "Name" });
      expect(screen.getByRole("button", { name: "Create shelf" })).toBeDisabled();
      expect(screen.getByText("No condition: your whole library.")).toBeInTheDocument();

      await user.type(name, "Friends night");
      await user.click(screen.getByRole("button", { name: "+ Mode" }));
      const modes = screen.getByRole("group", { name: "Mode" });
      await user.click(within(modes).getByRole("button", { name: "Coop" }));
      await user.click(within(modes).getByRole("button", { name: "PvP" }));
      expect(screen.getByText("Games whose mode is Coop or PvP.")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Any condition (OR)" }));
      await user.click(screen.getByRole("checkbox", { name: "Pin at the top of the shelves" }));
      await user.click(screen.getByRole("button", { name: "Create shelf" }));
      const created = vi.mocked(commands.saveShelf).mock.calls[0]?.[0];
      expect(created).toMatchObject({
        id: "",
        name: "Friends night",
        kind: "smart",
        pinned: true,
        rule: { match: "any", conditions: [{ field: "modes", values: ["Coop", "PvP"] }] },
      });
    });

    it("warns about a duplicate name and asks before discarding changes", async () => {
      const user = userEvent.setup();
      renderAt("#/shelves/new");
      await user.type(await screen.findByRole("textbox", { name: "Name" }), "online");
      expect(screen.getByText("Another shelf already has this name.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("button", { name: "Discard changes?" })).toBeInTheDocument();
    });

    it("edits an existing shelf and saves with Ctrl+Enter", async () => {
      const user = userEvent.setup();
      renderAt("#/shelves/online/edit");
      expect(await screen.findByRole("heading", { name: "Edit shelf" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Online");
      await user.click(screen.getByRole("button", { name: "+ Installed" }));
      await user.keyboard("{Control>}{Enter}{/Control}");
      const saved = vi.mocked(commands.saveShelf).mock.calls[0]?.[0];
      expect(saved?.id).toBe("online");
      expect(saved?.rule?.conditions).toContainEqual({
        field: "installed",
        op: "is",
        value: true,
      });
    });
  });

  describe("my shelves", () => {
    it("lists shelves with their kind, count and visibility, and filters by kind", async () => {
      const user = userEvent.setup();
      renderAt("#/shelves");
      expect(await screen.findByRole("heading", { name: "My shelves" })).toBeInTheDocument();
      expect(screen.getByText("Indie + Hard · 2 games")).toBeInTheDocument();
      expect(screen.getByText("Added by hand · 1 games")).toBeInTheDocument();
      expect(screen.getByText("Steam collection (read-only) · — games")).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Show Valve in the library" })).toHaveAttribute(
        "aria-checked",
        "false",
      );

      await user.click(screen.getByRole("tab", { name: "From Steam" }));
      expect(screen.queryByText("Indie + Hard · 2 games")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Valve" })).toBeInTheDocument();
    });

    it("toggles visibility and reorders inside the pinned group", async () => {
      const user = userEvent.setup();
      vi.mocked(commands.reorderShelves).mockImplementation((ids) =>
        Promise.resolve(
          shelves
            .map((shelf) => ({ ...shelf, order: ids.indexOf(shelf.id) }))
            .sort((a, b) => a.order - b.order),
        ),
      );
      renderAt("#/shelves");
      await user.click(await screen.findByRole("switch", { name: "Show Online in the library" }));
      expect(vi.mocked(commands.saveShelf).mock.calls[0]?.[0]).toMatchObject({
        id: "online",
        visible: false,
      });

      // Demanding indies is pinned: Online can't move above it.
      expect(screen.getByRole("button", { name: "Move Online up" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Move Online down" }));
      expect(commands.reorderShelves).toHaveBeenCalledWith([
        "demanding-indies",
        "favorites",
        "online",
        "steam-uc-1",
      ]);
    });

    it("duplicates and deletes from the row menu", async () => {
      const user = userEvent.setup();
      vi.mocked(commands.deleteShelf).mockResolvedValue([demanding, favorites, steam]);
      renderAt("#/shelves");
      await user.click(await screen.findByRole("button", { name: "More options for Online" }));
      await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
      expect(vi.mocked(commands.saveShelf).mock.calls[0]?.[0]).toMatchObject({
        id: "",
        name: "Online copy",
      });

      await user.click(screen.getByRole("button", { name: "More options for Online" }));
      await user.click(screen.getByRole("menuitem", { name: "Delete…" }));
      const dialog = screen.getByRole("dialog", { name: "Delete “Online”?" });
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      expect(commands.deleteShelf).toHaveBeenCalledWith("online");
    });

    it("never offers to delete Favorites", async () => {
      const user = userEvent.setup();
      renderAt("#/shelves");
      await user.click(await screen.findByRole("button", { name: "More options for Favorites" }));
      expect(screen.queryByRole("menuitem", { name: "Delete…" })).not.toBeInTheDocument();
    });
  });

  describe("save as shelf", () => {
    it("saves the library filters as a shelf where the user chose", async () => {
      const user = userEvent.setup();
      renderAt("#/");
      await user.click(await screen.findByRole("button", { name: /^Coop, / }));
      await user.click(screen.getByRole("button", { name: /^Indie, / }));
      await user.click(screen.getByRole("button", { name: "Save as shelf" }));

      const dialog = screen.getByRole("dialog", { name: "Save as shelf" });
      expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Coop · Indie");
      expect(within(dialog).getByText("Preview · 1 game")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^Library/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await user.click(within(dialog).getByRole("button", { name: /^In the mood for/ }));
      await user.click(within(dialog).getByRole("button", { name: "Create shelf" }));

      expect(vi.mocked(commands.saveShelf).mock.calls[0]?.[0]).toMatchObject({
        name: "Coop · Indie",
        visible: true,
        showAsMood: true,
        pinned: false,
        rule: {
          match: "all",
          conditions: [
            { field: "modes", values: ["Coop"] },
            { field: "tags", values: ["Indie"] },
          ],
        },
      });
      expect(await screen.findByText("Shelf created")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "View" }));
      expect(window.location.hash).toBe("#/shelf/shelf-new");
    });
  });
});
