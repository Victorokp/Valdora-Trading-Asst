import { useEffect, useState } from "react";
import { Bell, Database, Shield, UserRound } from "lucide-react";

import { AnalysisPanel } from "@/components/market/AnalysisPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { UnavailableState } from "@/components/feedback/Unavailable";
import { useAppServices } from "@/services/app";
import type { RiskGuardrails } from "@/domain/risk/risk";

/** Numeric limit input; empty = unset (never coerced to a default). */
function LimitInput({
  label,
  hint,
  value,
  onChange,
  step = "0.01",
}: {
  label: string;
  hint: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        placeholder="not set"
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="numeric mt-1 min-h-11 w-full rounded-control border border-line-strong bg-input px-3 py-2 text-sm text-ink"
      />
      <span className="mt-1 block text-[10px] leading-relaxed text-faint">{hint}</span>
    </label>
  );
}

/**
 * Settings (32Q): guardrail limits and notification preferences persisted
 * through the app services. No auth exists — the account section says so
 * honestly. Data boundaries are restated: research evidence stays frozen,
 * user data stays local.
 */
export default function SettingsPage() {
  const { loadGuardrailPreferences, saveGuardrailPreferences, notifications } = useAppServices();
  const [guardrails, setGuardrails] = useState<RiskGuardrails>({});
  const [minRewardRisk, setMinRewardRisk] = useState<number | undefined>(undefined);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const prefs = await loadGuardrailPreferences();
      if (!cancelled) {
        setGuardrails(prefs.guardrails);
        setMinRewardRisk(prefs.minRewardRisk);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadGuardrailPreferences]);

  async function save() {
    const result = await saveGuardrailPreferences({ guardrails, minRewardRisk });
    if (result.status === "SUCCESS") {
      setSaved("Guardrails saved — the risk engine applies them to every candidate evaluation.");
      // Record an in-app notification so the center demonstrates a real record.
      await notifications.create({
        type: "RISK_LIMIT_REACHED",
        severity: "INFO",
        title: "Risk guardrails updated",
        message: "Your guardrail limits were saved. The risk engine evaluates candidates against them.",
        relatedEntity: { kind: "RISK", id: "guardrails" },
      });
      window.setTimeout(() => setSaved(null), 5000);
    }
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Risk guardrails, notification preferences and data boundaries. Nothing external is connected."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="mb-3 lg:mb-0" aria-label="Risk guardrails">
          <CardHeader
            title="Risk guardrails"
            description="Neutral limits the risk engine checks on every candidate"
            actions={<Badge variant="outline"><Shield aria-hidden="true" className="mr-1 size-3" />Risk</Badge>}
          />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <LimitInput
                label="Max risk / trade"
                hint="Fraction of equity (0.01 = 1%). Left unset → check stays UNKNOWN."
                value={guardrails.maxRiskPerTrade}
                onChange={(v) => setGuardrails((g) => ({ ...g, maxRiskPerTrade: v }))}
              />
              <LimitInput
                label="Max open exposure (R)"
                hint="Sum of open risk in R you consider the ceiling."
                value={guardrails.maxOpenExposureR}
                onChange={(v) => setGuardrails((g) => ({ ...g, maxOpenExposureR: v }))}
                step="0.5"
              />
              <LimitInput
                label="Max daily loss (R)"
                hint="Negative number, e.g. -3."
                value={guardrails.maxDailyLossR}
                onChange={(v) => setGuardrails((g) => ({ ...g, maxDailyLossR: v }))}
                step="0.5"
              />
              <LimitInput
                label="Max concurrent trades"
                hint="Whole number of simultaneously open trades."
                value={guardrails.maxConcurrentTrades}
                onChange={(v) => setGuardrails((g) => ({ ...g, maxConcurrentTrades: v }))}
                step="1"
              />
              <LimitInput
                label="Drawdown alert (R)"
                hint="Negative threshold that raises a WARNING, e.g. -6."
                value={guardrails.maxDrawdownAlertR}
                onChange={(v) => setGuardrails((g) => ({ ...g, maxDrawdownAlertR: v }))}
                step="0.5"
              />
              <LimitInput
                label="Minimum R:R"
                hint="Candidates below this ratio are BLOCKED with an explanation."
                value={minRewardRisk}
                onChange={setMinRewardRisk}
                step="0.1"
              />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button variant="primary" onClick={() => void save()}>
                Save guardrails
              </Button>
              {saved ? <span className="text-xs text-positive">{saved}</span> : null}
            </div>
          </CardBody>
        </Card>

        <AnalysisPanel
          title="Notification preferences"
          description="Which in-app records are created (no external delivery)"
          actions={<Badge variant="outline"><Bell aria-hidden="true" className="mr-1 size-3" />In-app only</Badge>}
          className="mb-3 lg:mb-0"
        >
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
            <li>· Signal detected / invalidated — recorded when the strategy engine changes a setup state.</li>
            <li>· Risk limit reached — recorded when a guardrail check returns BLOCKED or WARNING.</li>
            <li>· Research update — recorded when the frozen research registry advances (reviewed change only).</li>
          </ul>
          <p className="mt-3 text-[10px] uppercase tracking-wider text-faint">
            No email, push or webhook exists. Nothing leaves this device.
          </p>
        </AnalysisPanel>

        <AnalysisPanel title="Account" description="Profile and sign-in" actions={<Badge variant="outline">No auth yet</Badge>}>
          <UnavailableState
            compact
            icon={UserRound}
            title="No accounts in this build"
            message="There is deliberately no authentication yet. Your records are stamped with a local owner id — never a fabricated login."
          />
        </AnalysisPanel>

        <AnalysisPanel title="AI assistant" description="Explanation layer (provider not configured)">
          <UnavailableState
            compact
            title="AI layer not connected"
            message="When connected, the assistant receives only provenance-tagged structured context (FACT/DERIVED/RESEARCH/USER_DATA/UNAVAILABLE) and is never the source of truth."
          />
        </AnalysisPanel>
      </div>

      <Card className="mt-3">
        <CardHeader title="Data & privacy" description="Ownership boundaries" actions={<Badge variant="outline"><Database aria-hidden="true" className="mr-1 size-3" />Local</Badge>} />
        <CardBody>
          <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted">
            <li>Your journal, notes, preferences and guardrails are user-owned records stored locally in this build.</li>
            <li>Research evidence is frozen repository data — read-only through the research service, hash-pinned, never user-editable.</li>
            <li>No data is collected, transmitted or synced anywhere in this build.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
