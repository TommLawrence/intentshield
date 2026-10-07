"use client";

import * as React from "react";
import { AlertCircle, Loader2, RotateCw, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import type {
  MandateDetailResponse,
  MandateDraftResponse,
  MandateListItem,
} from "@/lib/mandates/types";
import { MonoLabel, SectionHeading } from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";
import {
  ApiError,
  apiFetch,
  formatApiErrorText,
  formatDateUtc,
} from "@/components/intentshield/mandates/shared";
import {
  ReviewDialog,
  type ReviewInput,
  reviewInputFromDetail,
  reviewInputFromDraftResponse,
} from "@/components/intentshield/mandates/review-dialog";
import { MandateDetailDialog } from "@/components/intentshield/mandates/detail-dialog";

const INSTRUCTION_MAX = 4000;
const INSTRUCTION_MIN = 3;

const LAPTOP_EXAMPLE =
  "Buy me a business laptop for work. Maximum total spend is $900 USD. It must be new. No recurring subscriptions. Shipping must not exceed $40.";

const EXAMPLES: { label: string; text: string; amber: boolean }[] = [
  {
    label: "LAPTOP · FULL EXAMPLE",
    text: LAPTOP_EXAMPLE,
    amber: false,
  },
  {
    label: "HEADPHONES · REFURB OK",
    text: "Buy headphones under $200. Refurbished is fine.",
    amber: false,
  },
  {
    label: "AMBIGUOUS DEMO",
    text: "Get me a reasonably priced laptop.",
    amber: true,
  },
  {
    label: "CONTRADICTION DEMO",
    text: "Buy a laptop for no more than $900. I don't care about the price.",
    amber: true,
  },
];

/** Map draft-extraction error codes to honest, actionable copy. */
function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "VALIDATION_ERROR":
        return formatApiErrorText(
          err,
          "Describe the mandate in 3–4000 characters."
        );
      case "EXTRACTION_FAILED":
        return "The AI interpretation did not pass strict validation — nothing was created. Try rephrasing.";
      case "AI_UNAVAILABLE":
        return "The AI interpreter is unavailable right now. Please try again shortly.";
      default:
        return formatApiErrorText(
          err,
          "Something went wrong interpreting that instruction. Please try again."
        );
    }
  }
  return formatApiErrorText(
    err,
    "Something went wrong interpreting that instruction. Please try again."
  );
}

