import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataStatusBadge, describeDataSource } from "@/components/market/DataStatusBadge";
import type { LoadState } from "@/hooks/useMarketData";
import type { DataSourceMetadata } from "@/services/index";

/** 32T Phase 11: the six honest data-source states, pinned. */
function success(value: Partial<DataSourceMetadata>): LoadState<DataSourceMetadata> {
  return { state: "SUCCESS", value: { status: "AVAILABLE", mode: "LIVE", ...value } };
}

describe("data-source status labels", () => {
  it("shows Live — Twelve Data for a primary live feed", () => {
    expect(describeDataSource(success({ sourceLabel: "Twelve Data" }))).toStrictEqual({
      label: "Live — Twelve Data",
      variant: "positive",
    });
  });

  it("shows the fallback wording for degraded live data", () => {
    expect(
      describeDataSource(success({ status: "DEGRADED", sourceLabel: "Massive", note: "Live — Massive fallback" })),
    ).toStrictEqual({ label: "Live — Massive fallback", variant: "caution" });
    expect(describeDataSource(success({ status: "DEGRADED" }))).toStrictEqual({
      label: "Degraded",
      variant: "caution",
    });
  });

  it("never labels cached data as live", () => {
    const cached = describeDataSource(success({ status: "DEGRADED", note: "Using cached market data" }));
    expect(cached).toStrictEqual({ label: "Using cached market data", variant: "caution" });
    expect(cached.label).not.toContain("Live");
  });

  it("shows Market data unavailable for unavailable and unconfigured states", () => {
    expect(describeDataSource({ state: "UNAVAILABLE", message: "all providers failed" })).toStrictEqual({
      label: "Market data unavailable",
      variant: "outline",
    });
    expect(describeDataSource(success({ status: "NOT_CONFIGURED", mode: "UNKNOWN" }))).toStrictEqual({
      label: "Market data unavailable",
      variant: "outline",
    });
  });

  it("shows Degraded when the status itself errored", () => {
    expect(describeDataSource({ state: "ERROR", message: "boom", code: "PROVIDER_ERROR" })).toStrictEqual({
      label: "Degraded",
      variant: "caution",
    });
  });

  it("labels historical fixture sources by identity, never as live", () => {
    expect(describeDataSource(success({ mode: "HISTORICAL", sourceLabel: "static-fixture" }))).toStrictEqual({
      label: "static-fixture",
      variant: "outline",
    });
  });

  it("renders the label inside a badge", () => {
    render(<DataStatusBadge dataSource={{ state: "UNAVAILABLE", message: "down" }} />);
    expect(screen.getByText("Market data unavailable")).toBeInTheDocument();
  });
});
