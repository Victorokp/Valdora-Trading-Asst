import { useEffect, useState } from "react";
import { BookOpen, ClipboardList, NotebookPen, Tags } from "lucide-react";

import { EmptyState } from "@/components/feedback/Empty";
import { AnalysisPanel } from "@/components/market/AnalysisPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAppServices } from "@/services/app";
import { formatPrice, formatTimestamp } from "@/lib/formatters";
import type { ExecutedTrade, PlannedTrade } from "@/domain/trading/trade";
import type { JournalEntry } from "@/domain/trading/journalEntry";

/**
 * Journal (32M): user-owned records through the TradeJournalService —
 * planned trades (derived, never executed by the app), executed trades
 * (what the user reports) and journal entries (user-authored). Performance
 * stays empty until a real completed trade exists; it is never mixed with
 * research evidence.
 */
export default function JournalPage() {
  const { journal } = useAppServices();
  const [planned, setPlanned] = useState<readonly PlannedTrade[]>([]);
  const [executed, setExecuted] = useState<readonly ExecutedTrade[]>([]);
  const [entries, setEntries] = useState<readonly JournalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [p, e, j] = await Promise.all([
        journal.listPlannedTrades(),
        journal.listExecutedTrades(),
        journal.listJournalEntries(),
      ]);
      if (!cancelled) {
        if (p.status === "SUCCESS") setPlanned(p.value);
        if (e.status === "SUCCESS") setExecuted(e.value);
        if (j.status === "SUCCESS") setEntries(j.value);
        setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [journal]);

  async function discard(id: string) {
    await journal.discardPlannedTrade(id);
    const p = await journal.listPlannedTrades();
    if (p.status === "SUCCESS") setPlanned(p.value);
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Journal"
        title="Trade journal"
        description="Your trades, notes and reviews — private and kept strictly separate from research evidence."
        actions={<Badge variant="neutral">YOUR DATA</Badge>}
      />

      <Card className="mb-3">
        <CardHeader
          title="Planned trades"
          description="Derived from signals — the execution decision is always yours"
          actions={<Badge variant="outline">{planned.length}</Badge>}
        />
        <CardBody>
          {!loaded ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : planned.length === 0 ? (
            <EmptyState
              compact
              icon={ClipboardList}
              title="No planned trades"
              hint="A planned trade is kept when a signal confirms and you choose to record it. The app never places orders and never executes."
            />
          ) : (
            <ul className="divide-y divide-line">
              {planned.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="numeric text-sm font-semibold text-ink">{t.instrument}</span>
                      <Badge variant={t.direction === "LONG" ? "positive" : "negative"}>{t.direction}</Badge>
                      <span className="numeric text-xs text-muted">
                        entry {formatPrice(t.intendedEntry)} · stop {formatPrice(t.stopPrice)} · target {formatPrice(t.targetPrice)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">
                      planned {formatTimestamp(t.createdAt)} · from signal {t.signalId}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void discard(t.id)}>
                    Discard plan
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="mb-3">
        <CardHeader
          title="Executed trades"
          description="What you actually did — the only source of your performance"
          actions={<Badge variant="outline">{executed.length}</Badge>}
        />
        <CardBody>
          {executed.length === 0 ? (
            <EmptyState
              compact
              icon={BookOpen}
              title="No trades recorded yet"
              hint="Record executions yourself (entry, stop, exit). The app computes realized R only from what you report — it never invents a fill."
            />
          ) : (
            <ul className="divide-y divide-line">
              {executed.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="numeric text-sm font-semibold text-ink">{t.instrument}</span>
                  <Badge variant={t.direction === "LONG" ? "positive" : "negative"}>{t.direction}</Badge>
                  <span className="numeric text-xs text-muted">
                    entry {formatPrice(t.entry)}
                    {t.exit !== undefined ? ` · exit ${formatPrice(t.exit)}` : " · open"}
                    {t.realizedR !== undefined ? ` · ${t.realizedR > 0 ? "+" : ""}${t.realizedR.toFixed(2)}R` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <AnalysisPanel title="Notes & reviews" description="Journal entries you write" className="mb-3 lg:mb-0">
          {entries.length === 0 ? (
            <EmptyState compact icon={NotebookPen} title="No notes yet" hint="Reviews, lessons and notes live here — always authored by you, never generated." />
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="rounded-control border border-line bg-surface/40 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{e.kind}</Badge>
                    <span className="text-sm font-medium text-ink">{e.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{e.body}</p>
                </li>
              ))}
            </ul>
          )}
        </AnalysisPanel>

        <AnalysisPanel title="Tags & review" description="Organize and review your trades" className="mb-3 lg:mb-0">
          <EmptyState compact icon={Tags} title="Nothing tagged yet" hint="Tag trades and review them later — review first, verdict never." />
        </AnalysisPanel>
      </div>

      <div className="mt-3">
        <Card aria-label="Your performance">
          <CardHeader title="Your performance" description="Computed only from your closed trades" />
          <CardBody>
            {executed.some((t) => t.exitAt !== undefined) ? (
              <p className="text-xs text-muted">
                Performance aggregates appear as soon as a closed trade exists — computed from your journal only, on a separate surface from research evidence.
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted">
                No executed trades yet. Performance will appear after your first completed trade.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
