/**
 * Instrument domain model (32D).
 *
 * A catalog-free representation of tradable instruments. Pip size is a
 * **declared constant per symbol** — never inferred from observed price
 * precision (G4 / Phase-29 mapping). Pairs outside the registered catalog are
 * representable through `declaredPipSize`, but the domain never silently
 * invents an instrument: the catalog layer (application, not here) decides
 * what is supported.
 *
 * Pure domain: no I/O, no provider calls.
 */

export const ASSET_CLASSES = ["FX_MAJOR", "FX_CROSS", "CRYPTO", "EQUITY", "OTHER"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export type CurrencyCode = string;

/** Pips for every registered FX pair (frozen mapping — never price-precision-derived). */
export const REGISTERED_PIP_SIZES = {
  EURUSD: 0.0001,
  GBPUSD: 0.0001,
  USDJPY: 0.01,
  AUDUSD: 0.0001,
  NZDUSD: 0.0001,
  USDCHF: 0.0001,
  USDCAD: 0.0001,
} as const satisfies Record<string, number>;

export type RegisteredFxSymbol = keyof typeof REGISTERED_PIP_SIZES;
export const REGISTERED_FX_SYMBOLS = Object.keys(REGISTERED_PIP_SIZES) as RegisteredFxSymbol[];

export interface Instrument {
  /** Canonical symbol, e.g. "EURUSD". */
  readonly symbol: string;
  /** Human-facing name, e.g. "Euro / US Dollar". */
  readonly displayName: string;
  readonly baseCurrency: CurrencyCode;
  readonly quoteCurrency: CurrencyCode;
  readonly assetClass: AssetClass;
  /**
   * Declared pip size. Present only when the project has pinned it explicitly;
   * absent means "no registered pip size" — callers must treat the instrument
   * as pip-less rather than guessing.
   */
  readonly pipSize?: number;
  /** Optional note, e.g. research lineage. */
  readonly note?: string;
}

export type PipLookupFailure = "SYMBOL_UNKNOWN" | "NO_DECLARED_PIP_SIZE";

/**
 * Look up the registered pip size for a symbol.
 * Deterministic: unknown symbol ⇒ failure; known symbol ⇒ the frozen constant.
 * Never derives a pip size from price precision.
 */
export function registeredPipSize(symbol: string): { ok: true; pipSize: number } | { ok: false; reason: PipLookupFailure } {
  const key = symbol as RegisteredFxSymbol;
  if (!(key in REGISTERED_PIP_SIZES)) return { ok: false, reason: "SYMBOL_UNKNOWN" };
  return { ok: true, pipSize: REGISTERED_PIP_SIZES[key] };
}

/** Build an Instrument for a registered FX pair (fails rather than inventing fields). */
export function registeredFxInstrument(symbol: RegisteredFxSymbol): Instrument {
  const pip = REGISTERED_PIP_SIZES[symbol];
  return {
    symbol,
    displayName: symbol,
    baseCurrency: symbol.slice(0, 3),
    quoteCurrency: symbol.slice(3, 6),
    assetClass: "FX_MAJOR",
    pipSize: pip,
  };
}

/** Check whether an instrument record is internally consistent (symbol/currencies, pip size if present). */
export function validateInstrument(instrument: Instrument): readonly string[] {
  const problems: string[] = [];
  if (instrument.symbol.length < 6) problems.push("symbol must have at least 6 characters");
  if (instrument.baseCurrency.length !== 3) problems.push("baseCurrency must be a 3-letter code");
  if (instrument.quoteCurrency.length !== 3) problems.push("quoteCurrency must be a 3-letter code");
  if (instrument.baseCurrency === instrument.quoteCurrency) problems.push("base and quote currencies must differ");
  if (instrument.pipSize !== undefined && !(instrument.pipSize > 0)) problems.push("pipSize must be positive when declared");
  if (instrument.pipSize !== undefined && registeredPipSize(instrument.symbol).ok) {
    const registered = REGISTERED_PIP_SIZES[instrument.symbol as RegisteredFxSymbol];
    if (instrument.pipSize !== registered) problems.push("declared pipSize contradicts the registered mapping");
  }
  return problems;
}
