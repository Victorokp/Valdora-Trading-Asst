import { Activity, Gauge, History, LineChart, Radar } from "lucide-react";
import { Link } from "react-router-dom";

import { AskValdora } from "@/components/assistant/AskValdora";
import { EvidenceState } from "@/components/evidence/EvidenceState";
import { EmptyState } from "@/components/feedback/Empty";
import { UnavailableState } from "@/components/feedback/Unavailable";
import { PriceDisplay } from "@/components/market/PriceDisplay";
import { AnalysisPanel } from "@/components/market/AnalysisPanel";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAppServices } from "@/services/app";
import { useEffect, useState } from "react";
import type { RiskState } from "@/domain/risk/risk";

/**
 * Dashboard = command center (32O). Eight priority sections, each a real
 * product surface with an honest state — never a navigation duplicate:
 * 1 market context · 2 active analysis · 3 current signal · 4 risk ·
 * 5 planned trades · 6 user performance · 7 research status (PENDING) ·
 * 8 recent activity. No balance, P&L, win rate or price is fabricated.
 */
export default function DashboardPage() {
  const { risk, journal } = useAppServices();
  const [riskState, setRiskState] = useState<RiskState | null>(null);
  const [plannedCount, setPlannedCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const riskResult = await risk.getRiskState();
      if (!cancelled && riskResult.status === "SUCCESS") setRiskState(riskResult.value);
      const planned = await journal.listPlannedTrades();
      if (!cancelled && planned.status === "SUCCESS") setPlannedCount(planned.value.length);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [risk, journal]);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Your trading intelligence workspace. Analysis, risk and research evidence in one place — the decision stays yours."
        actions={<AskValdora className="hidden md:inline-flex" />}
      />

      {/* 1 · Market context */}
      <Card className="mb-3" aria-label="Market context">
        <CardHeader
          title="Market context"
          description="Primary pair — research-backed lineage"
          actions={
            <Link
              to="/markets"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-accent hover:text-accent-strong"
            >
              <LineChart aria-hidden="true" className="size-3.5" />
              Markets
            </Link>
          }
        />
        <CardBody>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <span className="numeric text-sm font-semibold tracking-wider text-ink">EURUSD</span>
              <span className="ml-2 rounded-pill border border-positive/30 bg-positive/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-positive">
                Research-backed
              </span>
            </div>
            <PriceDisplay label="Price" />
          </div>
          <div className="mt-4">
            <UnavailableState
              compact
              title="No market data provider configured"
              message="The market-data layer is provider-neutral and quality-gated (32F); no live source is connected, so nothing is displayed. Real, sourced data only — always."
            />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* 2 · Active analysis */}
        <AnalysisPanel
          title="Active analysis"
          description="Latest market-structure and setup analysis"
          className="mb-3 lg:mb-0"
        >
          <EmptyState
            compact
            icon={Radar}
            title="No active analysis"              hint="Analysis runs once the market-data and analysis layers are connected. Nothing is estimated."
          />
        </AnalysisPanel>

        {/* 3 · Current signal */}
        <Card className="mb-3 lg:mb-0" aria-label="Strategy and signals">
          <CardHeader
            title="Strategy · Signals"
            description="Deterministic engine output — never predictions"
            actions={
              <Link
                to="/strategy"
                className="inline-flex min-h-9 items-center rounded-control px-2 text-xs font-medium text-accent hover:text-accent-strong"
              >
                Strategy
              </Link>
            }
          />
          <CardBody>
            <EmptyState
              compact
              icon={Activity}
              title="No active setup"
              hint="The strategy engine will surface signal states from real data only — never predictions."
            />
          </CardBody>
        </Card>
      </div>

      {/* 4 · Risk status */}
      <Card className="my-3" aria-label="Risk status">
        <CardHeader
          title="Risk status"
          description="Exposure and limits — configured in Settings"
          actions={
            <Link
              to="/risk"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-accent hover:text-accent-strong"
            >
              <Gauge aria-hidden="true" className="size-3.5" />
              Risk
            </Link>
          }
        />
        <CardBody>
          <MetricGrid columns={4}>
            <Metric
              label="Guardrail status"
              value={riskState ? riskState.guardrailStatus : "UNKNOWN"}
              tone={riskState?.guardrailStatus === "BLOCKED" ? "negative" : riskState?.guardrailStatus === "WARNING" ? "caution" : "default"}
              hint={riskState ? "Worst of the configured guardrail checks" : "No guardrails configured yet"}
            />
            <Metric label="Open exposure" value="—" hint="Available once trades are journaled" />
            <Metric label="Risk / trade" value="—" hint="Configured in Settings → Risk" />
            <Metric label="Drawdown" value="—" hint="Computed from your journal" />
          </MetricGrid>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Risk figures stay empty until guardrails are configured and trades are journaled. No values are estimated and no account size is assumed.
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* 5 · Planned trades */}
        <Card className="mb-3 lg:mb-0" aria-label="Planned trades">
          <CardHeader
            title="Planned trades"
            description="Derived from signals — never executed by the app"
            actions={
              <Link
                to="/journal"
                className="inline-flex min-h-9 items-center rounded-control px-2 text-xs font-medium text-accent hover:text-accent-strong"
              >
                Journal
              </Link>
            }
          />
          <CardBody>
            {plannedCount !== null && plannedCount > 0 ? (
              <p className="text-sm text-ink-secondary">{plannedCount} planned trade{plannedCount === 1 ? "" : "s"} awaiting your decision.</p>
            ) : (
              <EmptyState
                compact
                icon={Activity}
                title="No planned trades"
                hint="A planned trade appears when a signal is confirmed and you choose to keep it. The app never places orders."
              />
            )}
          </CardBody>
        </Card>

        {/* 6 · User performance */}
        <Card className="mb-3 lg:mb-0" aria-label="User performance">
          <CardHeader
            title="Your performance"
            description="Computed only from your own journal"
            actions={
              <Link
                to="/journal"
                className="inline-flex min-h-9 items-center rounded-control px-2 text-xs font-medium text-accent hover:text-accent-strong"
              >
                Journal
              </Link>
            }
          />
          <CardBody>
            <EmptyState
              compact
              icon={History}
              title="No executed trades yet"
              hint="Your performance will appear here after your first completed trade — computed from your records only, never mixed with research results."
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* 7 · Research status */}
        <Card className="mb-3 lg:mb-0" aria-label="Research status">
          <CardHeader
            title="Research status"
            description="Frozen, hash-verified evidence"
            actions={
              <Link
                to="/research"
                className="inline-flex min-h-9 items-center rounded-control px-2 text-xs font-medium text-accent hover:text-accent-strong"
              >
                Research
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
              <span>Historical evidence:</span>
              <span className="font-semibold text-ink">Available</span>
              <span className="text-faint">·</span>
              <span>Phase 30:</span>
              <EvidenceState state="PENDING" size="sm" />
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Forward validation (A1) is preregistered and waiting — the app will never fabricate
              progress or substitute data. Execution timing remains a known material limitation.
            </p>
          </CardBody>
        </Card>

        {/* 8 · Recent activity */}
        <Card className="mb-3 lg:mb-0" aria-label="Recent activity">
          <CardHeader
            title="Recent activity"
            description="Journal entries and system events"
            actions={
              <Link
                to="/journal"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-accent hover:text-accent-strong"
              >
                <History aria-hidden="true" className="size-3.5" />
                Journal
              </Link>
            }
          />
          <CardBody>
            <EmptyState
              compact
              icon={History}
              title="No activity recorded yet"
              hint="Your journal will fill this space with trades, notes and reviews you record yourself."
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
