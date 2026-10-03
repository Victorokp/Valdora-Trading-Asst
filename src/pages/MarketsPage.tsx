import { useState } from "react";
import { CandleChart } from "@/components/market/CandleChart";
import { EmptyState } from "@/components/feedback/Empty";
import { UnavailableState } from "@/components/feedback/Unavailable";
import { AnalysisPanel } from "@/components/market/AnalysisPanel";
import { ChartContainer } from "@/components/market/ChartContainer";
import { DataStatusBadge } from "@/components/market/DataStatusBadge";
import { InstrumentSelector } from "@/components/market/InstrumentSelector";
import { MarketStatusIndicator } from "@/components/market/MarketStatusIndicator";
import { PriceDisplay } from "@/components/market/PriceDisplay";
import { TimeframeSelector } from "@/components/market/TimeframeSelector";
import { Badge } from "@/components/ui/Badge";
import { WatchlistPanel } from "@/components/watchlist/WatchlistPanel";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { PageHeader } from "@/components/ui/PageHeader";
import { useInstrumentData } from "@/hooks/useMarketData";
import { formatPrice } from "@/lib/formatters";
import type { Timeframe } from "@/domain/market/timeframe";

const TF_TO_CANONICAL: Record<string, Timeframe> = { "1D": "DAILY", "4H": "H4", "1H": "H1", "15m": "M15" };

/**
 * Markets (32S): real instrument/timeframe binding through the market-data
 * service. The service is provider-neutral and, with no verified provider
 * configured, stays in the honest unconfigured state. The page renders the
 * honest label for each state the layer can produce:
 *
 *   FRESH       — provider returned and the quality gate passed
 *   STALE       — cache expired beyond the stale grace window (reported as UNAVAILABLE, never served as fresh)
 *   UNAVAILABLE — no provider configured / provider unavailable / rate limited
 *   ERROR       — provider-level failure (timeout, auth, invalid payload...)
 *   EMPTY       — provider returned a valid but zero-row dataset
 */
export default function MarketsPage() {
  const [instrument, setInstrument] = useState<string>("EURUSD");
  const [displayTf, setDisplayTf] = useState<string>("1D");
  const timeframe: Timeframe = TF_TO_CANONICAL[displayTf] ?? "DAILY";
  const { dataSource, bars, snapshot, analysis } = useInstrumentData(instrument, timeframe);
  const lastBar = bars.state === "SUCCESS" && bars.value.length > 0 ? bars.value[bars.value.length - 1] : undefined;
  const prevBar = bars.state === "SUCCESS" && bars.value.length > 1 ? bars.value[bars.value.length - 2] : undefined;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Markets"
        title="Market state"
        description="Per-pair conditions from the quality-gated market-data layer — one source of truth, never a second divergent feed."
      />
      <Card className="mb-3">
        <CardBody className="pt-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <InstrumentSelector value={instrument} onChange={setInstrument} />
            <TimeframeSelector value={displayTf} onChange={setDisplayTf} />
            <MarketStatusIndicator status="UNKNOWN" />
            <DataStatusBadge dataSource={dataSource} />
          </div>
        </CardBody>
      </Card>
      <Card className="mb-3">
        <CardHeader
          title={`${instrument} — ${displayTf}`}
          description="Quote and session — rendered only from returned data"
          actions={snapshot.state === "SUCCESS" ? <Badge variant="neutral">Sourced</Badge> : <Badge variant="outline">No data feed</Badge>}
        />
        <CardBody>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <PriceDisplay
              label="Last close"
              value={lastBar ? formatPrice(lastBar.close) : undefined}
              changePercent={
                lastBar && prevBar && prevBar.close !== 0
                  ? `${(((lastBar.close - prevBar.close) / prevBar.close) * 100).toFixed(2)}%`
                  : undefined
              }
            />
            <Metric label="Open" value={lastBar ? formatPrice(lastBar.open) : "—"} />
            <Metric label="High" value={lastBar ? formatPrice(lastBar.high) : "—"} />
            <Metric label="Low" value={lastBar ? formatPrice(lastBar.low) : "—"} />
          </div>
          {snapshot.state === "UNAVAILABLE" ? (
            <div className="mt-4">
              <UnavailableState
                compact
                title="No market data provider configured"
                message="The market-data layer is provider-neutral and quality-gated; no live source is connected, so nothing is displayed. OHLC, chart and analysis activate automatically once a provider is configured."
              />
            </div>
          ) : null}
          {snapshot.state === "ERROR" ? (
            <div className="mt-4">
              <UnavailableState compact title="Snapshot unavailable" message={snapshot.message} />
            </div>
          ) : null}
        </CardBody>
      </Card>
      <div className="mb-3">
        <ChartContainer
          title={`${instrument} chart`}
          meta={displayTf}
        >
          <CandleChart
            bars={bars.state === "SUCCESS" ? bars.value : []}
            caption={
              bars.state === "SUCCESS" && bars.value.length > 0
                ? `${bars.value.length} bars — quality-gated historical data — never presented as live`
                : undefined
            }
          />
        </ChartContainer>
      </div>
      <div className="mb-3">
        <WatchlistPanel />
      </div>
      <AnalysisPanel title="Market structure" description="Structure — trend — volatility — indicators">
        {analysis.state === "SUCCESS" ? (
          <MetricGrid columns={4}>
            <Metric label="Bar count" value={analysis.value.barCount} />
            <Metric label="As of" value={analysis.value.asOf} />
            <Metric
              label="Trend"
              value={analysis.value.observations.find((o) => o.kind === "TREND")?.value ?? "—"}
            />
            <Metric
              label="Volatility"
              value={analysis.value.observations.find((o) => o.kind === "VOLATILITY")?.value ?? "—"}
            />
          </MetricGrid>
        ) : analysis.state === "UNAVAILABLE" ? (
          <EmptyState compact title="No analysis available" hint={analysis.message} />
        ) : analysis.state === "ERROR" ? (
          <EmptyState compact title="Analysis not computed" hint={analysis.message} />
        ) : analysis.state === "EMPTY" ? (
          <EmptyState compact title="No analysis available" hint="No bars returned for this instrument/timeframe." />
        ) : (
          <EmptyState compact title="Loading analysis…" />
        )}
      </AnalysisPanel>
    </div>
  );
}
