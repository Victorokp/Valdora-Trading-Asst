import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Error state: what happened, whether retry is possible, what the user can
 * do next. Structured-code detail arrives with the service layer.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  guidance,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title?: string;
  message?: string;
  guidance?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-control border border-negative/30 bg-negative/[0.06] px-5 py-6 text-center",
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className="mx-auto size-6 text-negative" />
      <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
      {message ? (
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">{message}</p>
      ) : null}
      {guidance ? (
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">{guidance}</p>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
