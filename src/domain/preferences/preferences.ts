/**
 * User preference domain (32D).
 *
 * A minimal preference contract for future persistence. Carries only
 * in-memory, non-secret display/behavior preferences. No authentication,
 * no storage, no defaults invented from market data.
 *
 * Pure domain.
 */
import type { Instrument } from "@/domain/instruments/instrument";
import type { Timeframe } from "@/domain/market/timeframe";

/** Chart display preferences (visual only — never data-affecting). */
export interface ChartPreferences {
  /** Show/hide research-lineage annotations on charts. */
  readonly showEvidenceBadges: boolean;
  /** Preferred default visible bar count. */
  readonly defaultBarCount: number;
  /** Color-blind-safe palette preference. */
  readonly colorSafePalette: boolean;
}

/** Notification preferences (delivery itself is out of scope). */
export interface NotificationPreferences {
  readonly signalDetected: boolean;
  readonly riskLimitReached: boolean;
  readonly researchUpdate: boolean;
}

/** AI response preferences (provider choice/keys are infrastructure, never here). */
export interface AIResponsePreferences {
  /** Prefer concise over detailed explanations. */
  readonly concise: boolean;
  /** Always show citations under AI explanations. */
  readonly alwaysShowCitations: boolean;
}

/** Risk display preferences (not risk limits — those are the user's guardrails). */
export interface RiskDisplayPreferences {
  /** Show R-first instead of currency-first where both exist. */
  readonly rFirst: boolean;
  /** Show the calculation inputs alongside risk numbers. */
  readonly showCalculationInputs: boolean;
}

/** The aggregate preference record. */
export interface UserPreferences {
  readonly preferredInstrument?: Instrument["symbol"];
  readonly preferredTimeframe?: Timeframe;
  readonly chart: ChartPreferences;
  readonly notifications: NotificationPreferences;
  readonly ai: AIResponsePreferences;
  readonly riskDisplay: RiskDisplayPreferences;
}

/** The neutral default preference set (display-only defaults, no market assumptions). */
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  chart: { showEvidenceBadges: true, defaultBarCount: 120, colorSafePalette: false },
  notifications: { signalDetected: true, riskLimitReached: true, researchUpdate: false },
  ai: { concise: false, alwaysShowCitations: true },
  riskDisplay: { rFirst: true, showCalculationInputs: true },
};
