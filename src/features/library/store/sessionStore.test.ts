import { commands } from "@/lib/bindings";
import { useSessionStore } from "./sessionStore";

vi.mock("@/lib/bindings", () => ({
  commands: {
    launchGame: vi.fn(),
    installGame: vi.fn(),
    getRunningGame: vi.fn(),
  },
  events: {},
}));

const launchGame = vi.mocked(commands.launchGame);
const installGame = vi.mocked(commands.installGame);

describe("sessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({ runningAppId: null, launchingAppId: null, error: null });
    launchGame.mockReset();
    installGame.mockReset();
  });

  it("goes launching → running when Steam reports the game", async () => {
    launchGame.mockResolvedValue(null);
    await useSessionStore.getState().play(504230);
    expect(launchGame).toHaveBeenCalledWith(504230);
    expect(useSessionStore.getState().launchingAppId).toBe(504230);

    useSessionStore.getState().setRunning(504230);
    expect(useSessionStore.getState()).toMatchObject({
      runningAppId: 504230,
      launchingAppId: null,
    });

    useSessionStore.getState().setRunning(null);
    expect(useSessionStore.getState().runningAppId).toBeNull();
  });

  it("keeps another game's launch pending when a different game runs", async () => {
    launchGame.mockResolvedValue(null);
    await useSessionStore.getState().play(620);
    useSessionStore.getState().setRunning(504230);
    expect(useSessionStore.getState()).toMatchObject({ runningAppId: 504230, launchingAppId: 620 });
  });

  it("reports a failed launch and clears the launching state", async () => {
    launchGame.mockRejectedValue({ message: "Steam installation not found" });
    await useSessionStore.getState().play(504230);
    expect(useSessionStore.getState()).toMatchObject({
      launchingAppId: null,
      error: { appId: 504230, message: "Steam installation not found" },
    });
  });

  it("gives up on launching after the timeout", async () => {
    vi.useFakeTimers();
    launchGame.mockResolvedValue(null);
    await useSessionStore.getState().play(504230);
    vi.advanceTimersByTime(60_000);
    expect(useSessionStore.getState().launchingAppId).toBeNull();
    vi.useRealTimers();
  });

  it("asks Steam to install", async () => {
    installGame.mockResolvedValue(null);
    await useSessionStore.getState().install(620);
    expect(installGame).toHaveBeenCalledWith(620);
    expect(useSessionStore.getState().error).toBeNull();
  });
});
