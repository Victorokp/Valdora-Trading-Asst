/**
 * Instrument catalog (32F).
 *
 * Extends the 32C user-facing catalog with the instrument metadata the
 * market-data layer serves: currency composition, asset class, research
 * lineage labels, D1-registry availability, and per-source provenance.
 * Availability states are FACTUAL: the three D1-external pairs have no data
 * in the repository yet and are labeled exactly that — nothing is fabricated.
 */
import { REGISTERED_PIP_SIZES, type Instrument } from "@/domain/instruments/instrument";
import { asId } from "@/domain/ids";
import type { Provenance } from "@/domain/provenance/provenance";

/** Factual data-availability for a pair in this repository, today. */
export type PairDataAvailability =
  | "HISTORICAL_DATA_PRESENT"
  | "DATA_NOT_ACQUIRED";

export interface InstrumentCatalogEntry extends Instrument {
  /** Product role of the pair. */
  readonly role: "PRIMARY" | "SECONDARY";
  /** Factual research-lineage label (never a quality score). */
  readonly researchLineage: "PHASE21_31_EVIDENCE" | "D1_REGISTRY_NO_EVIDENCE_YET";
  /** Factual availability of historical daily data in the repository. */
  readonly dataAvailability: PairDataAvailability;
  /** Per-source provenance notes, only where data actually exists. */
  readonly dataProvenance?: Readonly<Record<string, Provenance>>;
}

const EURUSD_DATASET_HASH = "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52";

const DATASET_PROVENANCE: Readonly<Record<string, Provenance>> = {
  EURUSD: {
    sourceType: "RESEARCH_ARTIFACT",
    sourceName: "primary EURUSD daily dataset (frozen research)",
    sourceId: asId<"ProvenanceId">(EURUSD_DATASET_HASH),
    coverageStart: "1971-01-04",
    coverageEnd: "2026-09-25",
    hash: "e0676d9232c87be36aed5db2317b0c80f3838b5e9d517afb319f092aa8fd0d52",
    notes: "Frozen research dataset; Phase 21–31 evidence lineage. Read-only.",
  },
  GBPUSD: {
    sourceType: "RESEARCH_ARTIFACT",
    sourceName: "gbpusd_d.csv",
    sourceId: asId<"ProvenanceId">("e8f7c79d (per completeness audit §10; hash re-verified at D1 execution)"),
    coverageStart: "2003-12-01",
    coverageEnd: "2026-09-24",
    notes: "D1 registry pair with repository data; hash registration occurs at D1 execution.",
  },
  USDJPY: {
    sourceType: "RESEARCH_ARTIFACT",
    sourceName: "usdjpy_d.csv",
    sourceId: asId<"ProvenanceId">("03f49d95 (per completeness audit §10; hash re-verified at D1 execution)"),
    coverageStart: "2003-12-01",
    coverageEnd: "2026-09-24",
    notes: "D1 registry pair with repository data; hash registration occurs at D1 execution.",
  },
  AUDUSD: {
    sourceType: "RESEARCH_ARTIFACT",
    sourceName: "audusd_d.csv",
    sourceId: asId<"ProvenanceId">("f23247fd (per completeness audit §10; hash re-verified at D1 execution)"),
    coverageStart: "2003-12-01",
    coverageEnd: "2026-09-24",
    notes: "D1 registry pair with repository data; hash registration occurs at D1 execution.",
  },
};

export const INSTRUMENT_CATALOG: readonly InstrumentCatalogEntry[] = [
  {
    symbol: "EURUSD",
    displayName: "Euro / US Dollar",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    assetClass: "FX_MAJOR",
    pipSize: REGISTERED_PIP_SIZES.EURUSD,
    role: "PRIMARY",
    researchLineage: "PHASE21_31_EVIDENCE",
    dataAvailability: "HISTORICAL_DATA_PRESENT",
    dataProvenance: DATASET_PROVENANCE,
  },
  {
    symbol: "GBPUSD",
    displayName: "British Pound / US Dollar",
    baseCurrency: "GBP",
    quoteCurrency: "USD",
    assetClass: "FX_MAJOR",
    pipSize: REGISTERED_PIP_SIZES.GBPUSD,
    role: "SECONDARY",
    researchLineage: "D1_REGISTRY_NO_EVIDENCE_YET",
    dataAvailability: "HISTORICAL_DATA_PRESENT",
    dataProvenance: DATASET_PROVENANCE,
  },
  {
    symbol: "USDJPY",
    displayName: "US Dollar / Japanese Yen",
    baseCurrency: "USD",
    quoteCurrency: "JPY",
    assetClass: "FX_MAJOR",
    pipSize: REGISTERED_PIP_SIZES.USDJPY,
    role: "SECONDARY",
    researchLineage: "D1_REGISTRY_NO_EVIDENCE_YET",
    dataAvailability: "HISTORICAL_DATA_PRESENT",
    dataProvenance: DATASET_PROVENANCE,
  },
  {
    symbol: "AUDUSD",
    displayName: "Australian Dollar / US Dollar",
    baseCurrency: "AUD",
    quoteCurrency: "USD",
    assetClass: "FX_MAJOR",
    pipSize: REGISTERED_PIP_SIZES.AUDUSD,
    role: "SECONDARY",
    researchLineage: "D1_REGISTRY_NO_EVIDENCE_YET",
    dataAvailability: "HISTORICAL_DATA_PRESENT",
    dataProvenance: DATASET_PROVENANCE,
  },
  {
    symbol: "NZDUSD",
    displayName: "New Zealand Dollar / US Dollar",
    baseCurrency: "NZD",
    quoteCurrency: "USD",
    assetClass: "FX_MAJOR",
    pipSize: REGISTERED_PIP_SIZES.NZDUSD,
    role: "SECONDARY",
    researchLineage: "D1_REGISTRY_NO_EVIDENCE_YET",
    dataAvailability: "DATA_NOT_ACQUIRED",
    note: "Phase 30 D1 registry pair. Historical file must be externally acquired and registered before any D1 execution; not present in this repository.",
  },
  {
    symbol: "USDCHF",
    displayName: "US Dollar / Swiss Franc",
    baseCurrency: "USD",
    quoteCurrency: "CHF",
    assetClass: "FX_MAJOR",
    pipSize: REGISTERED_PIP_SIZES.USDCHF,
    role: "SECONDARY",
    researchLineage: "D1_REGISTRY_NO_EVIDENCE_YET",
    dataAvailability: "DATA_NOT_ACQUIRED",
    note: "Phase 30 D1 registry pair. Historical file must be externally acquired and registered before any D1 execution; not present in this repository.",
  },
  {
    symbol: "USDCAD",
    displayName: "US Dollar / Canadian Dollar",
    baseCurrency: "USD",
    quoteCurrency: "CAD",
    assetClass: "FX_MAJOR",
    pipSize: REGISTERED_PIP_SIZES.USDCAD,
    role: "SECONDARY",
    researchLineage: "D1_REGISTRY_NO_EVIDENCE_YET",
    dataAvailability: "DATA_NOT_ACQUIRED",
    note: "Phase 30 D1 registry pair. Historical file must be externally acquired and registered before any D1 execution; not present in this repository.",
  },
];

export function getCatalogEntry(symbol: string): InstrumentCatalogEntry | undefined {
  return INSTRUMENT_CATALOG.find((entry) => entry.symbol === symbol);
}
