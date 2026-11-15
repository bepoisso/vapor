import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/app/App";
import { commands, type Game, type GameDetail, type Shelf } from "@/lib/bindings";
import { makeGame, makeShelf } from "@/features/library/logic/testGames";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { useSessionStore } from "@/features/library/store/sessionStore";
import { useGameStore } from "./store/gameStore";

vi.mock("@/lib/bindings", () => ({
  commands: {
    getGame: vi.fn(),
    getGameAchievements: vi.fn(),
    getGameNews: vi.fn(),
    getGameSocial: vi.fn(),
    setFavorite: vi.fn().mockResolvedValue(null),
    setHidden: vi.fn().mockResolvedValue(null),
    setNotes: vi.fn().mockResolvedValue(null),
    setGameClassification: vi.fn().mockResolvedValue(null),
    openSteamPage: vi.fn().mockResolvedValue(null),
    stopGame: vi.fn().mockResolvedValue(null),
    launchGame: vi.fn().mockResolvedValue(null),
  },
  events: {},
}));

const celeste = makeGame({
  appId: 504230,
  name: "Celeste",
  genre: "Platformer",
  modes: ["Solo"],
  tags: ["Indie", "Hard"],
  installed: true,
  playtimeMinutes: 2808,
  lastPlayed: "2026-01-06",
  achievements: { unlocked: 18, total: 32 },
  cloud: "synced",
});

const games: Game[] = [
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
  }),
  makeGame({ appId: 730, name: "Counter-Strike 2", genre: "FPS", modes: ["PvP"], tags: [] }),
];

const shelves: Shelf[] = [
  makeShelf({ id: "demanding-indies", name: "Demanding indies" }, [
    { field: "tags", values: ["Indie"] },
    { field: "tags", values: ["Hard"] },
  ]),
];

const detail: GameDetail = {
  ...celeste,
  developer: "Maddy Makes Games",
  sizeOnDiskBytes: 1.25 * 1024 ** 3,
  favorite: true,
  hidden: false,
  notes: "",
  hasInstallDir: true,
};

function renderGame() {
  useLibraryStore.setState({ status: "ready", games, shelves, error: null });
  useSessionStore.setState({ runningAppId: null, launchingAppId: null, error: null });
  useGameStore.setState({ entries: {}, openAppId: null });
  window.location.hash = "#/game/504230";
  render(<App />);
}

