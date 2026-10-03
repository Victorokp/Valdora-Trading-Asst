import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import type { LoadState } from "@/hooks/useMarketData";
import type { DataSourceMetadata } from "@/services/index";

/**
 * Data-source status badge (32T Phase 11).
 *
 * Renders exactly one of the honest market-data states:
 *
 *   Live                     — verified provider, primary source, fresh
 *   Live — <provider>        — provenance-stamped live feed
 *   Live — <provider> fallback — live data from a fallback provider
 *   Degraded                 — status could not be confirmed / partially failing
 *   Using cached market data — served from the snapshot cache (NEVER "live")
 *   Market data unavailable  — unconfigured, unreachable or expired
 *
 * The badge never exposes credentials or provider implementation detail, and
 * it never labels cached or failed states as live.
 */
export function describeDataSource(state: LoadState<DataSourceMetadata>): {
  readonly label: string;
  readonly variant: BadgeVariant;
} {
  switch (state.state) {
    case "LOADING":
      return { label: "Checking data source…", variant: "outline" };
    case "EMPTY":
    case "UNAVAILABLE":
      return { label: "Market data unavailable", variant: "outline" };
    case "ERROR":
      return { label: "Degraded", variant: "caution" };
    case "SUCCESS": {
      const meta = state.value;
      if (meta.note === "Using cached market data") {
        return { label: "Using cached market data", variant: "caution" };
      }
      if (meta.status === "NOT_CONFIGURED") {
        return { label: "Market data unavailable", variant: "outline" };
      }
      if (meta.status === "DEGRADED") {
        // Notes carry the precise fallback wording (e.g. "Live — Massive fallback").
        return { label: meta.note ?? "Degraded", variant: "caution" };
      }
      if (meta.mode === "LIVE" && meta.sourceLabel !== undefined) {
        return { label: `Live — ${meta.sourceLabel}`, variant: "positive" };
      }
      if (meta.mode === "LIVE") {
        return { label: "Live", variant: "positive" };
      }
      // HISTORICAL/UNKNOWN sources are labeled by their actual identity.
      return { label: meta.sourceLabel ?? meta.mode, variant: "outline" };
    }
  }
}

export function DataStatusBadge({
  dataSource,
  className,
}: {
  dataSource: LoadState<DataSourceMetadata>;
  className?: string;
}) {
  const { label, variant } = describeDataSource(dataSource);
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
