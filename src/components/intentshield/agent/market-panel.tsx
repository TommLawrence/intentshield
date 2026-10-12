"use client";

import * as React from "react";
import {
  ArrowUpRight,
  Copy,
  Globe,
  Loader2,
  PackageSearch,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import type { MandateListItem } from "@/lib/mandates/types";
import type { MarketSearchResponse } from "@/lib/channel3/types";
import { MonoLabel } from "@/components/intentshield/primitives";
import {
  ApiError,
  apiFetch,
  formatApiErrorText,
} from "@/components/intentshield/agent/shared";

const QUERY_MAX = 200;
const QUERY_MIN = 3;

const VERDICT_STYLES: Record<string, string> = {
  ALLOW: "border-allow/40 bg-allow/10 text-allow",
  REVIEW: "border-review/40 bg-review/10 text-review",
  BLOCK: "border-block/40 bg-block/10 text-block",
};

/** Map market-search error codes to honest, actionable copy. */
function marketErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "VALIDATION_ERROR":
        return formatApiErrorText(
          err,
          "Describe the market query in 3–200 characters."
        );
      case "NOT_FOUND":
        return "The selected mandate no longer exists — refresh and pick another.";
      case "INVALID_STATE":
        return "The selected mandate is not ACTIVE. Confirm it in the mandate console first.";
      case "CHANNEL3_NOT_CONFIGURED":
        return "Channel3 is not configured (CHANNEL3_API_KEY is not set). IntentShield never fakes live market data — add the key in .env and retry.";
      case "CHANNEL3_ERROR":
        return formatApiErrorText(
          err,
          "The live market search failed. Please try again."
        );
      default:
        return formatApiErrorText(
          err,
          "Something went wrong running this search. Please try again."
        );
    }
  }
  return formatApiErrorText(
    err,
    "Something went wrong running this search. Please try again."
  );
}

/**
 * Live market grounding — Channel3 product search with a read-only policy
 * check per offer. Strictly advisory: this panel never creates a
 * transaction and nothing here can reach PayPal. It shares the mandate
 * selection with the agent brief above it.
 */
