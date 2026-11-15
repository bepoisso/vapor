import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeGame } from "../logic/testGames";
import { CoverRow } from "./CoverRow";

vi.mock("@/lib/bindings", () => ({ commands: {}, events: {} }));

// jsdom has no layout: the row measures 0 px wide and fits one cover.
const games = [
  makeGame({ appId: 1, name: "Ori" }),
  makeGame({ appId: 2, name: "Turing Complete" }),
  makeGame({ appId: 3, name: "Moon Sweepers" }),
];

describe("CoverRow", () => {
  it("scrolls one game at a time through games that don't fit", async () => {
    const user = userEvent.setup();
    render(<CoverRow games={games} />);
    expect(screen.getByRole("link", { name: "Ori" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show previous games" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more games" }));
    expect(screen.getByRole("link", { name: "Turing Complete" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ori" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more games" }));
    expect(screen.getByRole("link", { name: "Moon Sweepers" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more games" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show previous games" }));
    expect(screen.getByRole("link", { name: "Turing Complete" })).toBeInTheDocument();
  });

  it("shows no arrow when every game fits", () => {
    render(<CoverRow games={games.slice(0, 1)} />);
    expect(screen.queryByRole("button")).toHaveAccessibleName(/More actions/);
  });
});
