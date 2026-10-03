import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ChartContainer } from "@/components/market/ChartContainer";
import { InstrumentSelector } from "@/components/market/InstrumentSelector";
import { MarketStatusIndicator } from "@/components/market/MarketStatusIndicator";
import { PriceDisplay } from "@/components/market/PriceDisplay";
import { RDisplay } from "@/components/market/RDisplay";
import { TimeframeSelector } from "@/components/market/TimeframeSelector";

/** Market UI primitives: interactive shells with honest, sourced-value-only displays. */
describe("market UI primitives", () => {
  it("InstrumentSelector offers the static instrument catalog", async () => {
    const user = userEvent.setup();
    let selected = "EURUSD";
    const { rerender } = render(
      <InstrumentSelector value={selected} onChange={(v) => { selected = v; }} />,
    );
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    for (const symbol of ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCHF", "USDCAD"]) {
      expect(screen.getByRole("option", { name: symbol })).toBeInTheDocument();
    }
    await user.selectOptions(select, "GBPUSD");
    expect(selected).toBe("GBPUSD");
    rerender(<InstrumentSelector value={selected} onChange={(v) => { selected = v; }} />);
    expect(select).toHaveValue("GBPUSD");
  });

  it("TimeframeSelector is a keyboard-operable radio group", async () => {
    const user = userEvent.setup();
    let value = "1D";
    render(<TimeframeSelector value={value} onChange={(v) => { value = v; }} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    await user.click(radios[2]);
    expect(value).toBe("1H");
  });

  it("PriceDisplay renders an em dash when no data is connected", () => {
    render(<PriceDisplay label="Price" />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("RDisplay renders only caller-supplied R strings", () => {
    render(<RDisplay value="+1.50R" variant="positive" label="Result" />);
    expect(screen.getByText("+1.50R")).toBeInTheDocument();
  });

  it("ChartContainer communicates the missing data layer honestly", () => {
    render(<ChartContainer title="EURUSD chart" meta="1D" />);
    expect(screen.getByText("EURUSD chart")).toBeInTheDocument();
    expect(screen.getByText(/No market data connected yet/i)).toBeInTheDocument();
  });

  it("MarketStatusIndicator labels session states in text", () => {
    render(<MarketStatusIndicator status="UNKNOWN" />);
    expect(screen.getByText("Session unknown")).toBeInTheDocument();
  });
});
