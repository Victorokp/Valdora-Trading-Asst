import {
  Check,
  CircleDashed,
  CircleHelp,
  CircleMinus,
  Clock,
  Scale,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/Badge";
import type { EvidenceState as EvidenceStateType } from "@/domain/types";
import { cn } from "@/lib/cn";

interface EvidenceStateMeta {
  icon: LucideIcon;
  badgeVariant: BadgeVariant;
  description: string;
}

/**
 * Neutral evidence vocabulary (Part 2 §3). Descriptive states only — never
 * rendered as stars, scores, grades or recommendations. Icon + text carry the
 * meaning; color is never the sole channel. Reused later by the Research
 * Viewer (32H).
 */
export const EVIDENCE_STATE_META: Record<EvidenceStateType, EvidenceStateMeta> = {
  SUPPORTED: {
    icon: Check,
    badgeVariant: "positive",
    description: "Evidence supports the claim within its stated scope.",
  },
  MIXED: {
    icon: Scale,
    badgeVariant: "caution",
    description: "Evidence is partly supporting and partly contradicting.",
  },
  LIMITED: {
    icon: CircleMinus,
    badgeVariant: "outline",
    description: "Evidence is narrow in scope or depth.",
  },
  INCONCLUSIVE: {
    icon: CircleHelp,
    badgeVariant: "outline",
    description: "Evidence does not settle the question.",
  },
  PENDING: {
    icon: Clock,
    badgeVariant: "accent",
    description: "Registered and preregistered — results not yet produced.",
  },
  UNKNOWN: {
    icon: CircleDashed,
    badgeVariant: "outline",
    description: "Evidence state has not been assessed.",
  },
};

export function EvidenceState({
  state,
  summary,
  withDescription = false,
  size = "md",
  className,
}: {
  state: EvidenceStateType;
  /** Optional factual summary line shown under the badge. */
  summary?: string;
  /** Show the state's neutral description next to the badge. */
  withDescription?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = EVIDENCE_STATE_META[state];
  const Icon = meta.icon;
  return (
    <div className={cn("min-w-0", className)} data-evidence-state={state}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.badgeVariant} className={size === "sm" ? "text-[9px]" : undefined}>
          <Icon aria-hidden="true" className="size-3" />
          {state}
        </Badge>
        {withDescription ? <span className="text-xs text-muted">{meta.description}</span> : null}
      </div>
      {summary ? <p className="mt-1.5 text-xs leading-relaxed text-muted">{summary}</p> : null}
    </div>
  );
}
