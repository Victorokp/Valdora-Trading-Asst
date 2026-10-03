import { cn } from "@/lib/cn";

/**
 * VALDORA brand mark: a geometric diamond frame enclosing a V chevron.
 * Pure geometry — no anime/character imagery. Monochrome-capable via
 * currentColor; the accent variant is opt-in.
 */
export function LogoMark({
  size = 24,
  monochrome = false,
  className,
}: {
  size?: number;
  monochrome?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={cn(monochrome && "text-current", className)}
    >
      <path
        d="M16 3.2 28.8 16 16 28.8 3.2 16 16 3.2Z"
        stroke={monochrome ? "currentColor" : "var(--color-accent)"}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M10.8 10.6 16 21.8 21.2 10.6"
        stroke={monochrome ? "currentColor" : "var(--color-ink)"}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Full lockup: mark + wordmark. `compact` hides the tagline. */
export function Logo({
  markSize = 24,
  compact = false,
  monochrome = false,
  className,
}: {
  markSize?: number;
  compact?: boolean;
  monochrome?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={markSize} monochrome={monochrome} />
      <span className="flex flex-col leading-none">
        <span
          className="text-[15px] font-bold tracking-[0.22em] text-ink"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          VALDORA
        </span>
        {!compact ? (
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.18em] text-faint">
            Trading Intelligence
          </span>
        ) : null}
      </span>
    </span>
  );
}
