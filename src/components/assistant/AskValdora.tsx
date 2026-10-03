import { Sparkles } from "lucide-react";
import { useState } from "react";

import { UnavailableState } from "@/components/feedback/Unavailable";
import { cn } from "@/lib/cn";

/**
 * VALDORA assistant presence — placeholder only (AI arrives in 32I).
 * Deliberately visually secondary to trading tools and evidence.
 */
export function AskValdora({
  variant = "button",
  className,
}: {
  variant?: "button" | "panel";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (variant === "panel") {
    return (
      <div className={cn("rounded-card border border-line bg-card", className)}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Sparkles aria-hidden="true" className="size-3.5 text-accent" />
          <span className="text-[13px] font-semibold uppercase tracking-wider text-ink-secondary">
            Ask Valdora
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-faint">Coming later</span>
        </div>
        <div className="p-4">
          <UnavailableState
            title="Assistant not connected yet"
            message="Valdora will explain analysis, signals, risk and research — after the deterministic systems are in place."
            compact
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface px-4",
          "text-xs font-medium text-ink-secondary transition-colors hover:border-accent/50 hover:text-ink",
          className,
        )}
      >
        <Sparkles aria-hidden="true" className="size-3.5 text-accent" />
        Ask Valdora
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Ask Valdora"
          className="fixed inset-x-3 bottom-20 z-50 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96"
        >
          <div className="rounded-card border border-line bg-modal shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-secondary">
                <Sparkles aria-hidden="true" className="size-3.5 text-accent" />
                Ask Valdora
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-8 min-w-8 rounded-control text-muted hover:text-ink"
                aria-label="Close assistant panel"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <UnavailableState
                title="Assistant not connected yet"
                message="The assistant layer arrives in a later workstream (32I). Trading tools and evidence come first."
                compact
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
