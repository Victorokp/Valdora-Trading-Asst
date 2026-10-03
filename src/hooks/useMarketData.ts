/**
 * Market-data + analysis loader hook (32S).
 *
 * One deterministic data path for Markets/Analysis/Dashboard surfaces: bars
 * flow MarketDataService → quality gate → analysis engine. The hook exposes
 * the canonical UI states; it never derives values and never refetch-loops.
 */
import { useEffect, useState } from 'react';

import type { MarketBar } from '@/domain/market/bar';
import type { MarketSnapshot } from '@/domain/market/snapshot';
import type { DataSourceMetadata } from '@/services/index';
import type { AnalysisResult } from '@/domain/analysis/engine';
import type { Timeframe } from '@/domain/market/timeframe';
import { useAppServices } from '@/services/app';

export type LoadState<T> =
  | { readonly state: 'LOADING' }
  | { readonly state: 'SUCCESS'; readonly value: T }
  | { readonly state: 'EMPTY' }
  | { readonly state: 'ERROR'; readonly message: string; readonly code: string }
  | { readonly state: 'UNAVAILABLE'; readonly message: string };

function toLoad<T>(
  result: { status: string; value?: T; error?: { message: string } },
  emptyWhen?: (v: T) => boolean,
): LoadState<T> {
  if (result.status === 'SUCCESS') {
    if (emptyWhen && result.value !== undefined && emptyWhen(result.value)) return { state: 'EMPTY' };
    return { state: 'SUCCESS', value: result.value as T };
  }
  if (result.status === 'NOT_CONFIGURED' || result.status === 'UNAVAILABLE' || result.status === 'RATE_LIMITED') {
    // Stale cache is reported by the service as UNAVAILABLE with the
    // staleness reason in the message; it lands here, never as fresh data.
    return { state: 'UNAVAILABLE', message: result.error?.message ?? 'not available' };
  }
  return { state: 'ERROR', message: result.error?.message ?? 'request failed', code: result.status };
}

export interface InstrumentDataBundle {
  readonly dataSource: LoadState<DataSourceMetadata>;
  readonly bars: LoadState<readonly MarketBar[]>;
  readonly snapshot: LoadState<MarketSnapshot>;
  readonly analysis: LoadState<AnalysisResult>;
}

const BAR_RANGE = '1y';

export function useInstrumentData(instrument: string, timeframe: Timeframe): InstrumentDataBundle {
  const { marketData, analysis } = useAppServices();
  const [dataSource, setDataSource] = useState<LoadState<DataSourceMetadata>>({ state: 'LOADING' });
  const [bars, setBars] = useState<LoadState<readonly MarketBar[]>>({ state: 'LOADING' });
  const [snapshot, setSnapshot] = useState<LoadState<MarketSnapshot>>({ state: 'LOADING' });
  const [analysisState, setAnalysisState] = useState<LoadState<AnalysisResult>>({ state: 'LOADING' });

  useEffect(() => {
    let cancelled = false;
    setBars({ state: 'LOADING' });
    setSnapshot({ state: 'LOADING' });
    setAnalysisState({ state: 'LOADING' });

    async function load() {
      const status = await marketData.getDataSourceStatus();
      if (!cancelled) setDataSource(toLoad(status));

      const barsResult = await marketData.getHistoricalBars(instrument, timeframe, BAR_RANGE);
      if (!cancelled) {
        setBars(toLoad(barsResult, (b) => b.length === 0));
        // Re-read the data-source status AFTER the fetch so the badge reflects
        // the outcome that actually served this data (primary / fallback /
        // cached) instead of the pre-request state.
        const statusAfter = await marketData.getDataSourceStatus();
        if (!cancelled) setDataSource(toLoad(statusAfter));
        const analysisResult = await analysis.analyze({ instrument, timeframe });
        if (!cancelled) setAnalysisState(toLoad(analysisResult));
      }

      const snap = await marketData.getLatestSnapshot(instrument);
      if (!cancelled) setSnapshot(toLoad(snap));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [marketData, analysis, instrument, timeframe]);

  return { dataSource, bars, snapshot, analysis: analysisState };
}
