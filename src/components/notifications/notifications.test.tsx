/**
 * UI flow tests (32R + honesty guards): notification center interactions and
 * the dashboard's mandated honest copy under the live AppServicesProvider.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppServicesProvider, useAppServices } from "@/services/app";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

function renderWithProviders(ui: React.ReactNode, path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppServicesProvider>{ui}</AppServicesProvider>
    </MemoryRouter>,
  );
}

/** Seeds two notifications through the real service (no mocks). */
function SeedButton() {
  const { notifications } = useAppServices();
  return (
    <button
      type="button"
      onClick={async () => {
        await notifications.create({
          type: "SIGNAL_DETECTED",
          severity: "INFO",
          title: "Setup forming",
          message: "A WATCH state was recorded on EURUSD.",
        });
        await notifications.create({
          type: "RISK_LIMIT_REACHED",
          severity: "CAUTION",
          title: "Guardrail attention",
          message: "A guardrail check returned WARNING.",
        });
      }}
    >
      seed
    </button>
  );
}

describe("NotificationCenter (32R)", () => {
  it("shows the honest empty state when no notifications exist", async () => {
    renderWithProviders(<NotificationCenter />);
    expect(await screen.findByText("No notifications")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeDisabled();
  });

  it("creates, displays with unread badge, and clears via mark-all-read", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <NotificationCenter />
        <SeedButton />
      </div>,
    );

    await user.click(await screen.findByRole("button", { name: "seed" }));
    expect(await screen.findByText("Setup forming")).toBeInTheDocument();
    expect(screen.getByText("Guardrail attention")).toBeInTheDocument();
    expect(screen.getByText(/2 unread/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /mark all read/i }));
    await waitFor(() => {
      expect(screen.queryByText(/2 unread/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Setup forming")).toBeInTheDocument(); // records remain, marked read
  });
});

describe("Dashboard honesty under the live provider", () => {
  it("keeps the mandated honest copy when services return no data", async () => {
    const { default: DashboardPage } = await import("@/pages/DashboardPage");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppServicesProvider>
          <DashboardPage />
        </AppServicesProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("No market data provider configured")).toBeInTheDocument();
    expect(screen.getByText("No active setup")).toBeInTheDocument();
    expect(screen.getByText("No activity recorded yet")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const banned of ["Balance", "P&L", "Win rate", "$10,000", "1.1742"]) {
      expect(text).not.toContain(banned);
    }
  });
});
