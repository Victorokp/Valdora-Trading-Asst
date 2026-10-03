import { cn } from "@/lib/cn";

/** Loading placeholder block — never fabricated content. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative overflow-hidden rounded-control bg-surface", className)}
    >
      <div className="absolute inset-0 animate-sweep bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}

/** Standard skeleton for a metric card grid. */
export function SkeletonCardGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-card border border-line bg-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-32" />
        </div>
      ))}
    </div>
  );
}
