import { describe, expect, it } from "vitest";

import {
  UNPROVENANCED,
  isProvenanced,
  provenanced,
  type WithProvenance,
} from "@/domain/provenance/provenance";

describe("provenance", () => {
  it("records explicit provenance fields", () => {
    const p = provenanced("RESEARCH_ARTIFACT", {
      sourceName: "Golden Reference",
      hash: "b0d84b156674a2d81e646acdeae014324e85f9906ce3e1071718269612454e95",
      coverageStart: "2003-12-01",
      coverageEnd: "2026-09-25",
    });
    expect(p.sourceType).toBe("RESEARCH_ARTIFACT");
    expect(p.hash).toMatch(/^b0d84b15/);
    expect(p.sourceId).toBeUndefined();
  });

  it("represents unavailable provenance explicitly, never silently", () => {
    const unknown: WithProvenance = UNPROVENANCED;
    expect(isProvenanced(unknown)).toBe(false);
    expect(isProvenanced(provenanced("USER_INPUT"))).toBe(true);
  });

  it("never invents URLs or hashes — unset fields stay unset", () => {
    const p = provenanced("MARKET_DATA_PROVIDER", { sourceName: "provider-x" });
    expect(p.sourceId === undefined).toBe(true);
    expect(p.hash === undefined).toBe(true);
  });
});
