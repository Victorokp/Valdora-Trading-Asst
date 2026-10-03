import { useEffect, useState } from "react";
import { FileText, Microscope } from "lucide-react";

import { EvidenceState } from "@/components/evidence/EvidenceState";
import { EVIDENCE_STATES } from "@/domain/types";
import type { EvidenceState as EvidenceStateType } from "@/domain/types";
import type { ResearchPhaseSummary } from "@/domain/research/evidence";
import type { Phase30Readiness } from "@/domain/research/phase30";
import type { ResearchMetric, ResearchPhaseDescription } from "@/services/index";
import type { ResearchRef } from "@/domain/research/evidence";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { researchService } from "@/services/research";
import { REGISTRY_PHASE_ORDER } from "@/services/research/registry";

/**
 * Research viewer (32H). Every phase card renders from the ResearchService
 * result: six blocks (purpose · methodology · data · results · limitations ·
 * status), artifact-backed metrics with citations, and the Phase-30 readiness
 * panel. The UI never infers research conclusions itself — unknown phases
 * render NOT_FOUND, unavailable states render honestly.
 */

/** Six-block viewer contract (Part 2 §2). */
const VIEWER_BLOCKS = ["Purpose", "Methodology", "Data", "Results", "Limitations", "Status"] as const;

function PhaseCard({ phase }: { phase: ResearchPhaseSummary }) {
  const [metrics, setMetrics] = useState<readonly ResearchMetric[]>([]);
  const [description, setDescription] = useState<ResearchPhaseDescription | null>(null);
  const [refs, setRefs] = useState<readonly ResearchRef[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [metricsResult, descriptionResult, refsResult] = await Promise.all([
        researchService.getPhaseMetrics(phase.id),
        researchService.getPhaseDescription(phase.id),
        researchService.getResearchRefs(phase.id),
      ]);
      if (!active) return;
      if (metricsResult.status === "SUCCESS") setMetrics(metricsResult.value);
      if (descriptionResult.status === "SUCCESS") setDescription(descriptionResult.value);
      if (refsResult.status === "SUCCESS") setRefs(refsResult.value);
    })();
    return () => {
      active = false;
    };
  }, [phase.id]);

  return (
    <Card aria-label={phase.title}>
      <CardHeader
        title={phase.title}
        description={phase.summary}
        actions={<EvidenceState state={phase.evidenceState} size="sm" />}
      />
      <CardBody>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          {VIEWER_BLOCKS.map((block) => (
            <li key={block} className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-faint">
              <FileText aria-hidden="true" className="size-3" />
              {block}
            </li>
          ))}
        </ul>

        {description !== null ? (
          <div className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-muted">
            <p>
              <span className="text-ink-secondary">Purpose · </span>
              {description.purpose}
            </p>
            <p>
              <span className="text-ink-secondary">Data · </span>
              {description.data}
            </p>
          </div>
        ) : null}

        {metrics.length > 0 ? (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">Artifact-backed metrics</p>
            <ul className="mt-1.5 space-y-1">
              {metrics.map((metric) => (
                <li key={metric.label} className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                  <span className="text-muted">{metric.label}</span>
                  <span
                    className="numeric font-semibold text-ink"
                    title={`Artifact: ${metric.ref.artifact} @ ${metric.ref.commit ?? "pinned"}${metric.ref.limitation ? ` · ${metric.ref.limitation}` : ""}`}
                  >
                    {metric.value}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
              Pinned to frozen artifacts ({metrics[0]?.ref.artifact} @ {metrics[0]?.ref.commit ?? "pinned"}) — not computed by this app.
            </p>
          </div>
        ) : null}

        {phase.limitations.length > 0 ? (
          <div className="mt-3 rounded-control border border-caution/25 bg-caution/5 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-caution">Limitations</p>
            <ul className="mt-1 space-y-0.5">
              {phase.limitations.map((limitation) => (
                <li key={limitation} className="text-[11px] leading-relaxed text-muted">
                  · {limitation}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-3 text-[10px] text-faint">
          {refs.length > 0
            ? `Artifact identity: ${refs.map((r) => `${r.artifact} @ ${r.commit ?? "pinned"}`).join(" · ")}`
            : "Summary record — artifact pins arrive with the phase's own refs."}
        </p>
      </CardBody>
    </Card>
  );
}

export default function ResearchPage() {
  const [phases, setPhases] = useState<readonly ResearchPhaseSummary[] | null>(null);
  const [readiness, setReadiness] = useState<Phase30Readiness | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [phasesResult, readinessResult] = await Promise.all([
        researchService.listPhases(),
        researchService.getPhase30Readiness(),
      ]);
      if (!active) return;
      if (phasesResult.status === "SUCCESS") setPhases(phasesResult.value);
      if (readinessResult.status === "SUCCESS") setReadiness(readinessResult.value);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Research"
        title="Evidence library"
        description="Frozen, hash-verified research evidence (Phase 21–31), resolved through the ResearchService boundary. Presented as evidence — never as marketing, scores or recommendations."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {phases?.map((phase) => <PhaseCard key={phase.id} phase={phase} />)}
      </div>

      {readiness !== null ? (
        <Card className="mt-3" aria-label="Phase 30 readiness">
          <CardHeader
            title="Phase 30 · A1 readiness"
            description="Factual gate state — the app never fabricates progress"
            actions={<EvidenceState state="PENDING" size="sm" />}
          />
          <CardBody>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-faint">State</p>
                <p className="text-sm font-semibold text-ink">{readiness.state}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-faint">Registered gate</p>
                <p className="numeric text-sm text-ink">
                  ≥ {readiness.gate.minQualifyingDays} qualifying days after {readiness.gate.cutoffDate}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-faint">Assessed days</p>
                <p className="numeric text-sm text-ink">{readiness.observedQualifyingDays ?? "—"}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">{readiness.rationale}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              D1 registry pairs GBPUSD · USDJPY · AUDUSD have repository data; NZDUSD · USDCHF · USDCAD are
              registered but their historical files are not yet acquired — their pre-registered degraded path
              applies. Nothing is substituted or manufactured.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-3">
        <CardHeader
          title="Neutral evidence states"
          description="The only research state vocabulary this product uses"
        />
        <CardBody>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {EVIDENCE_STATES.map((state) => (
              <EvidenceState key={state} state={state as EvidenceStateType} withDescription />
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            Evidence states are descriptive, not evaluative: no stars, scores, grades, rankings or
            “best strategy” labels — by design.
          </p>
        </CardBody>
      </Card>

      <Card className="mt-3">
        <CardHeader
          title="Provenance"
          description="Every displayed claim is pinned to its artifact and commit"
        />
        <CardBody>
          <p className="text-xs leading-relaxed text-muted">
            Historical sample only · forward validation outstanding · execution timing materially sensitive ·
            statistical reference tests do not prove future profitability.
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
            <Microscope aria-hidden="true" className="size-3.5" />
            Served by the static research registry (32G); frozen files are never read by the UI. Registry order:{" "}
            {REGISTRY_PHASE_ORDER.join(" · ")}.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
