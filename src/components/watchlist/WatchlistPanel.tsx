/**
 * Watchlist panel (32P).
 *
 * The user's followed instruments, persisted through the watchlist
 * repository (USER_DATA, stamped). The list can reference only catalog
 * instruments and never fabricates market data for them — rows render the
 * catalog's factual availability labels.
 */
import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/feedback/Empty";
import { INSTRUMENT_CATALOG } from "@/services/market/catalog";
import { useAppServices } from "@/services/app";
import type { WatchlistEntry } from "@/domain/instruments/watchlist";

export function WatchlistPanel() {
  const { watchlistRepo, preferencesRepo } = useAppServices();
  const [entries, setEntries] = useState<readonly WatchlistEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [addToSymbol, setAddToSymbol] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await watchlistRepo.list();
      if (!cancelled && result.status === "SUCCESS") {
        setEntries([...result.value].sort((a, b) => a.addedAt.localeCompare(b.addedAt)));
        setLoaded(true);
      }
      // Persist the user's preferred instrument if not set yet (first selection).
      const prefs = await preferencesRepo.load();
      if (!cancelled && prefs.status === "SUCCESS" && prefs.value === null) {
        await preferencesRepo.save(
          {
            preferredInstrument: "EURUSD",
            preferredTimeframe: "DAILY",
            chart: { showEvidenceBadges: true, defaultBarCount: 120, colorSafePalette: false },
            notifications: { signalDetected: true, riskLimitReached: true, researchUpdate: false },
            ai: { concise: false, alwaysShowCitations: true },
            riskDisplay: { rFirst: true, showCalculationInputs: true },
          },
          { ownership: "USER_DATA", ownerId: "local-user", persistedAt: new Date().toISOString() },
        );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [watchlistRepo, preferencesRepo]);

  async function add(symbol: string) {
    if (symbol === "" || entries.some((e) => e.symbol === symbol)) return;
    const entry: WatchlistEntry = { symbol, addedAt: new Date().toISOString() };
    const put = await watchlistRepo.put(entry, { ownership: "USER_DATA", ownerId: "local-user", persistedAt: entry.addedAt });
    if (put.status === "SUCCESS") {
      setEntries((prev) => [...prev, entry].sort((a, b) => a.addedAt.localeCompare(b.addedAt)));
      setAddToSymbol("");
    }
  }

  async function remove(symbol: string) {
    const result = await watchlistRepo.remove(symbol);
    if (result.status === "SUCCESS") setEntries((prev) => prev.filter((e) => e.symbol !== symbol));
  }

  const candidates = INSTRUMENT_CATALOG.filter((i) => !entries.some((e) => e.symbol === i.symbol));

  return (
    <Card aria-label="Watchlist">
      <CardHeader
        title="Watchlist"
        description="Pairs you follow — your list, stored locally"
        actions={<Badge variant="outline">{entries.length}</Badge>}
      />
      <CardBody>
        {!loaded ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <EmptyState
            compact
            icon={Star}
            title="No pairs followed yet"
            hint="Add pairs from the catalog below. Availability labels stay factual — pairs without acquired data say so."
          />
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((entry) => {
              const catalog = INSTRUMENT_CATALOG.find((i) => i.symbol === entry.symbol);
              return (
                <li key={entry.symbol} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="numeric text-sm font-semibold text-ink">{entry.symbol}</span>
                      {catalog?.role === "PRIMARY" ? <Badge variant="positive">Research-backed</Badge> : null}
                      {catalog?.dataAvailability === "DATA_NOT_ACQUIRED" ? (
                        <Badge variant="outline">Data not acquired</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">{catalog?.displayName ?? entry.symbol}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void remove(entry.symbol)} aria-label={`Remove ${entry.symbol} from watchlist`}>
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <label className="inline-flex items-center gap-2 text-xs text-muted">
            <span className="sr-only">Add instrument</span>
            <select
              className="min-h-9 rounded-control border border-line-strong bg-input px-2 py-1.5 text-xs text-ink"
              value={addToSymbol}
              onChange={(e) => setAddToSymbol(e.target.value)}
            >
              <option value="">Add a pair…</option>
              {candidates.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.symbol}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" size="sm" disabled={addToSymbol === ""} onClick={() => void add(addToSymbol)}>
            <Plus aria-hidden="true" className="size-3.5" />
            Add
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
