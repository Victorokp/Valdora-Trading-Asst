/**
 * Lightweight SVG candlestick chart (32S).
 *
 * A dependency-free chart abstraction: candles are drawn from already-
 * normalized MarketBar records — never from a second, divergent data source
 * (Part 2 §23). The chart renders exactly what the market-data service
 * returned and stays silent (empty state) when there is nothing to draw.
 * No axis labels imply live data; the caller supplies the provenance label.
 */
import type { MarketBar } from "@/domain/market/bar";

export interface CandleChartProps {
  readonly bars: readonly MarketBar[];
  /** Human-readable data caption, e.g. "fixture data · 1D" — shown verbatim. */
  readonly caption?: string;
  readonly maxBars?: number;
}

interface Scale {
  readonly x: (i: number) => number;
  readonly y: (price: number) => number;
  readonly min: number;
  readonly max: number;
}

function scaleFor(bars: readonly MarketBar[], width: number, height: number, pad: number): Scale {
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;
  const usableH = height - pad * 2;
  const usableW = width - pad * 2;
  const step = bars.length > 0 ? usableW / bars.length : usableW;
  return {
    min,
    max,
    x: (i) => pad + step * (i + 0.5),
    y: (price) => pad + usableH - ((price - min) / span) * usableH,
  };
}

export function CandleChart({ bars, caption, maxBars = 90 }: CandleChartProps) {
  const visible = bars.slice(-maxBars);
  if (visible.length === 0) {
    return (
      <div className="flex aspect-[16/7] min-h-[160px] flex-col items-center justify-center gap-2 text-center">
        <p className="max-w-xs px-4 text-xs leading-relaxed text-muted">
          No bars to draw yet — the chart renders only data the quality-gated market-data service returned.
        </p>
      </div>
    );
  }

  const width = 640;
  const height = 280;
  const pad = 12;
  const { x, y } = scaleFor(visible, width, height, pad);
  const bodyWidth = Math.max(2, Math.min(10, (width - pad * 2) / visible.length - 2));

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Candlestick chart of ${visible.length} bars`}
        className="h-auto w-full"
      >
        {/* EMA-free price grid: min/max reference lines only */}
        <line x1={pad} x2={width - pad} y1={y(visible[0].close)} y2={y(visible[0].close)} stroke="currentColor" strokeDasharray="2 4" className="text-line" strokeWidth="1" />
        {visible.map((bar, i) => {
          const up = bar.close >= bar.open;
          const color = up ? "var(--color-positive, #16a34a)" : "var(--color-negative, #dc2626)";
          const top = y(Math.max(bar.open, bar.close));
          const bottom = y(Math.min(bar.open, bar.close));
          return (
            <g key={bar.timestamp} stroke={color} fill={up ? color : "transparent"}>
              <line x1={x(i)} x2={x(i)} y1={y(bar.high)} y2={y(bar.low)} strokeWidth="1" />
              <rect
                x={x(i) - bodyWidth / 2}
                y={top}
                width={bodyWidth}
                height={Math.max(1, bottom - top)}
                strokeWidth="1"
              />
            </g>
          );
        })}
      </svg>
      {caption ? (
        <p className="border-t border-line px-3 py-1.5 text-[10px] uppercase tracking-wider text-faint">{caption}</p>
      ) : null}
    </div>
  );
}
