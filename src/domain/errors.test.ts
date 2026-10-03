import { describe, expect, it } from "vitest";

import {
  SERVICE_STATUSES,
  isIntegrityFailure,
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/domain/errors";

describe("service result / error model", () => {
  it("supports exactly the ten required statuses", () => {
    expect([...SERVICE_STATUSES]).toStrictEqual([
      "SUCCESS",
      "UNAVAILABLE",
      "NOT_CONFIGURED",
      "VALIDATION_ERROR",
      "NOT_FOUND",
      "PERMISSION_DENIED",
      "RATE_LIMITED",
      "PROVIDER_ERROR",
      "INTEGRITY_ERROR",
      "UNKNOWN",
    ]);
  });

  it("builds a success result with a value", () => {
    const result = serviceSuccess<readonly number[]>([1, 2]);
    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") expect(result.value).toStrictEqual([1, 2]);
  });

  it("builds a failure result with a user-safe message", () => {
    const result: ServiceResult<string> = serviceFailure<string>(
      "PROVIDER_ERROR",
      "Market data is temporarily unavailable.",
      "HTTP 503 from provider",
    );
    expect(result.status).toBe("PROVIDER_ERROR");
    if (result.status !== "SUCCESS") {
      expect(result.error.message).toBe("Market data is temporarily unavailable.");
      expect(result.error.detail).toBe("HTTP 503 from provider");
      expect(result.value).toBeUndefined();
    }
  });

  it("omits the detail field when no detail is given", () => {
    const result = serviceFailure<string>("NOT_FOUND", "Signal not found.");
    if (result.status !== "SUCCESS") {
      expect("detail" in result.error).toBe(false);
    }
  });

  it("distinguishes research-integrity failures from provider failures", () => {
    const integrity = serviceFailure<string>("INTEGRITY_ERROR", "Frozen artifact mismatch.");
    const provider = serviceFailure<string>("PROVIDER_ERROR", "Provider failed.");
    expect(isIntegrityFailure(integrity)).toBe(true);
    expect(isIntegrityFailure(provider)).toBe(false);
  });
});