export function MarketPanel({
  mandate,
  agentRequest,
}: {
  mandate: MandateListItem | null;
  agentRequest: string;
}) {
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<MarketSearchResponse | null>(null);

  const copiedRequest = agentRequest.trim().slice(0, QUERY_MAX);

  async function handleSearch() {
    const text = query.trim();
    if (!mandate) {
      toast.error("Select an ACTIVE mandate above first.");
      return;
    }
    if (text.length < QUERY_MIN) {
      toast.error(
        `Describe the market query in at least ${QUERY_MIN} characters.`
      );
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const data = await apiFetch<MarketSearchResponse>("/api/market/search", {
        method: "POST",
        body: JSON.stringify({ mandateId: mandate.id, query: text }),
      });
      setResult(data);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(marketErrorMessage(err));
      }
    } finally {
      setSearching(false);
    }
  }

  return (
    <Card className="gap-0 py-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-3">
        <MonoLabel>LIVE MARKET — POWERED BY CHANNEL3</MonoLabel>
        <span className="font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          ADVISORY · READ-ONLY · NOTHING PAYS
        </span>
      </div>

      <div className="px-4 py-4">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Ground the request in the real live market — Channel3&apos;s product
          graph covers 100M+ products across thousands of real merchants with
          live prices. Every offer below is judged by the same deterministic
          policy engine against the selected mandate. Nothing is persisted,
          nothing executes, and nothing here can ever reach PayPal.
        </p>

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSearch();
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label
              htmlFor="market-query"
              className="font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
            >
              Market query
            </label>
            <div className="flex gap-2">
              <Input
                id="market-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={QUERY_MAX}
                placeholder="e.g. massage gun"
                disabled={searching}
                aria-describedby="market-query-hint"
                className="h-11 flex-1 bg-background text-[13px]"
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  searching ||
                  copiedRequest.length < QUERY_MIN ||
                  copiedRequest === query.trim()
                }
                onClick={() => setQuery(copiedRequest)}
                title="Copy the agent request into the market query"
                className="h-11 shrink-0 font-data text-[10px] uppercase tracking-[0.12em]"
              >
                <Copy aria-hidden="true" className="size-3.5" />
                <span className="hidden sm:inline">USE AGENT REQUEST</span>
                <span className="sr-only sm:hidden">
                  Copy the agent request into the market query
                </span>
              </Button>
            </div>
            <p
              id="market-query-hint"
              className="text-[11px] leading-relaxed text-muted-foreground"
            >
              {mandate
                ? `Checked against ${mandate.title} — up to ${formatMoney(mandate.maxTotal ?? 0, mandate.currency ?? "USD")} · V${mandate.currentVersion}. One search consumes one Channel3 credit.`
                : "Select an ACTIVE mandate above to run a live market check."}
            </p>
          </div>
          <Button
            type="submit"
            disabled={searching || !mandate}
            className="h-11 shrink-0 font-data text-[11px] uppercase tracking-[0.14em]"
          >
            {searching ? (
              <>
                <Loader2
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
                SEARCHING…
              </>
            ) : (
              <>
                <Globe aria-hidden="true" className="size-4" />
                SEARCH LIVE MARKET
              </>
            )}
          </Button>
        </form>

        <div className="mt-4">
          {searching ? (
            <div
              role="status"
              aria-label="Searching the live market"
              className="rounded-lg border border-dashed p-6"
            >
              <p className="flex items-center gap-2.5 font-display text-[15px] font-semibold tracking-tight text-foreground">
                <Loader2
                  aria-hidden="true"
                  className="size-4 animate-spin text-primary"
                />
                Querying Channel3&apos;s live product graph…
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                Real products, real merchants, live prices — then the policy
                engine judges each offer against your mandate. This is a real
                API call; it can take up to 15 seconds.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-52 rounded-lg" />
                <Skeleton className="h-52 rounded-lg" />
                <Skeleton className="h-52 rounded-lg" />
              </div>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <ShieldAlert aria-hidden="true" />
              <AlertTitle>Live market search failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : result ? (
            result.products.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <PackageSearch
                  aria-hidden="true"
                  className="mx-auto size-5 text-muted-foreground"
                />
                <p className="mt-2.5 font-display text-[15px] font-semibold tracking-tight text-foreground">
                  No live products matched
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  Channel3 returned no offers for this query. Try different or
                  simpler words — nothing was simulated to fill the gap.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <MonoLabel className="text-[10px] tracking-[0.14em]">
                    {`${result.market.productCount} LIVE PRODUCTS · POLICY-CHECKED AGAINST THE MANDATE`}
                  </MonoLabel>
                  <span className="font-data text-[10px] tracking-[0.1em] text-muted-foreground">
                    {`CORRELATION #${result.correlationId.slice(0, 8)}`}
                  </span>
                </div>
                <div
                  className="mt-3 max-h-[560px] overflow-y-auto pr-1"
                  role="region"
                  aria-label="Live market products, policy-checked"
                >
                  <div
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    role="list"
                  >
                    {result.products.map((product) => (
                      <article
                        key={product.productId}
                        role="listitem"
                        className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card"
                      >
                        <div className="flex h-28 shrink-0 items-center justify-center border-b bg-muted/30 p-2">
                          {product.imageUrl ? (
                            /* External Channel3-hosted product image — a
                               plain img keeps this read-only advisory surface
                               decoupled from next/image remotePatterns. */
                            <img
                              src={product.imageUrl}
                              alt={product.title}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <Globe
                              aria-hidden="true"
                              className="size-5 text-muted-foreground"
                            />
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
                          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                            {product.title}
                          </p>
                          <p className="truncate font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {[product.brand, product.category]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                          <div className="mt-auto space-y-2 pt-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="shrink-0 font-data text-[11px] font-medium tracking-[0.08em] text-foreground">
                                {formatMoney(
                                  product.offer.priceMinor,
                                  product.offer.currency
                                )}
                              </span>
                              <span
                                className="min-w-0 truncate font-data text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
                                title={product.offer.domain}
                              >
                                {product.offer.domain}
                              </span>
                            </div>
                            <p
                              className={cn(
                                "rounded-md border px-2.5 py-1.5 font-data text-[10px] font-medium uppercase tracking-[0.12em]",
                                VERDICT_STYLES[product.policy.decision]
                              )}
                            >
                              {`${product.policy.decision} · ${
                                product.policy.firedRules.length > 0
                                  ? product.policy.firedRules.join(" ")
                                  : "ALL RULES PASS"
                              }`}
                            </p>
                            <p
                              className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground"
                              title={product.policy.summary}
                            >
                              {product.policy.summary}
                            </p>
                            <a
                              href={product.offer.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-9 items-center gap-1 font-data text-[10px] uppercase tracking-[0.12em] text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              VIEW OFFER
                              <ArrowUpRight
                                aria-hidden="true"
                                className="size-3"
                              />
                              <span className="sr-only">
                                {`Open ${product.offer.domain}'s offer page in a new tab`}
                              </span>
                            </a>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Globe
                aria-hidden="true"
                className="mx-auto size-5 text-muted-foreground"
              />
              <p className="mt-2.5 font-display text-[15px] font-semibold tracking-tight text-foreground">
                Live market grounding
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-muted-foreground">
                Search any product and watch the same policy engine judge real
                live-market offers — merchant allowlists, amount ceilings,
                currency and condition rules, applied to the real world.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
          Channel3&apos;s merchant checkout is coming soon — external retailers
          are not payable through this prototype. The controlled catalogue
          remains the agent&apos;s only payable world, and PayPal execution
          stays guarded there. This market check is advisory: no transaction
          record is created.
        </p>
      </div>
    </Card>
  );
}
