import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAppRouter } from "@/app/router";
import type { Game, SmartShelf } from "@/lib/bindings";
import { makeGame } from "./logic/testGames";
import { EMPTY_SELECTION } from "./logic/facets";
import { useFiltersStore } from "./store/filtersStore";
import { useLibraryStore } from "./store/libraryStore";

const games: Game[] = [
  makeGame({
    appId: 504230,
    name: "Celeste",
    genre: "Platformer",
    modes: ["Solo"],
    tags: ["Indie", "Hard"],
    playtimeMinutes: 2808,
    lastPlayed: "2026-01-06",
    achievements: { unlocked: 18, total: 32 },
    cloud: "synced",
  }),
  makeGame({
    appId: 268910,
    name: "Cuphead",
    genre: "Platformer",
    modes: ["Solo", "Coop"],
    tags: ["Indie", "Hard"],
  }),
  makeGame({
    appId: 413150,
    name: "Stardew Valley",
    genre: "Simulation",
    modes: ["Solo", "Coop"],
    tags: ["Indie", "Chill"],
    lastPlayed: "2025-11-08",
  }),
  makeGame({ appId: 730, name: "Counter-Strike 2", genre: "FPS", modes: ["PvP"], tags: [] }),
];

const shelves: SmartShelf[] = [
  {
    id: "demanding-indies",
    title: "Demanding indies",
    order: 0,
    pinned: false,
    rule: {
      all: [
        { field: "tags", op: "includes", value: "Indie" },
        { field: "tags", op: "includes", value: "Hard" },
      ],
    },
  },
  {
    id: "story",
    title: "Big stories",
    order: 1,
    pinned: false,
    rule: { all: [{ field: "tags", op: "includes", value: "Story" }] },
  },
];

function renderLibrary() {
  useLibraryStore.setState({ status: "ready", games, shelves, error: null });
  useFiltersStore.setState({
    query: "",
    selection: EMPTY_SELECTION,
    sort: "name",
    moodId: "friends",
  });
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/"] }));
  render(<RouterProvider router={router} />);
}

const libraryCount = () =>
  within(screen.getByRole("region", { name: /^Library/ })).getByText(/games?$/);

describe("LibraryPage", () => {
  it("shows the most recently played game in the hero, with known stats only", async () => {
    renderLibrary();
    expect(await screen.findByText("Continue · Last played Jan 6")).toBeInTheDocument();
    expect(screen.getByText("46.8 h · 18/32 achievements · Cloud synced")).toBeInTheDocument();
  });

  it("hides smart shelves without matches and summarizes rules", async () => {
    renderLibrary();
    expect(await screen.findByRole("heading", { name: "Demanding indies" })).toBeInTheDocument();
    expect(screen.getByText("Indie + Hard")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all (2) →" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Big stories" })).not.toBeInTheDocument();
  });

  it("filters with facets: OR within a facet, AND across, live counts", async () => {
    const user = userEvent.setup();
    renderLibrary();
    expect(await screen.findByText("4 games")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Platformer, 2 games" }));
    expect(libraryCount()).toHaveTextContent("2 games");
    expect(screen.getByRole("button", { name: "Platformer, 2 games" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Simulation, 1 game" }));
    expect(libraryCount()).toHaveTextContent("3 games");

    // Across facets: Mode = Coop keeps Cuphead and Stardew. PvP has no match left: disabled.
    await user.click(screen.getByRole("button", { name: "Coop, 2 games" }));
    expect(libraryCount()).toHaveTextContent("2 games");
    expect(screen.getByRole("button", { name: "PvP, 0 games" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(libraryCount()).toHaveTextContent("4 games");
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });

  it("applies the top bar search on top of the facets", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.type(await screen.findByRole("searchbox"), "cup");
    expect(libraryCount()).toHaveTextContent("1 game");
    expect(screen.getByRole("button", { name: "Simulation, 0 games" })).toBeDisabled();
  });

  it("switches moods with aria-pressed pills", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const friends = await screen.findByRole("button", { name: "Play with friends" });
    const challenge = screen.getByRole("button", { name: "A challenge" });
    expect(friends).toHaveAttribute("aria-pressed", "true");
    await user.click(challenge);
    expect(challenge).toHaveAttribute("aria-pressed", "true");
    expect(friends).toHaveAttribute("aria-pressed", "false");
  });
});
