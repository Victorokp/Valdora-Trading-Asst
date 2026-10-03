import { useEffect, useState } from "react";
import { GitBranch, History, Lock, ScrollText } from "lucide-react";

import { EmptyState } from "@/components/feedback/Empty";
import { AnalysisPanel } from "@/components/market/AnalysisPanel";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAppServices } from "@/services/app";
import type { StrategyVersion } from "@/domain/strategy/strategy";
import type { StrategyRuleSet, StrategyRule } from "@/domain/strategy/rules";

/** Render one declared rule with its conditions (configuration, not logic). */
function RuleCard({ rule }: { rule: StrategyRule }) {
  return (
    <li className="rounded-control border border-line bg-surface/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">{rule.label}</span>
        <Badge variant="outline">{rule.id}</Badge>
      </div>
      {rule.description ? <p className="mt-1 text-xs leading-relaxed text-muted">{rule.description}</p> : null}
      <ul className="mt-2 space-y-1">
        {rule.conditions.map((c, i) => (
          <li key={`${c.key}-${i}`} className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className="numeric rounded bg-modal px-1.5 py-0.5 text-[11px] text-ink-secondary">{c.key}</span>
            <span className="font-semibold uppercase text-accent-strong">{c.operator}</span>
            <span className="numeric rounded bg-modal px-1.5 py-0.5 text-[11px] text-ink-secondary">{c.thresholdKey ?? c.threshold}</span>
            <span>— {c.expected}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Strategy (32T): the frozen GR-v1 version as visible, immutable
 * configuration — version list with immutability labels, methodology
 * provenance and the declared rule sets. The engine arrives with real data;
 * the rule-trace explainability surface is already wired.
 */
export default function StrategyPage() {
  const { strategy } = useAppServices();
  const [version, setVersion] = useState<StrategyVersion | null>(null);
  const [longRules, setLongRules] = useState<StrategyRuleSet | null>(null);
  const [shortRules, setShortRules] = useState<StrategyRuleSet | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const v = await strategy.getStrategyVersion("EURUSD-GR-v1");
      if (!cancelled && v.status === "SUCCESS") setVersion(v.value);
      const longSet = await strategy.getRuleSet("EURUSD-GR-v1", "LONG");
      if (!cancelled && longSet.status === "SUCCESS") setLongRules(longSet.value);
      const shortSet = await strategy.getRuleSet("EURUSD-GR-v1", "SHORT");
      if (!cancelled && shortSet.status === "SUCCESS") setShortRules(shortSet.value);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [strategy]);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Strategy"
        title="Strategy & signals"
        description="Versioned rules with full explainability. Historical evidence and your own performance are always separate surfaces."
      />

      <Card className="mb-3">
        <CardHeader
          title="Strategy versions"
          description="Deterministic, version-stamped configurations"
          actions={<Badge variant="accent">EURUSD-GR-v1 · frozen</Badge>}
        />
        <CardBody>
          {version === null ? (
            <EmptyState
              compact
              icon={GitBranch}
              title="Strategy version unavailable"
              hint="The frozen GR-v1 configuration should always be present; if it is missing, the app reports that instead of inventing one."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">{version.versionLabel}</span>
                <Badge variant="neutral">{version.versionId}</Badge>
                {version.frozen ? (
                  <Badge variant="positive">
                    <Lock aria-hidden="true" className="mr-1 size-3" />
                    Frozen — never edited
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-muted">{version.note}</p>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Declared parameters</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(version.parameters).map(([key, value]) => (
                    <span key={key} className="numeric rounded bg-modal px-1.5 py-0.5 text-[11px] text-ink-secondary">
                      {key}: {String(value)}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Research provenance</p>
                <ul className="mt-1.5 space-y-1">
                  {version.researchProvenance.map((ref, i) => (
                    <li key={i} className="text-xs text-muted">
                      {ref.phase} · {ref.artifact} · evidence {ref.evidenceState}
                      {ref.commit ? ` · commit ${ref.commit}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <AnalysisPanel
        title="Declared rule set — LONG"
        description="Configuration evaluated by the deterministic rule engine (32J); never executed by the app"
        className="mb-3"
        actions={longRules ? <Badge variant="outline">{longRules.entryRules.length} entry rules</Badge> : undefined}
      >
        {longRules === null ? (
          <EmptyState compact icon={GitBranch} title="Rule set unavailable" />
        ) : (
          <ul className="space-y-2">
            {longRules.entryRules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
            <li className="pt-1 text-xs text-muted">
              <span className="font-medium uppercase tracking-wider text-caution">Invalidation:</span>{" "}
              {longRules.invalidationRules.map((r) => r.label).join("; ")}
            </li>
            {longRules.exitPlan ? (
              <li className="text-xs text-muted">
                <span className="font-medium uppercase tracking-wider text-muted">Exit plan:</span> {longRules.exitPlan.description}
              </li>
            ) : null}
          </ul>
        )}
      </AnalysisPanel>

      <AnalysisPanel
        title="Declared rule set — SHORT"
        description="Declared out of scope for this version (the historical research is long-only)"
        className="mb-3"
      >
        {shortRules !== null && shortRules.entryRules.length === 0 ? (
          <EmptyState
            compact
            icon={ScrollText}
            title="Out of scope by declaration"
            hint="This version defines no short rules. Nothing is inferred to fill the gap."
          />
        ) : (
          <ul className="space-y-2">
            {shortRules?.entryRules.map((rule) => <RuleCard key={rule.id} rule={rule} />)}
          </ul>
        )}
      </AnalysisPanel>

      <AnalysisPanel title="Signal history" description="Engine-emitted signal states over time" className="mb-3">
        <EmptyState
          compact
          icon={History}
          title="No signal history"
          hint="Signals appear once the strategy engine runs on real market data. No backtest results are shown here as performance."
        />
      </AnalysisPanel>

      <Card>
        <CardHeader title="Strategy metadata & limitations" description="Standing disclosure" />
        <CardBody>
          <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted">
            <li>Historical research results are evidence, not promises — past results never prove future profitability.</li>
            <li>Execution timing is materially sensitive (Phase 29). The phrase “robust to execution delay” is banned in this product.</li>
            <li>Forward validation (Phase 30) is preregistered and pending — no forward claims exist yet.</li>
          </ul>
          <EmptyState
            compact
            icon={ScrollText}
            title="Rule evaluation activates with market data"
            hint="Each entry, stop, target and validation rule will show its inputs and pass/fail/unavailable reasoning once a provider is configured."
            className="mt-4"
          />
        </CardBody>
      </Card>
    </div>
  );
}
