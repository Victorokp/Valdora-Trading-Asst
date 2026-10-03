import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { EmptyState } from "@/components/feedback/Empty";
import { ErrorState } from "@/components/feedback/Error";
import { PanelSkeleton } from "@/components/feedback/Loading";
import { UnavailableState } from "@/components/feedback/Unavailable";

/** Feedback components: empty / loading / error / unavailable all behave honestly. */
describe("feedback components", () => {
  it("EmptyState explains why a surface is empty", () => {
    render(<EmptyState title="No market data connected yet." hint="Connect a provider to begin." />);
    expect(screen.getByText("No market data connected yet.")).toBeInTheDocument();
    expect(screen.getByText("Connect a provider to begin.")).toBeInTheDocument();
  });

  it("PanelSkeleton is a loading placeholder, not content", () => {
    render(<PanelSkeleton lines={2} />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText(/.+/)).not.toBeInTheDocument();
  });

  it("ErrorState offers retry when a handler is provided", async () => {
    let retried = false;
    render(
      <ErrorState
        title="Market data unavailable"
        message="The provider did not respond."
        guidance="Check your connection, then retry."
        onRetry={() => {
          retried = true;
        }}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retried).toBe(true);
  });

  it("ErrorState omits retry when no handler is provided", () => {
    render(<ErrorState title="Failed" message="Nothing to retry." />);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("UnavailableState is distinct from an error (status, not alert)", () => {
    render(<UnavailableState title="Feature not available yet" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