function MandateRowSkeleton() {
  return (
    <div className="flex items-start justify-between gap-4 border-b px-4 py-4 last:border-b-0">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-2.5 w-52" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <Skeleton className="h-4.5 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function MandateConsole() {
  const [mandates, setMandates] = React.useState<MandateListItem[] | null>(
    null
  );
  const [listLoading, setListLoading] = React.useState(true);

  const [instruction, setInstruction] = React.useState("");
  const [extracting, setExtracting] = React.useState(false);
  const [extractError, setExtractError] = React.useState<string | null>(null);

  const [openingId, setOpeningId] = React.useState<string | null>(null);

  const [review, setReview] = React.useState<ReviewInput | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<MandateDetailResponse | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const listAbort = React.useRef<AbortController | null>(null);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      listAbort.current?.abort();
    };
  }, []);

  const refreshList = React.useCallback(async () => {
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    setListLoading(true);
    try {
      const data = await apiFetch<{ mandates: MandateListItem[] }>(
        "/api/mandates",
        { signal: controller.signal }
      );
      if (alive.current && !controller.signal.aborted) {
        setMandates(data.mandates);
      }
    } catch (err) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        return;
      }
      if (alive.current) {
        toast.error(formatApiErrorText(err, "Could not load mandates."));
      }
    } finally {
      if (alive.current && !controller.signal.aborted) {
        setListLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void refreshList();
  }, [refreshList]);

  async function handleExtract() {
    const text = instruction.trim();
    if (text.length < INSTRUCTION_MIN) {
      toast.error(
        `Describe the mandate in at least ${INSTRUCTION_MIN} characters.`
      );
      return;
    }
    setExtracting(true);
    setExtractError(null);
    try {
      const data = await apiFetch<MandateDraftResponse>("/api/mandates/draft", {
        method: "POST",
        body: JSON.stringify({ instruction: text }),
      });
      setReview(reviewInputFromDraftResponse(data));
      setReviewOpen(true);
      void refreshList();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setExtractError(extractErrorMessage(err));
      }
    } finally {
      setExtracting(false);
    }
  }

  async function handleOpenRow(item: MandateListItem) {
    if (openingId) {
      return;
    }
    setOpeningId(item.id);
    try {
      const data = await apiFetch<MandateDetailResponse>(
        `/api/mandates/${item.id}`
      );
      if (data.status === "DRAFT") {
        const input = reviewInputFromDetail(data);
        if (input) {
          setReview(input);
          setReviewOpen(true);
          return;
        }
      }
      setDetail(data);
      setDetailOpen(true);
    } catch (err) {
      toast.error(formatApiErrorText(err, "Could not open this mandate."));
    } finally {
      setOpeningId(null);
    }
  }

  function handleReviewClose() {
    setReviewOpen(false);
    setReview(null);
    // The DRAFT row persists by design — nothing was authorized.
    void refreshList();
  }

  function handleConfirmed(confirmed: MandateDetailResponse) {
    setReviewOpen(false);
    setReview(null);
    void refreshList();
    setDetail(confirmed);
    setDetailOpen(true);
    toast.success(
      "Mandate activated — version 1 is now your active authorization."
    );
  }

  return (
    <section id="mandates" aria-labelledby="mandates-title" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading
            id="mandates-title"
            eyebrow="01 / MANDATE CONSOLE"
            title="Turn intent into authorization."
            description="Describe what an AI agent may buy on your behalf. IntentShield's AI drafts a structured interpretation of your intent — you review it, correct anything, and confirm it. Nothing is authorized until you do."
          />
        </Reveal>

        <Reveal delay={60} className="mt-10">
          <div className="grid items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
            {/* LEFT — create a draft */}
            <Card className="gap-0 py-0">
              <div className="border-b px-4 py-3">
                <MonoLabel>NEW MANDATE</MonoLabel>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Natural language in, structured draft out. The AI interprets;
                  authorization stays with you.
                </p>
              </div>
              <form
                className="flex flex-col gap-4 px-4 py-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleExtract();
                }}
              >
                <div className="space-y-2">
                  <label
                    htmlFor="mandate-instruction"
                    className="font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    Describe the spending mandate
                  </label>
                  <Textarea
                    id="mandate-instruction"
                    rows={5}
                    maxLength={INSTRUCTION_MAX}
                    placeholder={LAPTOP_EXAMPLE}
                    value={instruction}
                    disabled={extracting}
                    aria-describedby="mandate-instruction-hint"
                    className="min-h-[120px] resize-y bg-background text-[13px] leading-relaxed"
                    onChange={(event) => setInstruction(event.target.value)}
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      id="mandate-instruction-hint"
                      className="text-[11px] leading-relaxed text-muted-foreground"
                    >
                      The AI returns a draft in seconds — you confirm it before
                      anything is authorized.
                    </p>
                    <p className="shrink-0 font-data text-[10px] tracking-[0.1em] text-muted-foreground">
                      {`${instruction.length}/${INSTRUCTION_MAX}`}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <MonoLabel
                    as="p"
                    className="text-[10px] tracking-[0.16em]"
                  >
                    EXAMPLES
                  </MonoLabel>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example.label}
                        type="button"
                        title={example.text}
                        disabled={extracting}
                        onClick={() => setInstruction(example.text)}
                        className={cn(
                          "inline-flex min-h-11 items-center rounded-md border bg-card px-3 font-data text-[10px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
                          example.amber
                            ? "border-review/40 text-review hover:bg-review/10"
                            : "text-secondary-foreground hover:border-primary/40 hover:text-primary"
                        )}
                      >
                        {example.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={extracting}
                  className="h-11 w-full font-data text-[11px] uppercase tracking-[0.14em]"
                >
                  {extracting ? (
                    <>
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                      INTERPRETING…
                    </>
                  ) : (
                    <>
                      <Wand2 aria-hidden="true" className="size-4" />
                      EXTRACT MANDATE
                    </>
                  )}
                </Button>

                {extractError ? (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden="true" />
                    <AlertTitle>Interpretation failed</AlertTitle>
                    <AlertDescription>{extractError}</AlertDescription>
                  </Alert>
                ) : null}

                <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
                  The AI drafts an interpretation. Only your explicit
                  confirmation creates authorization.
                </p>
              </form>
            </Card>

            {/* RIGHT — the mandate ledger */}
            <Card className="gap-0 py-0">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <MonoLabel>MANDATES</MonoLabel>
                  {mandates ? (
                    <Badge
                      variant="outline"
                      className="font-data text-[10px] font-medium tracking-[0.14em] text-muted-foreground"
                    >
                      {mandates.length}
                    </Badge>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 text-muted-foreground hover:text-foreground"
                  aria-label="Refresh mandates"
                  onClick={() => void refreshList()}
                  disabled={listLoading && mandates === null}
                >
                  <RotateCw
                    aria-hidden="true"
                    className={cn("size-4", listLoading && "animate-spin")}
                  />
                </Button>
              </div>

              <div
                className="max-h-[560px] overflow-y-auto"
                aria-label="Mandate list"
              >
                {mandates === null ? (
                  <div role="status" aria-label="Loading mandates">
                    <MandateRowSkeleton />
                    <MandateRowSkeleton />
                    <MandateRowSkeleton />
                  </div>
                ) : mandates.length === 0 ? (
                  <div className="m-4 rounded-lg border border-dashed p-8 text-center">
                    <p className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                      No mandates yet
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                      Your first authorization will appear here.
                    </p>
                  </div>
                ) : (
                  mandates.map((item) => {
                    const opening = openingId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-busy={opening}
                        disabled={openingId !== null}
                        onClick={() => void handleOpenRow(item)}
                        className="flex w-full items-start justify-between gap-3 border-b px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[15px] font-semibold tracking-tight text-foreground">
                            {item.title}
                          </span>
                          <span className="mt-1 block font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {`${item.status} · V${item.currentVersion} · CREATED ${formatDateUtc(
                              item.createdAt
                            )}`}
                          </span>
                        </span>
                        {opening ? (
                          <Loader2
                            aria-hidden="true"
                            className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground"
                          />
                        ) : (
                          <span className="flex shrink-0 flex-col items-end gap-1.5">
                            <MandateRowBadge item={item} />
                            {item.maxTotal !== null && item.currency ? (
                              <span className="font-data text-[12px] font-medium tracking-[0.06em] text-foreground">
                                {formatMoney(item.maxTotal, item.currency)}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex min-h-[14px] items-center border-t px-4 py-2.5">
                <MonoLabel className="text-[10px] tracking-[0.14em]">
                  AI INTERPRETS · POLICY DECIDES · PAYPAL EXECUTES
                </MonoLabel>
              </div>
            </Card>
          </div>
        </Reveal>
      </div>

      {review ? (
        <ReviewDialog
          input={review}
          open={reviewOpen}
          onClose={handleReviewClose}
          onConfirmed={handleConfirmed}
        />
      ) : null}

      {detail ? (
        <MandateDetailDialog
          detail={detail}
          open={detailOpen}
          onClose={() => {
            setDetailOpen(false);
            setDetail(null);
          }}
          onChanged={() => void refreshList()}
        />
      ) : null}
    </section>
  );
}

/** Right-hand status block for a list row. */
function MandateRowBadge({ item }: { item: MandateListItem }) {
  return (
    <span className="flex flex-col items-end gap-1.5">
      <span
        className={cn(
          "inline-flex items-center rounded-md border px-2 py-0.5 font-data text-[10px] font-medium uppercase tracking-[0.14em]",
          item.status === "DRAFT" && "border-review/50 bg-review/10 text-review",
          item.status === "ACTIVE" && "border-allow/40 bg-allow/10 text-allow",
          item.status === "REVOKED" && "border-block/40 bg-block/10 text-block",
          item.status === "EXPIRED" &&
            "border-border bg-secondary/40 text-muted-foreground"
        )}
      >
        {item.status}
      </span>
      {item.status === "DRAFT" && item.missingCount > 0 ? (
        <span className="inline-flex items-center rounded-md border border-review/40 px-2 py-0.5 font-data text-[10px] font-medium uppercase tracking-[0.12em] text-review">
          {`NEEDS ${item.missingCount} FIELD${item.missingCount > 1 ? "S" : ""}`}
        </span>
      ) : null}
    </span>
  );
}
