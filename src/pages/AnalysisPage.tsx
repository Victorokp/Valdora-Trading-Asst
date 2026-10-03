import { Layers, ListTree, Radar, Scale } from "lucide-react";
import { AskValdora } from "@/components/assistant/AskValdora";
import { EmptyState } from "@/components/feedback/Empty";
import { UnavailableState } from "@/components/feedback/Unavailable";
import { AnalysisPanel } from "@/components/market/AnalysisPanel";
import { InstrumentSelector } from "@/components/market/InstrumentSelector";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { useState } from "react";
import { useInstrumentData } from "@/hooks/useMarketData";
import { formatPrice } from "@/lib/formatters";
import type { Timeframe } from "@/domain/market/timeframe";

const TF_TO_CANONICAL: Record<string, Timeframe> = { "1D": "DAILY", "4H": "H4", "1H": "H1", "15m": "M15" };

/**
 * Analysis (32I): the deterministic analysis engine over the single data
 * path. Observations (measured facts) and interpretations (neutral framing)
 * render separately; insufficient data / unavailable states are honest and
 * explained — no silent fallbacks. Market data is never presented as live
 * while no verified live provider is configured.
 */
export default function AnalysisPage() {
  const [instrument, setInstrument] = useState<string>("EURUSD");
  const [displayTf] = useState<string>("1D");
  const timeframe: Timeframe = TF_TO_CANONICAL[displayTf] ?? "DAILY";
  const { analysis, bars, dataSource } = useInstrumentData(instrument, timeframe);
  const lastBar = bars.state === "SUCCESS" && bars.value.length > 0 ? bars.value[bars.value.length - 1] : undefined;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Analysis"
        title="Setup analysis"
        description="Structured, explainable analysis — every number traceable to market data, strategy rules and calculations."
        actions={<AskValdora variant="button" className="hidden sm:inline-flex" />}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <InstrumentSelector value={instrument} onChange={setInstrument} />
        <Badge variant="outline">{displayTf}</Badge>
        {dataSource.state === "SUCCESS" ? (
          <Badge variant="outline">{dataSource.value.sourceLabel ?? dataSource.value.mode}</Badge>
        ) : dataSource.state === "UNAVAILABLE" ? (
          <Badge variant="outline">{dataSource.message ?? "unavailable"}</Badge>
        ) : dataSource.state === "ERROR" ? (
          <Badge variant="outline">{dataSource.code}</Badge>
        ) : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <AnalysisPanel title="Market structure" description="Swing and bias labeling">
          {analysis.state === "SUCCESS" ? (
            <ul className="space-y-1.5 text-xs text-muted">
              {analysis.value.observations.map((o, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium uppercase tracking-wider text-ink-secondary">{o.kind}</span>
                  <span className="numeric text-ink">{String(o.value)}</span>
                </li>
              ))}
            </ul>
          ) : analysis.state === "UNAVAILABLE" || analysis.state === "ERROR" ? (
            <EmptyState
              compact
              icon={Layers}
              title={analysis.state === "UNAVAILABLE" ? "Analysis unavailable" : "Analysis not computed"}
              hint={analysis.message}
            />
          ) : analysis.state === "EMPTY" ? (
            <EmptyState compact icon={Layers} title="No analysis available" hint="No bars returned for this selection." />
          ) : (
            <EmptyState compact icon={Layers} title="Loading analysis…" />
          )}
        </AnalysisPanel>
        <AnalysisPanel title="Indicators" description="EMA20 — EMA50 — ATR14 (declared conventions)">
          {analysis.state === "SUCCESS" ? (
            <ul className="space-y-1.5 text-xs text-muted">
              {analysis.value.indicatorValues.map((v, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium uppercase tracking-wider text-ink-secondary">{v.name}</span>
                  <span className="numeric text-ink">
                    {v.value !== undefined ? formatPrice(v.value) : "not computed (warm-up)"}
                  </span>
                </li>
              ))}
              <li className="pt-1 text-[10px] uppercase tracking-wider text-faint">
                conventions: {analysis.value.conventions.version} — EMA seed {analysis.value.conventions.emaSeeding} — ATR{" "}
                {analysis.value.conventions.atrMethod}
              </li>
            </ul>
          ) : (
            <EmptyState
              compact
              icon={ListTree}
              title="Indicators not computed"
              hint="Computed from normalized bars by the analysis engine — no data, no numbers."
            />
          )}
        </AnalysisPanel>
        <AnalysisPanel title="Interpretations" description="Neutral framing of measured facts — never a signal">
          {analysis.state === "SUCCESS" ? (
            analysis.value.interpretations.length === 0 ? (
              <EmptyState
                compact
                icon={Scale}
                title="No interpretations for this state"
                hint="The engine emits interpretation entries only when observations support them."
              />
            ) : (
              <ul className="space-y-1.5 text-xs text-muted">
                {analysis.value.interpretations.map((it, i) => (
                  <li key={i}>
                    {it.kind === "CONTEXT" ? (
                      <span>
                        <Badge variant="outline">{it.label}</Badge>
                      </span>
                    ) : it.kind === "CONDITION_NOTE" ? (
                      <span>{it.note}</span>
                    ) : (
                      <span className="text-caution">{it.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <EmptyState
              compact
              icon={Scale}
              title="Nothing to interpret yet"
              hint="Interpretations appear with computed observations."
            />
          )}
        </AnalysisPanel>
        <AnalysisPanel title="Rule evaluation & explanation" description="Why a setup does or does not qualify">
          <EmptyState
            compact
            icon={Radar}
            title="Rule evaluation activates with market data"
            hint="Once a provider is configured, the strategy engine traces every rule condition (PASS/FAIL/UNAVAILABLE) here — no data, no evaluation."
          />
        </AnalysisPanel>
      </div>
      <div className="mt-3">
        <UnavailableState
          title="Position sizing calculator"
          message="Position sizing runs through the risk engine with transparent inputs (account equity and risk % are user-configured; nothing is assumed). Configure guardrails in Settings — Risk."
        />
      </div>
      {lastBar ? (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-faint">
          Latest evaluated bar: {lastBar.timestamp}
        </p>
      ) : null}
    </div>
  );
}
