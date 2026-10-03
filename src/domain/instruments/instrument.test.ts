import { describe, expect, it } from "vitest";

import {
  REGISTERED_PIP_SIZES,
  registeredFxInstrument,
  registeredPipSize,
  validateInstrument,
  type Instrument,
} from "@/domain/instruments/instrument";

describe("instrument pip-size mapping", () => {
  it("pins the exact frozen mapping for all seven registered pairs", () => {
    expect(REGISTERED_PIP_SIZES).toStrictEqual({
      EURUSD: 0.0001,
      GBPUSD: 0.0001,
      USDJPY: 0.01,
      AUDUSD: 0.0001,
      NZDUSD: 0.0001,
      USDCHF: 0.0001,
      USDCAD: 0.0001,
    });
  });

  it("resolves every registered symbol deterministically", () => {
    for (const [symbol, pip] of Object.entries(REGISTERED_PIP_SIZES)) {
      const lookup = registeredPipSize(symbol);
      expect(lookup).toStrictEqual({ ok: true, pipSize: pip });
    }
  });

  it("fails for an unknown symbol instead of inferring", () => {
    expect(registeredPipSize("XAUUSD")).toStrictEqual({ ok: false, reason: "SYMBOL_UNKNOWN" });
  });

  it("registered instruments carry the declared pip size (never derived)", () => {
    const eurusd = registeredFxInstrument("EURUSD");
    expect(eurusd.pipSize).toBe(0.0001);
    expect(eurusd.baseCurrency).toBe("EUR");
    expect(eurusd.quoteCurrency).toBe("USD");
    const usdjpy = registeredFxInstrument("USDJPY");
    expect(usdjpy.pipSize).toBe(0.01);
  });
});

describe("instrument validation", () => {
  it("accepts a well-formed registered instrument", () => {
    expect(validateInstrument(registeredFxInstrument("GBPUSD"))).toStrictEqual([]);
  });

  it("rejects a declared pip size that contradicts the registered mapping", () => {
    const bad: Instrument = { ...registeredFxInstrument("EURUSD"), pipSize: 0.01 };
    expect(validateInstrument(bad)).toContain("declared pipSize contradicts the registered mapping");
  });

  it("rejects malformed currency codes and identical base/quote", () => {
    const bad: Instrument = {
      symbol: "ABCD",
      displayName: "Broken",
      baseCurrency: "EU",
      quoteCurrency: "EU",
      assetClass: "FX_MAJOR",
    };
    const problems = validateInstrument(bad);
    expect(problems).toContain("baseCurrency must be a 3-letter code");
    expect(problems).toContain("base and quote currencies must differ");
    expect(problems).toContain("symbol must have at least 6 characters");
  });
});
