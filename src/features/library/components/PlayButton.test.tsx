import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands } from "@/lib/bindings";
import { makeGame } from "../logic/testGames";
import { useSessionStore } from "../store/sessionStore";
import { PlayButton } from "./PlayButton";

vi.mock("@/lib/bindings", () => ({
  commands: { launchGame: vi.fn().mockResolvedValue(null) },
  events: {},
}));

const hades = makeGame({ appId: 1145360, name: "Hades" });

describe("PlayButton", () => {
  beforeEach(() => {
    useSessionStore.setState({ runningAppId: null, launchingAppId: null, error: null });
  });

  it("launches the game and shows Launching… until it runs", async () => {
    render(<PlayButton game={hades} variant="hero" />);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(commands.launchGame).toHaveBeenCalledWith(1145360);

    const launching = screen.getByRole("button", { name: "Launching…" });
    expect(launching).toBeDisabled();
    expect(launching).toHaveAttribute("aria-busy", "true");
  });

  it("shows Playing while Steam reports the game running", () => {
    useSessionStore.setState({ runningAppId: 1145360 });
    render(<PlayButton game={hades} variant="hero" />);
    expect(screen.getByRole("button", { name: "Playing" })).toBeDisabled();
  });

  it("labels the round variant for screen readers", () => {
    const { rerender } = render(<PlayButton game={hades} variant="round" />);
    expect(screen.getByRole("button", { name: "Play Hades" })).toBeEnabled();
    useSessionStore.setState({ runningAppId: 1145360 });
    rerender(<PlayButton game={hades} variant="round" />);
    expect(screen.getByRole("button", { name: "Hades is running" })).toBeDisabled();
  });
});