describe("GamePage", () => {
  // The page is lazy-loaded: load it once up front so every test renders it without delay.
  beforeAll(async () => {
    await import("./GamePage");
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 11));
    localStorage.clear();
    vi.mocked(commands.getGame).mockResolvedValue(detail);
    vi.mocked(commands.getGameAchievements).mockResolvedValue({
      unlocked: 18,
      total: 32,
      next: {
        apiName: "",
        name: "Heart of the Mountain",
        description: "Collect the Crystal Heart in Chapter 8",
        icon: null,
        iconGray: null,
        hidden: false,
        unlocked: false,
        unlockedAt: null,
        globalPercent: null,
      },
      items: [],
    });
    vi.mocked(commands.getGameNews).mockResolvedValue([
      {
        gid: "1",
        date: "2024-11-27",
        title: "New Merch!",
        excerpt: "Hey there climbers!",
        image: null,
        body: [
          {
            type: "paragraph",
            spans: [{ text: "Hey there climbers!", href: null, bold: false, italic: false }],
          },
        ],
        hasUrl: false,
      },
    ]);
    vi.mocked(commands.getGameSocial).mockResolvedValue({
      friends: [
        {
          steamId: "1",
          personaName: "notoverflow",
          avatar: null,
          recentPlaytimeMinutes: 456,
          status: "played_recently",
        },
      ],
      activity: [
        {
          date: "2026-10-29",
          kind: "friend_achievements",
          friend: "notoverflow",
          friendAvatar: null,
          count: 2,
          items: [
            { name: null, icon: null, hidden: true },
            { name: null, icon: null, hidden: true },
          ],
        },
      ],
      loading: false,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the hero and stat cards from the library at once, then the details", async () => {
    renderGame();
    expect(await screen.findByRole("heading", { level: 1, name: "Celeste" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the library" })).toHaveAttribute("href", "#/");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    expect(await screen.findByText("Maddy Makes Games · Platformer · Solo")).toBeInTheDocument();
    expect(screen.getByText("Installed · 1.3 GB")).toBeInTheDocument();
    expect(screen.getByText("Cloud synced")).toBeInTheDocument();

    const stats = screen.getByRole("region", { name: "Your stats" });
    expect(within(stats).getByText("46.8 h")).toBeInTheDocument();
    expect(within(stats).getByText("Jan 6")).toBeInTheDocument();
    expect(within(stats).getByText("18 / 32")).toBeInTheDocument();
    expect(within(stats).getByText("56%")).toBeInTheDocument();
    expect(await within(stats).findByText("notoverflow")).toBeInTheDocument();
    expect(within(stats).getByText("7.6 h recently")).toBeInTheDocument();
  });

  it("fills the overview: activity, news, next achievement, tags and similar games", async () => {
    renderGame();
    expect(await screen.findByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Achievements32" })).toBeInTheDocument();

    expect(await screen.findByText("earned 2 achievements · Oct 29")).toBeInTheDocument();
    expect(screen.getAllByText("Hidden achievement")).toHaveLength(2);
    expect(await screen.findByText("New Merch!")).toBeInTheDocument();
    expect(await screen.findByText("Heart of the Mountain")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "18 of 32 achievements unlocked" })).toBeInTheDocument();

    expect(
      screen.getByText("Appears in: shelf “Demanding indies” · mood “A challenge”"),
    ).toBeInTheDocument();
    expect(screen.getByText("Platformer · Solo · Indie")).toBeInTheDocument();
  });

  it("edits tags inline and updates the library and Appears in at once", async () => {
    const user = userEvent.setup();
    renderGame();
    const toggle = await screen.findByRole("button", { name: "+ Edit tags" });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-expanded", "true");

    const vibes = screen.getByRole("group", { name: "Vibe" });
    await user.click(within(vibes).getByRole("button", { name: "Hard" }));
    expect(commands.setGameClassification).toHaveBeenCalledWith(
      504230,
      "Platformer",
      ["Solo"],
      ["Indie"],
    );
    expect(screen.getByText("Not in any smart shelf or mood yet.")).toBeInTheDocument();
    expect(useLibraryStore.getState().games[0]?.tags).toEqual(["Indie"]);

    const modes = screen.getByRole("group", { name: "Mode" });
    await user.click(within(modes).getByRole("button", { name: "Coop" }));
    expect(screen.getByText("Appears in: mood “Play with friends”")).toBeInTheDocument();
  });

  it("toggles the favorite", async () => {
    const user = userEvent.setup();
    renderGame();
    const favorite = await screen.findByRole("button", { name: "Favorite", pressed: true });
    await user.click(favorite);
    expect(commands.setFavorite).toHaveBeenCalledWith(504230, false);
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("asks before stopping a running game", async () => {
    const user = userEvent.setup();
    renderGame();
    useSessionStore.setState({ runningAppId: 504230 });
    await user.click(await screen.findByRole("button", { name: "Running · Stop" }));
    const dialog = screen.getByRole("dialog", { name: "Stop Celeste?" });
    await user.click(within(dialog).getByRole("button", { name: "Stop game" }));
    expect(commands.stopGame).toHaveBeenCalledWith(504230);
  });

  it("switches tabs, remembers the last one and moves with the arrow keys", async () => {
    const user = userEvent.setup();
    renderGame();
    await user.click(await screen.findByRole("tab", { name: "News" }));
    expect(screen.getByRole("tab", { name: "News" })).toHaveAttribute("aria-selected", "true");
    await user.click(await screen.findByRole("button", { name: /New Merch!/ }));
    expect(screen.getByRole("button", { name: "← All news" })).toBeInTheDocument();
    expect(screen.getByText("Hey there climbers!")).toBeInTheDocument();

    screen.getByRole("tab", { name: "News" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Guides" })).toHaveAttribute("aria-selected", "true");
    expect(localStorage.getItem("vapor.gameTabs")).toContain("guides");
  });

  it("explains when the game is not in the library", async () => {
    vi.mocked(commands.getGame).mockResolvedValue(null);
    useLibraryStore.setState({ status: "ready", games: [], shelves, error: null });
    useGameStore.setState({ entries: {}, openAppId: null });
    window.location.hash = "#/game/42";
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "This game isn’t in your library." }),
    ).toBeInTheDocument();
  });
});
