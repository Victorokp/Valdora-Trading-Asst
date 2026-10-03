/**
 * StaticResearchService (32G).
 *
 * Implements the ResearchService contract from the curated, hash-pinned
 * registry. This is the ONLY research reader the app has; it resolves
 * evidence states, references, descriptions, metrics and the Phase-30
 * readiness mirror. It performs no I/O against frozen files at runtime —
 * the registry is curated code, reviewed like any research-facing change.
 *
 * Unknown phase ids return NOT_FOUND (never a fabricated "unknown phase"
 * with invented fields).
 */
import { serviceFailure, serviceSuccess, type ServiceResult } from "@/domain/errors";
import type { EvidenceAssessment, ResearchPhaseSummary, ResearchRef } from "@/domain/research/evidence";
import type { Phase30Readiness } from "@/domain/research/phase30";
import { PHASE30_CURRENT_READINESS } from "@/domain/research/phase30";
import type {
  ResearchMetric,
  ResearchPhaseDescription,
  ResearchService,
} from "@/services/index";
import { REGISTRY_PHASE_ORDER, RESEARCH_REGISTRY, type RegistryPhase } from "@/services/research/registry";

function getPhase(phaseId: string): RegistryPhase | undefined {
  return RESEARCH_REGISTRY[phaseId];
}

export class StaticResearchService implements ResearchService {
  async listPhases(): Promise<ServiceResult<readonly ResearchPhaseSummary[]>> {
    const summaries = REGISTRY_PHASE_ORDER.map((id) => RESEARCH_REGISTRY[id].summary);
    return serviceSuccess(summaries);
  }

  async getPhase(phaseId: string): Promise<ServiceResult<ResearchPhaseSummary>> {
    const phase = getPhase(phaseId);
    if (!phase) return serviceFailure<ResearchPhaseSummary>("NOT_FOUND", `unknown research phase: ${phaseId}`);
    return serviceSuccess(phase.summary);
  }

  async getPhaseEvidence(phaseId: string): Promise<ServiceResult<readonly EvidenceAssessment[]>> {
    const phase = getPhase(phaseId);
    if (!phase) return serviceFailure<readonly EvidenceAssessment[]>("NOT_FOUND", `unknown research phase: ${phaseId}`);
    const assessments: EvidenceAssessment[] = phase.description.refs.map((ref) => ({
      state: ref.evidenceState,
      summary: `${ref.artifact} @ ${ref.commit ?? "pinned"}`,
    }));
    return serviceSuccess(assessments);
  }

  async getResearchRefs(phaseId: string): Promise<ServiceResult<readonly ResearchRef[]>> {
    const phase = getPhase(phaseId);
    if (!phase) return serviceFailure<readonly ResearchRef[]>("NOT_FOUND", `unknown research phase: ${phaseId}`);
    return serviceSuccess(phase.description.refs);
  }

  async getPhaseMetrics(phaseId: string): Promise<ServiceResult<readonly ResearchMetric[]>> {
    const phase = getPhase(phaseId);
    if (!phase) return serviceFailure<readonly ResearchMetric[]>("NOT_FOUND", `unknown research phase: ${phaseId}`);
    return serviceSuccess(phase.metrics);
  }

  async getPhaseDescription(phaseId: string): Promise<ServiceResult<ResearchPhaseDescription>> {
    const phase = getPhase(phaseId);
    if (!phase) return serviceFailure<ResearchPhaseDescription>("NOT_FOUND", `unknown research phase: ${phaseId}`);
    return serviceSuccess(phase.description);
  }

  async getPhase30Readiness(): Promise<ServiceResult<Phase30Readiness>> {
    return serviceSuccess(PHASE30_CURRENT_READINESS);
  }
}

/** Shared instance for composition roots (pages get it via imports; no DI framework). */
export const researchService: ResearchService = new StaticResearchService();
