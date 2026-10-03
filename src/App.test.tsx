import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import App from "@/App";

/**
 * Shell tests: the application starts, all eight primary areas plus 404
 * render, navigation works, and no fabricated trading data appears.
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("VALDORA application shell", () => {
  it("renders the Dashboard with VALDORA identity and honest empty states", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("VALDORA").length).toBeGreaterThan(0);
    expect(screen.getByText("No market data provider configured")).toBeInTheDocument();
    expect(screen.getByText("No active setup")).toBeInTheDocument();
    expect(screen.getByText("No activity recorded yet")).toBeInTheDocument();
  });

  it.each([
    ["/markets", "Market state"],
    ["/analysis", "Setup analysis"],
    ["/strategy", "Strategy & signals"],
    ["/journal", "Trade journal"],
    ["/research", "Evidence library"],
    ["/risk", "Risk status"],
    ["/settings", "Settings"],
  ])("renders the %s page shell", async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { name: heading as string })).toBeInTheDocument();
  });

  it("renders a 404 page for unknown routes", async () => {
    renderAt("/does-not-exist");
    expect(await screen.findByText("This page does not exist.")).toBeInTheDocument();
  });

  it("does not fabricate trading data anywhere in the shell", async () => {
    const { container } = renderAt("/");
    await screen.findByRole("heading", { name: "Dashboard" });
    const text = container.textContent ?? "";
    for (const banned of ["Balance", "P&L", "Win rate", "$10,000", "1.1742", "Buy now", "Trade now"]) {
      expect(text).not.toContain(banned);
    }
  });
});
