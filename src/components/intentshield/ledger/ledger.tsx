"use client";

import * as React from "react";
import { Loader2, RotateCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  type TransactionDetailResponse,
  type TransactionListItem,
} from "@/lib/transactions/types";
import { DecisionBadge, MonoLabel, SectionHeading } from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";
import {
  TransactionStatusBadge,
  apiFetch,
  formatApiErrorText,
  formatUtcShort,
  isAbortError,
} from "@/components/intentshield/agent/shared";
import {
  SourceChip,
  paypalShort,
  useLedgerRefreshListener,
} from "@/components/intentshield/ledger/shared";
import { PirDialog } from "@/components/intentshield/ledger/pir-dialog";

type DecisionFilter = "ALL" | "ALLOW" | "REVIEW" | "BLOCK";
type SourceFilter = "ALL" | "AGENT" | "LAB";
type SortMode = "NEWEST" | "OLDEST" | "TOTAL";

const DECISION_FILTERS: DecisionFilter[] = ["ALL", "ALLOW", "REVIEW", "BLOCK"];
const SOURCE_FILTERS: SourceFilter[] = ["ALL", "AGENT", "LAB"];

function LedgerRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0">
      <Skeleton className="h-3.5 w-16 shrink-0" />
      <Skeleton className="h-3.5 w-12 shrink-0" />
      <Skeleton className="hidden h-3.5 w-24 sm:block" />
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-3.5 w-14 shrink-0" />
      <Skeleton className="hidden h-3.5 w-16 sm:block" />
      <Skeleton className="hidden h-3.5 w-20 md:block" />
      <Skeleton className="hidden h-3.5 w-14 lg:block" />
    </div>
  );
}

