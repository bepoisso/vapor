import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/app/App";
import type { Game, Shelf } from "@/lib/bindings";
import { makeGame, makeShelf } from "./logic/testGames";
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

const shelves: Shelf[] = [
  makeShelf({ id: "demanding-indies", name: "Demanding indies", order: 0 }, [
    { field: "tags", values: ["Indie"] },
    { field: "tags", values: ["Hard"] },
  ]),
  makeShelf({ id: "story", name: "Big stories", order: 1 }, [{ field: "tags", values: ["Story"] }]),
];

function renderLibrary() {
  useLibraryStore.setState({ status: "ready", games, shelves, error: null });
  useFiltersStore.setState({
    selection: EMPTY_SELECTION,
    sort: "name",
    moodId: "friends",
  });
  window.location.hash = "#/";
  render(<App />);
}

const libraryCount = () =>
  within(screen.getByRole("region", { name: /^Library/ })).getByText(/games?$/);

describe("LibraryPage", () => {
  // Dates render relative to "today" ("Jan 6" vs "Jan 6, 2026"): pin it. Only Date is faked so
  // timers used by the router and user-event keep working.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 11));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("searches in a box over the page and opens the picked game's page", async () => {
    const user = userEvent.setup();
    renderLibrary();
    const search = await screen.findByRole("combobox", { name: "Search your library" });
    await user.type(search, "st");
    const results = screen.getByRole("listbox", { name: "Games" });
    // Starts with the query, then a word starting with it, then the rest.
    expect(
      within(results)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Stardew ValleySimulation", "Counter-Strike 2FPS", "CelestePlatformer"]);
    // The grid is not filtered.
    expect(libraryCount()).toHaveTextContent("4 games");

    await user.keyboard("{ArrowDown}");
    expect(within(results).getByRole("option", { name: /Counter-Strike 2/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{Enter}");
    expect(window.location.hash).toBe("#/game/730");
    expect(search).toHaveValue("");
  });

  it("says when nothing matches the search", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.type(await screen.findByRole("combobox"), "zelda");
    expect(screen.getByText("No game matches “zelda”.")).toBeInTheDocument();
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

  it("renders real Steam data without genres, modes or tags (Phase 2)", async () => {
    const steamGames: Game[] = [
      makeGame({
        appId: 504230,
        name: "Celeste",
        installed: true,
        playtimeMinutes: 2806,
        lastPlayed: "2026-01-06T16:39:29Z",
        cloud: "synced",
        updatePending: false,
      }),
      makeGame({ appId: 620, name: "Portal 2", installed: true, updatePending: true }),
    ];
    useLibraryStore.setState({
      status: "ready",
      games: steamGames,
      shelves,
      profile: { personaName: "Flitcher", avatar: null },
      error: null,
    });
    useFiltersStore.setState({
      selection: EMPTY_SELECTION,
      sort: "name",
      moodId: "friends",
    });
    window.location.hash = "#/";
    render(<App />);

    expect(await screen.findByText("Continue · Last played Jan 6")).toBeInTheDocument();
    expect(screen.getByText("46.8 h · Cloud synced")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Flitcher/ })).toBeInTheDocument();
    expect(libraryCount()).toHaveTextContent("2 games");
    // Nothing to filter or suggest yet: facets, moods and shelves stay hidden.
    expect(screen.queryByRole("group", { name: "Filters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Moods" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Demanding indies" })).not.toBeInTheDocument();
  });

  it("shows visible shelves, pinned first: empty user shelves, Favorites, Steam collections", async () => {
    useLibraryStore.setState({
      status: "ready",
      games,
      shelves: [
        makeShelf({ id: "shelf-9", name: "My backlog", seeded: false }, [
          { field: "tags", values: ["Backlog"] },
        ]),
        makeShelf({ id: "hidden", name: "Hidden shelf", visible: false, seeded: false }),
        makeShelf({ id: "favorites", name: "Favorites", kind: "manual", appIds: [504230, 999] }),
        makeShelf({
          id: "steam-uc-1",
          name: "Couch games",
          kind: "steam",
          steamCollectionId: "uc-1",
          appIds: [268910],
          pinned: true,
        }),
      ],
      error: null,
    });
    useFiltersStore.setState({
      selection: EMPTY_SELECTION,
      sort: "name",
      moodId: "friends",
    });
    window.location.hash = "#/";
    render(<App />);

    expect(await screen.findByRole("heading", { name: "My backlog" })).toBeInTheDocument();
    expect(screen.getByText("No game matches this rule yet.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hidden shelf" })).not.toBeInTheDocument();
    const shelfTitles = within(screen.getByRole("region", { name: "Smart shelves" }))
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(shelfTitles).toEqual(["Couch games", "My backlog", "Favorites"]);
    expect(screen.getByText("Steam collection")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage shelves" })).toHaveAttribute(
      "href",
      "#/shelves",
    );
  });

  it("explains when Steam can't be found and points to Settings", async () => {
    useLibraryStore.setState({
      status: "error",
      error: "Steam installation not found",
      errorKind: "steamNotFound",
    });
    window.location.hash = "#/";
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Vapor couldn't find Steam." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute(
      "href",
      "#/settings",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows an empty state when there is no game", async () => {
    useLibraryStore.setState({
      status: "ready",
      games: [],
      shelves: [],
      error: null,
    });
    window.location.hash = "#/";
    render(<App />);
    expect(await screen.findByRole("heading", { name: "No games yet." })).toBeInTheDocument();
  });
});
