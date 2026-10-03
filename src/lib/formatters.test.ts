import { formatCurrency, formatPercent, formatRMultiple, formatTimestamp } from "./formatters";

describe("data presentation formatters", () => {
  it("formats percentages with an explicit sign and no invented values", () => {
    expect(formatPercent(0.18)).toBe("+0.18%");
    expect(formatPercent(-0.4)).toBe("-0.40%");
    expect(formatPercent(0)).toBe("0.00%");
    expect(formatPercent(undefined)).toBe("—");
  });

  it("formats currency without inventing amounts", () => {
    expect(formatCurrency(1000)).toBe("$1,000.00");
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("formats R-multiples with an explicit sign", () => {
    expect(formatRMultiple(1.5)).toBe("+1.50R");
    expect(formatRMultiple(-2)).toBe("-2.00R");
    expect(formatRMultiple(0)).toBe("0.00R");
    expect(formatRMultiple(undefined)).toBe("—");
  });

  it("formats timestamps as UTC or an em dash when absent", () => {
    expect(formatTimestamp("2026-09-27T14:03:00Z")).toBe("2026-09-27 14:03 UTC");
    expect(formatTimestamp(undefined)).toBe("—");
    expect(formatTimestamp("not-a-date")).toBe("—");
  });
});
