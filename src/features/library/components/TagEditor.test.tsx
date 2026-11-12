import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { commands } from "@/lib/bindings";
import { makeGame } from "../logic/testGames";
import { useTagEditorStore } from "../store/tagEditorStore";
import { TagEditor } from "./TagEditor";

vi.mock("@/lib/bindings", () => ({
  commands: { setGameTags: vi.fn().mockResolvedValue(null) },
  events: {},
}));

const celeste = makeGame({ appId: 504230, name: "Celeste", tags: ["Indie", "Story"] });

describe("TagEditor", () => {
  beforeEach(() => {
    useTagEditorStore.setState({ game: null });
  });

  it("is closed until a game is picked", () => {
    render(<TagEditor />);
    expect(screen.queryByRole("heading", { name: "Tags for Celeste" })).not.toBeInTheDocument();
  });

  it("toggles vibes, adds a custom tag and saves", async () => {
    const user = userEvent.setup();
    render(<TagEditor />);
    act(() => useTagEditorStore.getState().open(celeste));

    expect(await screen.findByRole("heading", { name: "Tags for Celeste" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Indie" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Story" })); // remove
    await user.click(screen.getByRole("button", { name: "Hard" })); // add
    await user.type(screen.getByRole("textbox", { name: "Add" }), "Speedrun{Enter}");
    expect(screen.getByRole("button", { name: "Speedrun" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(commands.setGameTags).toHaveBeenCalledWith(504230, ["Indie", "Hard", "Speedrun"]);
    expect(useTagEditorStore.getState().game).toBeNull();
  });
});
