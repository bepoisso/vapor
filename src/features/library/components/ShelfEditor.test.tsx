import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { commands, type SmartShelf } from "@/lib/bindings";
import { EMPTY_SELECTION, selectionToRule } from "../logic/facets";
import { makeGame } from "../logic/testGames";
import { useLibraryStore } from "../store/libraryStore";
import { useShelfEditorStore } from "../store/shelfEditorStore";
import { ShelfEditor } from "./ShelfEditor";

vi.mock("@/lib/bindings", () => ({
  commands: {
    saveShelf: vi.fn(),
    deleteShelf: vi.fn(),
  },
  events: {},
}));

const games = [
  makeGame({
    appId: 1,
    name: "Celeste",
    genre: "Platformer",
    modes: ["Solo"],
    tags: ["Indie", "Hard"],
  }),
  makeGame({
    appId: 2,
    name: "Cuphead",
    genre: "Platformer",
    modes: ["Solo", "Coop"],
    tags: ["Indie", "Hard"],
  }),
  makeGame({ appId: 3, name: "Stardew", genre: "Simulation", modes: ["Coop"], tags: ["Chill"] }),
];

const existing: SmartShelf = {
  id: "shelf-1",
  title: "Cozy",
  order: 0,
  pinned: false,
  seeded: false,
  rule: { all: [{ field: "tags", op: "includes", value: "Chill" }] },
};

describe("ShelfEditor", () => {
  beforeEach(() => {
    useLibraryStore.setState({ games, shelves: [existing], collections: [] });
    useShelfEditorStore.setState({ target: null });
    vi.mocked(commands.saveShelf).mockReset().mockResolvedValue([existing]);
    vi.mocked(commands.deleteShelf).mockReset().mockResolvedValue([]);
  });

  it("creates a shelf from the library filters, named after its rule by default", async () => {
    const user = userEvent.setup();
    render(<ShelfEditor />);
    const rule = selectionToRule({ ...EMPTY_SELECTION, genre: ["Platformer"], modes: ["Coop"] });
    act(() => useShelfEditorStore.getState().openNew(rule));

    expect(await screen.findByRole("heading", { name: "New smart shelf" })).toBeInTheDocument();
    expect(screen.getByText("1 game matches.")).toBeInTheDocument();
    const genreRow = screen.getByRole("group", { name: "Genre" });
    expect(within(genreRow).getByRole("button", { name: "Platformer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Widen the genre row: Platformer or Simulation, still AND Coop.
    await user.click(within(genreRow).getByRole("button", { name: "Simulation" }));
    expect(screen.getByText("2 games match.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(commands.saveShelf).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "",
        title: "(Platformer or Simulation) + Coop",
        seeded: false,
      }),
    );
    expect(useShelfEditorStore.getState().target).toBeNull();
  });

  it("needs at least one condition", async () => {
    render(<ShelfEditor />);
    act(() => useShelfEditorStore.getState().openNew());
    expect(await screen.findByText("Add at least one condition.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("renames an existing shelf and deletes it after confirmation", async () => {
    const user = userEvent.setup();
    render(<ShelfEditor />);
    act(() => useShelfEditorStore.getState().openEdit(existing));

    const name = await screen.findByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Cozy nights");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(commands.saveShelf).toHaveBeenCalledWith(
      expect.objectContaining({ id: "shelf-1", title: "Cozy nights" }),
    );

    act(() => useShelfEditorStore.getState().openEdit(existing));
    await user.click(await screen.findByRole("button", { name: "Delete shelf" }));
    expect(commands.deleteShelf).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Click again to delete" }));
    expect(commands.deleteShelf).toHaveBeenCalledWith("shelf-1");
  });
});
