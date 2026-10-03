import { useEffect, useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";

import { AnalysisPanel } from "@/components/market/AnalysisPanel";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAppServices, guardrailSummary } from "@/services/app";
import type { GuardrailCheck, RiskState } from "@/domain/risk/risk";

const STATUS_VARIANT = {
  NORMAL: "positive",
  WARNING: "caution",
  BLOCKED: "negative",
  UNKNOWN: "outline",
} as const;

function CheckRow({ check }: { check: GuardrailCheck }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-secondary">{check.limit}</span>
          <Badge variant={STATUS_VARIANT[check.status]}>{check.status}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted">{check.message}</p>
      </div>
    </li>
  );
}

/**
 * Risk (32K): the risk engine with neutral guardrail states. Every limit is
 * shown with its status and a factual explanation; unconfigured limits are
 * UNKNOWN (never skipped), and nothing assumes an account size.
 */
export default function RiskPage() {
  const { risk } = useAppServices();
  const [state, setState] = useState<RiskState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await risk.getRiskState();
      if (!cancelled) {
        if (result.status === "SUCCESS") setState(result.value);
        setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [risk]);

  const summary = state ? guardrailSummary(state.guardrails) : { status: "UNKNOWN" as const, explanation: "not evaluated yet" };

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Risk"
        title="Risk status"
        description="Guardrails protect discipline — they warn, never silently override, and never invent numbers."
      />

      <Card className="mb-3">
        <CardHeader
          title="Guardrails"
          description="Configured in Settings → Risk; every check explains its outcome"
          actions={<Badge variant={STATUS_VARIANT[summary.status]}>{summary.status}</Badge>}
        />
        <CardBody>
          <MetricGrid columns={4}>
            <Metric label="Aggregate" value={summary.status} tone={summary.status === "BLOCKED" ? "negative" : summary.status === "WARNING" ? "caution" : "default"} />
            <Metric label="Open exposure" value="—" hint="Unknown until trades are journaled" />
            <Metric label="Risk / trade" value="—" hint="Not configured yet" />
            <Metric label="Drawdown" value="—" hint="Unknown until closed trades exist" />
          </MetricGrid>
          {!loaded ? (
            <p className="mt-4 text-xs text-muted">Evaluating guardrails…</p>
          ) : state && state.guardrails.length > 0 ? (
            <ul className="mt-4 divide-y divide-line">
              {state.guardrails.map((c, i) => (
                <CheckRow key={`${c.limit}-${i}`} check={c} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-muted">
              No guardrails are configured yet. Configure limits (max risk per trade, max open exposure, minimum R:R, max concurrent trades) in Settings → Risk — until then every check reports UNKNOWN rather than assuming.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <AnalysisPanel title="Position sizing" description="Account · risk % · stop distance ⇒ size — inputs you supply">
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
            <li className="flex items-start gap-2">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-faint" />
              Sizing computes only from explicit inputs: stop distance, declared pip size, your configured risk fraction.
            </li>
            <li className="flex items-start gap-2">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-caution" />
              Missing inputs yield UNKNOWN with a reason — a default account size is never assumed.
            </li>
          </ul>
          <div className="mt-3">
            <Badge variant="outline">Candidate evaluation: available via the risk engine</Badge>
          </div>
        </AnalysisPanel>

        <AnalysisPanel title="Limits & warnings" description="Warnings, never silent overrides">
          <EmptyLimitsHint />
        </AnalysisPanel>
      </div>
    </div>
  );
}

function EmptyLimitsHint() {
  const { risk } = useAppServices();
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const g = await risk.getGuardrails();
      if (!cancelled && g.status === "SUCCESS") setConfigured(Object.keys(g.value).length > 0);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [risk]);

  if (configured === null) return <p className="text-xs text-muted">Checking…</p>;
  return configured ? (
    <p className="text-xs text-muted">Limits are configured — each check above explains its current status.</p>
  ) : (
    <p className="text-xs leading-relaxed text-muted">
      No limits configured yet. Until you set them in Settings → Risk, the engine reports UNKNOWN — it never treats “not configured” as “safe”.
    </p>
  );
}