export function Ledger() {
  const [rows, setRows] = React.useState<TransactionListItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [decisionFilter, setDecisionFilter] =
    React.useState<DecisionFilter>("ALL");
  const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>("ALL");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortMode>("NEWEST");

  const [openingId, setOpeningId] = React.useState<string | null>(null);
  const [pir, setPir] = React.useState<{
    transaction: TransactionDetailResponse;
    open: boolean;
  } | null>(null);

  const alive = React.useRef(true);
  const listAbort = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      listAbort.current?.abort();
    };
  }, []);

  /** `silent` keeps the previous rows while refetching (spinner only). */
  const refresh = React.useCallback(async (silent: boolean) => {
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    setLoading(true);
    if (!silent) {
      setRows(null);
    }
    try {
      const data = await apiFetch<{ transactions: TransactionListItem[] }>(
        "/api/transactions",
        { signal: controller.signal }
      );
      if (alive.current && !controller.signal.aborted) {
        setRows(data.transactions);
        setLoadError(null);
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      if (alive.current) {
        setLoadError(
          formatApiErrorText(err, "Could not load the activity ledger.")
        );
        toast.error(formatApiErrorText(err, "Could not load the activity ledger."));
      }
    } finally {
      if (alive.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useLedgerRefreshListener(() => void refresh(true));

  const visible = React.useMemo(() => {
    if (rows === null) {
      return [];
    }
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (decisionFilter !== "ALL" && row.decision !== decisionFilter) {
        return false;
      }
      if (sourceFilter !== "ALL" && row.source !== sourceFilter) {
        return false;
      }
      if (needle) {
        const haystack = [
          row.merchant,
          row.paymentIntent?.reference ?? "",
          row.scenarioId ?? "",
          row.source,
          row.status,
          ...row.riskSignals,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    });
    const sorted = [...filtered];
    if (sort === "OLDEST") {
      sorted.reverse();
    } else if (sort === "TOTAL") {
      sorted.sort((a, b) => b.total - a.total);
    }
    return sorted;
  }, [rows, decisionFilter, sourceFilter, query, sort]);

  async function handleOpenRow(row: TransactionListItem) {
    if (openingId) {
      return;
    }
    setOpeningId(row.id);
    try {
      const detail = await apiFetch<TransactionDetailResponse>(
        `/api/transactions/${row.id}`
      );
      setPir({ transaction: detail, open: true });
    } catch (err) {
      toast.error(
        formatApiErrorText(err, "Could not open this Payment Intent Record.")
      );
    } finally {
      setOpeningId(null);
    }
  }

  const filtersActive =
    decisionFilter !== "ALL" ||
    sourceFilter !== "ALL" ||
    query.trim().length > 0;

  return (
    <section id="ledger" aria-labelledby="ledger-title" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading
            id="ledger-title"
            eyebrow="04 / ACTIVITY LEDGER"
            title="Every action, on the record."
            description="The append-only activity ledger — every proposal, decision, human review and PayPal leg, newest first. Click any row for its full Payment Intent Record."
          />
        </Reveal>

        <Reveal delay={60} className="mt-10">
          <Card className="gap-0 overflow-hidden rounded-md py-0 shadow-none">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 border-b px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={decisionFilter}
                  onValueChange={(value) =>
                    setDecisionFilter((value as DecisionFilter) || "ALL")
                  }
                  aria-label="Filter by decision"
                >
                  {DECISION_FILTERS.map((filter) => (
                    <ToggleGroupItem
                      key={filter}
                      value={filter}
                      aria-label={`Decision ${filter}`}
                      className="min-h-9 px-3 font-data text-[10px] uppercase tracking-[0.12em]"
                    >
                      {filter}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={sourceFilter}
                  onValueChange={(value) =>
                    setSourceFilter((value as SourceFilter) || "ALL")
                  }
                  aria-label="Filter by source"
                >
                  {SOURCE_FILTERS.map((filter) => (
                    <ToggleGroupItem
                      key={filter}
                      value={filter}
                      aria-label={`Source ${filter}`}
                      className="min-h-9 px-3 font-data text-[10px] uppercase tracking-[0.12em]"
                    >
                      {filter}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative min-w-0 flex-1 lg:w-60 lg:flex-none">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search merchant, reference…"
                    aria-label="Search the ledger"
                    className="h-9 pl-9 text-[13px]"
                  />
                </div>
                <Select value={sort} onValueChange={(value) => setSort(value as SortMode)}>
                  <SelectTrigger
                    aria-label="Sort ledger"
                    className="hidden h-9 w-40 shrink-0 sm:flex"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEWEST">Newest first</SelectItem>
                    <SelectItem value="OLDEST">Oldest first</SelectItem>
                    <SelectItem value="TOTAL">Highest total</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Refresh the activity ledger"
                  onClick={() => void refresh(true)}
                  disabled={loading && rows === null}
                >
                  <RotateCw
                    aria-hidden="true"
                    className={cn("size-4", loading && "animate-spin")}
                  />
                </Button>
              </div>
            </div>

            {/* Table */}
            <div
              className="rules-scroll max-h-[560px] overflow-y-auto overflow-x-hidden"
              aria-label="Activity ledger"
            >
              {loadError && rows === null ? (
                <div className="p-4">
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <p className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                      Ledger unavailable
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                      {loadError}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 h-9"
                      onClick={() => void refresh(false)}
                    >
                      <RotateCw aria-hidden="true" className="size-3.5" />
                      RETRY
                    </Button>
                  </div>
                </div>
              ) : rows === null ? (
                <div role="status" aria-label="Loading transactions">
                  <LedgerRowSkeleton />
                  <LedgerRowSkeleton />
                  <LedgerRowSkeleton />
                  <LedgerRowSkeleton />
                  <LedgerRowSkeleton />
                </div>
              ) : visible.length === 0 ? (
                <div className="m-4 rounded-lg border border-dashed p-8 text-center">
                  <p className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                    {rows.length === 0
                      ? "No transactions yet"
                      : "No transactions match these filters"}
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    {rows.length === 0
                      ? "Run the agent or an adversarial scenario — every outcome lands here."
                      : "Adjust the decision, source or search filters."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-24 pl-4 pr-2 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        TIME UTC
                      </TableHead>
                      <TableHead className="px-2 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        SOURCE
                      </TableHead>
                      <TableHead className="hidden px-2 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:table-cell">
                        MERCHANT
                      </TableHead>
                      <TableHead className="px-2 text-right font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        TOTAL
                      </TableHead>
                      <TableHead className="px-2 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        DECISION
                      </TableHead>
                      <TableHead className="hidden px-2 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:table-cell">
                        STATUS
                      </TableHead>
                      <TableHead className="hidden px-2 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground md:table-cell">
                        PAYPAL
                      </TableHead>
                      <TableHead className="pr-4 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground lg:table-cell">
                        REF
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((row) => {
                      const opening = openingId === row.id;
                      return (
                        <TableRow
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          aria-busy={opening}
                          aria-label={`Open Payment Intent Record — ${row.merchant}, ${formatMoney(row.total, row.currency)}, ${row.decision ?? "no decision"}`}
                          onClick={() => void handleOpenRow(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              void handleOpenRow(row);
                            }
                          }}
                          className="cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                        >
                          <TableCell
                            className="pl-4 pr-2 py-3 font-data text-[11px] tracking-[0.04em] text-muted-foreground"
                            title={row.createdAt}
                          >
                            {formatUtcShort(row.createdAt)}
                          </TableCell>
                          <TableCell className="px-2 py-3">
                            {opening ? (
                              <Loader2
                                aria-hidden="true"
                                className="size-4 animate-spin text-muted-foreground"
                              />
                            ) : (
                              <SourceChip
                                source={row.source}
                                scenarioId={row.scenarioId}
                              />
                            )}
                          </TableCell>
                          <TableCell className="hidden max-w-40 truncate px-2 py-3 text-[13px] font-medium text-foreground sm:table-cell">
                            {row.merchant}
                          </TableCell>
                          <TableCell className="px-2 py-3 text-right font-data text-[12px] font-medium tracking-[0.04em] text-foreground">
                            {formatMoney(row.total, row.currency)}
                          </TableCell>
                          <TableCell className="px-2 py-3">
                            {row.decision ? (
                              <DecisionBadge decision={row.decision} />
                            ) : (
                              <span className="font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden px-2 py-3 sm:table-cell">
                            <TransactionStatusBadge status={row.status} />
                          </TableCell>
                          <TableCell className="hidden px-2 py-3 font-data text-[11px] tracking-[0.04em] text-muted-foreground md:table-cell">
                            {paypalShort(row)}
                          </TableCell>
                          <TableCell className="hidden pr-4 py-3 font-data text-[11px] tracking-[0.04em] text-muted-foreground lg:table-cell">
                            {row.paymentIntent?.reference ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="flex min-h-[14px] items-center justify-between gap-3 border-t px-4 py-2.5">
              <MonoLabel className="text-[10px] tracking-[0.14em]">
                CLICK A ROW FOR ITS PAYMENT INTENT RECORD
              </MonoLabel>
              {rows !== null ? (
                <span className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {filtersActive
                    ? `${visible.length} / ${rows.length} SHOWN`
                    : `${rows.length} ON RECORD`}
                </span>
              ) : null}
            </div>
          </Card>
        </Reveal>
      </div>

      {pir ? (
        <PirDialog
          transaction={pir.transaction}
          open={pir.open}
          onClose={() => {
            setPir((prev) => (prev ? { ...prev, open: false } : prev));
            void refresh(true);
          }}
          onUpdated={(tx) => {
            setPir((prev) => (prev ? { ...prev, transaction: tx } : prev));
            void refresh(true);
          }}
        />
      ) : null}
    </section>
  );
}
