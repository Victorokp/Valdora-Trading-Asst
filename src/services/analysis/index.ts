/**
 * AnalysisService implementation (32I).
 *
 * Pulls validated, normalized bars from the MarketDataService (the only data
 * path), runs the deterministic analysis engine, and maps failures onto the
 * honest service states — no silent fallbacks:
 *
 * - no provider configured        → NOT_CONFIGURED
 * - unknown instrument            → NOT_FOUND
 * - fewer bars than the declared  → VALIDATION_ERROR ("insufficient data")
 *   minimum
 * - any data-layer failure        → propagated verbatim
 *
 * An integrity failure anywhere in the pipeline is surfaced as
 * INTEGRITY_ERROR — it is never swallowed into a generic provider error.
 */
import { computeAnalysis, type AnalysisResult } from "@/domain/analysis/engine";
import { ANALYSIS_CONVENTIONS } from "@/domain/analysis/indicators";
import { serviceFailure, serviceSuccess, type ServiceResult } from "@/domain/errors";
import { registeredPipSize } from "@/domain/instruments/instrument";
import type { Provenance } from "@/domain/provenance/provenance";
import type { MarketDataService } from "@/services/index";
import type { AnalysisRequest, AnalysisService } from "@/services/index";

/** Range requested from the market-data layer: enough history for warm-up + context. */
const ANALYSIS_BAR_RANGE = "1y";

export class AnalysisServiceImpl implements AnalysisService {
  constructor(private readonly marketData: MarketDataService) {}

  async analyze(request: AnalysisRequest): Promise<ServiceResult<MarketAnalysisResult>> {
    const metadata = await this.marketData.getInstrumentMetadata(request.instrument);
    if (metadata.status === "NOT_CONFIGURED") {
      return serviceFailure<MarketAnalysisResult>("NOT_CONFIGURED", "no market-data provider is configured; analysis cannot run");
    }
    if (metadata.status === "NOT_FOUND") {
      return serviceFailure<MarketAnalysisResult>("NOT_FOUND", `unknown instrument: ${request.instrument}`);
    }
    if (metadata.status !== "SUCCESS") {
      return metadata.status === "INTEGRITY_ERROR"
        ? serviceFailure<MarketAnalysisResult>("INTEGRITY_ERROR", "market-data metadata reported an integrity failure")
        : serviceFailure<MarketAnalysisResult>(metadata.status, `market-data metadata unavailable: ${metadata.error.message}`);
    }

    const pip = registeredPipSize(request.instrument);
    if (!pip.ok) {
      return serviceFailure<MarketAnalysisResult>("VALIDATION_ERROR", `no declared pip size for ${request.instrument} (never inferred)`);
    }

    const bars = await this.marketData.getHistoricalBars(request.instrument, request.timeframe, ANALYSIS_BAR_RANGE);
    if (bars.status === "NOT_CONFIGURED") {
      return serviceFailure<MarketAnalysisResult>("NOT_CONFIGURED", "no market-data provider is configured; analysis cannot run");
    }
    if (bars.status === "INTEGRITY_ERROR") {
      return serviceFailure<MarketAnalysisResult>("INTEGRITY_ERROR", "market data failed an integrity check");
    }
    if (bars.status !== "SUCCESS") {
      return serviceFailure<MarketAnalysisResult>(bars.status, `market data unavailable: ${bars.error.message}`);
    }
    if (bars.value.length < ANALYSIS_CONVENTIONS.minimumBars) {
      return serviceFailure<MarketAnalysisResult>(
        "VALIDATION_ERROR",
        `insufficient data: ${bars.value.length} bars available, ${ANALYSIS_CONVENTIONS.minimumBars} required for the declared analysis conventions`,
      );
    }

    // 32T Phase 9: provenance names the source that actually served these
    // bars. Read through the service contract only — router-backed services
    // expose the serving provider label and its retrieval clock; when a
    // field is not recorded it stays absent (never guessed). A failed
    // status lookup never blocks analysis: the generic quality-gated label
    // below remains the honest fallback.
    const sourceState = await this.marketData.getDataSourceStatus();
    const sourceMeta = sourceState.status === "SUCCESS" ? sourceState.value : undefined;

    const provenance: Provenance = {
      sourceType: "MARKET_DATA_PROVIDER",
      sourceName: sourceMeta?.sourceLabel ?? "app market-data service (quality-gated)",
      methodology: "app market-data service (quality-gated)",
      ...(sourceMeta?.retrievedAt !== undefined ? { acquiredAt: sourceMeta.retrievedAt } : {}),
      notes:
        `bars: ${bars.value.length}; window ends ${bars.value[bars.value.length - 1].timestamp}` +
        (sourceMeta?.note !== undefined ? `; source: ${sourceMeta.note}` : ""),
    };

    const analysis: AnalysisResult = computeAnalysis({
      instrument: request.instrument,
      timeframe: request.timeframe,
      bars: bars.value,
      pipSize: pip.pipSize,
      dataProvenance: provenance,
    });
    return serviceSuccess(analysis);
  }
}

/** Re-exported alias so callers can name the concrete engine output type. */
export type MarketAnalysisResult = AnalysisResult;
