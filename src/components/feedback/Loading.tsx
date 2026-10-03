import { Skeleton, SkeletonCardGrid } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

/** Skeleton lines for a panel body — never placeholder content. */
export function PanelSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-1/3" : "w-full")} />
      ))}
    </div>
  );
}

/** Full-page loading skeleton. */
export function PageLoading() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading page">
      <Skeleton className="h-7 w-48" />
      <SkeletonCardGrid count={4} />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
