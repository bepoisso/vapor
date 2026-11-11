import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAppRouter } from "@/app/router";

function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(<RouterProvider router={router} />);
}

describe("TopBar", () => {
  it("marks Library as the current page on the home route", async () => {
    renderAt("/");
    const library = await screen.findByRole("link", { name: "Library" });
    expect(library).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Store" })).not.toHaveAttribute("aria-current");
  });

  it("moves the current page when navigating", async () => {
    renderAt("/");
    await userEvent.click(await screen.findByRole("link", { name: "Store" }));
    expect(await screen.findByRole("heading", { name: "Store" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Store" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-current");
  });

  it("focuses the search field with Ctrl+K", async () => {
    renderAt("/");
    const search = await screen.findByRole("searchbox", { name: "Search your library" });
    expect(search).not.toHaveFocus();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(search).toHaveFocus();
  });
});
