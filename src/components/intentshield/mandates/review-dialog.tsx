"use client";

import * as React from "react";
import { AlertCircle, ChevronDown, Loader2, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  MISSING_FIELD_LABELS,
  type ApprovalMode,
  type ExtractionClassification,
  type MandateDetailResponse,
  type MandateDraftMeta,
  type MandateDraftResponse,
  type MissingMandateField,
  type NormalizedMandateDraft,
  type PurchaseType,
} from "@/lib/mandates/types";
import { MonoLabel } from "@/components/intentshield/primitives";
import {
  AMOUNT_PATTERN,
  DAYS_PATTERN,
  FieldLabel,
  apiFetch,
  formatApiErrorText,
  formatUtc,
  minorToMajorInput,
  parseCommaList,
} from "@/components/intentshield/mandates/shared";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

/**
 * The unified review input — built either from a fresh extraction
 * (MandateDraftResponse) or re-hydrated from a stored DRAFT (detail GET).
 */
export interface ReviewInput {
  mandateId: string;
  correlationId: string | null;
  classification: ExtractionClassification;
  title: string;
  instruction: string;
  draft: NormalizedMandateDraft;
  missingFields: MissingMandateField[];
  clarificationQuestion: string | null;
  warnings: string[];
  meta: MandateDraftMeta | null;
}

/** Fresh extraction → review input. */
export function reviewInputFromDraftResponse(
  response: MandateDraftResponse
): ReviewInput {
  return {
    mandateId: response.mandateId,
    correlationId: response.correlationId,
    classification: response.classification,
    title: response.title,
    instruction: response.instruction,
    draft: response.draft,
    missingFields: response.missingFields,
    clarificationQuestion: response.clarificationQuestion,
    warnings: response.warnings,
    meta: response.meta,
  };
}

/** Stored DRAFT (detail GET) → review input; null when it is not a reviewable draft. */
export function reviewInputFromDetail(
  detail: MandateDetailResponse
): ReviewInput | null {
  if (detail.status !== "DRAFT" || !detail.draft) {
    return null;
  }
  return {
    mandateId: detail.id,
    correlationId:
      // Re-link the audit chain to the original extraction correlation.
      detail.audit.find((event) => event.eventType === "MANDATE_DRAFT_CREATED")
        ?.correlationId ?? null,
    classification:
      detail.draft.missingFields.length > 0 ||
      detail.draft.clarificationQuestion !== null
        ? "AMBIGUOUS"
        : "CLEAR",
    title: detail.title,
    instruction: detail.instruction,
    draft: detail.draft.fields,
    missingFields: detail.draft.missingFields,
    clarificationQuestion: detail.draft.clarificationQuestion,
    warnings: [],
    meta: null,
  };
}

interface ConfirmRequestBody {
  correlationId?: string;
  currency: string;
  maxTotal: string;
  maxShipping: string | null;
  allowRecurring: boolean;
  allowRefurbished: boolean;
  purchaseType: PurchaseType;
  maxQuantity: number;
  validityDays: number | null;
  allowedCategories: string[] | null;
  blockedCategories: string[] | null;
  allowedMerchants: string[] | null;
  blockedMerchants: string[] | null;
  approvalMode: ApprovalMode;
}

/** Compact "what the interpretation DID determine" line for the amber alert. */
function understoodSummary(draft: NormalizedMandateDraft): string {
  const parts: string[] = [];
  if (draft.allowedCategories && draft.allowedCategories.length > 0) {
    parts.push(`Category: ${draft.allowedCategories.join(", ")}`);
  }
  if (draft.currency) {
    parts.push(`Currency: ${draft.currency}`);
  }
  if (draft.maxTotal !== null && draft.currency) {
    parts.push(`Maximum total: ${formatMoney(draft.maxTotal, draft.currency)}`);
  }
  return parts.length > 0
    ? `We understood: ${parts.join(" · ")}.`
    : "We could not determine the key terms of this mandate.";
}

export function ReviewDialog({
  input,
  open,
  onClose,
  onConfirmed,
}: {
  input: ReviewInput;
  open: boolean;
  onClose: () => void;
  onConfirmed: (detail: MandateDetailResponse) => void;
}) {
  const idPrefix = React.useId();

  // Form state — prefilled from the AI's interpretation, human-editable.
  const [currency, setCurrency] = React.useState<string>(
    input.draft.currency ?? ""
  );
  const [maxTotal, setMaxTotal] = React.useState<string>(
    input.draft.maxTotal !== null ? minorToMajorInput(input.draft.maxTotal) : ""
  );
  const [maxShipping, setMaxShipping] = React.useState<string>(
    input.draft.maxShipping !== null
      ? minorToMajorInput(input.draft.maxShipping)
      : ""
  );
  const [allowRecurring, setAllowRecurring] = React.useState<boolean>(
    input.draft.allowRecurring
  );
  const [allowRefurbished, setAllowRefurbished] = React.useState<boolean>(
    input.draft.allowRefurbished
  );
  const [purchaseType, setPurchaseType] = React.useState<PurchaseType>(
    input.draft.purchaseType
  );
  const [validityDays, setValidityDays] = React.useState<string>(
    input.draft.validityDays !== null ? String(input.draft.validityDays) : ""
  );
  const [maxQuantity, setMaxQuantity] = React.useState<string>(
    String(input.draft.maxQuantity)
  );
  const [allowedCategories, setAllowedCategories] = React.useState<string>(
    input.draft.allowedCategories
      ? input.draft.allowedCategories.join(", ")
      : ""
  );
  const [blockedCategories, setBlockedCategories] = React.useState<string>(
    input.draft.blockedCategories
      ? input.draft.blockedCategories.join(", ")
      : ""
  );
  const [allowedMerchants, setAllowedMerchants] = React.useState<string>(
    input.draft.allowedMerchants
      ? input.draft.allowedMerchants.join(", ")
      : ""
  );
  const [blockedMerchants, setBlockedMerchants] = React.useState<string>(
    input.draft.blockedMerchants
      ? input.draft.blockedMerchants.join(", ")
      : ""
  );
  const [approvalMode, setApprovalMode] = React.useState<ApprovalMode>(
    input.draft.approvalMode ?? "AUTO"
  );

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Re-prefill whenever a different draft is being reviewed.
  React.useEffect(() => {
    setCurrency(input.draft.currency ?? "");
    setMaxTotal(
      input.draft.maxTotal !== null
        ? minorToMajorInput(input.draft.maxTotal)
        : ""
    );
    setMaxShipping(
      input.draft.maxShipping !== null
        ? minorToMajorInput(input.draft.maxShipping)
        : ""
    );
    setAllowRecurring(input.draft.allowRecurring);
    setAllowRefurbished(input.draft.allowRefurbished);
    setPurchaseType(input.draft.purchaseType);
    setValidityDays(
      input.draft.validityDays !== null ? String(input.draft.validityDays) : ""
    );
    setMaxQuantity(String(input.draft.maxQuantity));
    setAllowedCategories(
      input.draft.allowedCategories
        ? input.draft.allowedCategories.join(", ")
        : ""
    );
    setBlockedCategories(
      input.draft.blockedCategories
        ? input.draft.blockedCategories.join(", ")
        : ""
    );
    setAllowedMerchants(
      input.draft.allowedMerchants
        ? input.draft.allowedMerchants.join(", ")
        : ""
    );
    setBlockedMerchants(
      input.draft.blockedMerchants
        ? input.draft.blockedMerchants.join(", ")
        : ""
    );
    setApprovalMode(input.draft.approvalMode ?? "AUTO");
    setSubmitting(false);
    setSubmitError(null);
  }, [input]);

  // Client-side gates — the server re-validates everything anyway.
  const trimmedTotal = maxTotal.trim();
  const trimmedShipping = maxShipping.trim();
  const trimmedDays = validityDays.trim();
  const maxTotalInvalid =
    trimmedTotal.length > 0 && !AMOUNT_PATTERN.test(trimmedTotal);
  const maxShippingInvalid =
    trimmedShipping.length > 0 && !AMOUNT_PATTERN.test(trimmedShipping);
  const validityDaysInvalid =
    trimmedDays.length > 0 && !DAYS_PATTERN.test(trimmedDays);

  const missingNow: MissingMandateField[] = [];
  if (currency.length === 0) {
    missingNow.push("currency");
  }
  if (trimmedTotal.length === 0) {
    missingNow.push("maxTotal");
  }
  const missingHelper =
    missingNow.length > 0
      ? `Supply the missing ${missingNow
          .map((field) => MISSING_FIELD_LABELS[field])
          .join(" and ")} before confirming.`
      : null;

  const canConfirm =
    !submitting &&
    missingNow.length === 0 &&
    !maxTotalInvalid &&
    !maxShippingInvalid &&
    !validityDaysInvalid;

  async function handleConfirm() {
    if (!canConfirm) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const quantity = Number.parseInt(maxQuantity, 10);
    const days = Number.parseInt(trimmedDays, 10);
    const body: ConfirmRequestBody = {
      ...(input.correlationId
        ? { correlationId: input.correlationId }
        : {}),
      currency,
      maxTotal: trimmedTotal,
      maxShipping: trimmedShipping.length > 0 ? trimmedShipping : null,
      allowRecurring,
      allowRefurbished,
      purchaseType,
      maxQuantity: Number.isFinite(quantity) && quantity >= 1 ? quantity : 1,
      validityDays:
        trimmedDays.length > 0 && Number.isFinite(days) ? days : null,
      allowedCategories: parseCommaList(allowedCategories),
      blockedCategories: parseCommaList(blockedCategories),
      allowedMerchants: parseCommaList(allowedMerchants),
      blockedMerchants: parseCommaList(blockedMerchants),
      approvalMode,
    };

    try {
      const detail = await apiFetch<MandateDetailResponse>(
        `/api/mandates/${input.mandateId}/confirm`,
        { method: "POST", body: JSON.stringify(body) }
      );
      onConfirmed(detail);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setSubmitError(
        formatApiErrorText(
          err,
          "The mandate could not be confirmed. Please try again."
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="top-[50%] flex max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-3xl translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MonoLabel>DRAFT MANDATE REVIEW</MonoLabel>
            <Badge
              variant="outline"
              className={cn(
                "font-data text-[10px] font-medium uppercase tracking-[0.14em]",
                input.classification === "CLEAR"
                  ? "border-allow/40 bg-allow/10 text-allow"
                  : "border-review/50 bg-review/10 text-review"
              )}
            >
              {input.classification === "CLEAR"
                ? "INTERPRETATION COMPLETE"
                : "CLARIFICATION NEEDED"}
            </Badge>
          </div>
          <DialogTitle className="pr-8 font-display text-lg font-semibold tracking-tight sm:text-xl">
            {input.title}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            The AI has drafted an interpretation of your instruction. Nothing
            is authorized yet — review it, correct anything, then confirm.
          </DialogDescription>
          <p className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {`CORRELATION ${
              input.correlationId ? input.correlationId.slice(0, 8) : "—"
            }`}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {submitError ? (
            <Alert variant="destructive" className="mb-5">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Confirmation failed</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
            {/* The human's words — always visible, never editable here. */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <MonoLabel className="text-[10px] tracking-[0.16em]">
                YOUR INSTRUCTION
              </MonoLabel>
              <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-border pl-3 text-[13px] italic leading-relaxed text-muted-foreground">
                {`“${input.instruction}”`}
              </blockquote>
              {input.meta ? (
                <p className="mt-4 font-data text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
                  {`INTERPRETED BY ${input.meta.provider}/${input.meta.model} · ${formatUtc(
                    input.meta.extractedAt
                  )}`}
                </p>
              ) : null}
            </div>

            {/* The editable structured interpretation. */}
            <div className="rounded-lg border p-4">
              <MonoLabel className="text-[10px] tracking-[0.16em]">
                INTERPRETED MANDATE
              </MonoLabel>

              {input.classification === "AMBIGUOUS" ? (
                <Alert className="mt-3 border-review/40 bg-review/5 text-review">
                  <ShieldAlert aria-hidden="true" />
                  <AlertTitle className="text-[13px] font-semibold">
                    Clarification needed
                  </AlertTitle>
                  <AlertDescription className="text-[13px] leading-relaxed text-muted-foreground">
                    {understoodSummary(input.draft)}{" "}
                    {input.missingFields.length > 0
                      ? `We could not determine: ${input.missingFields
                          .map((field) => MISSING_FIELD_LABELS[field])
                          .join(" and ")}.`
                      : null}{" "}
                    {input.clarificationQuestion ?? null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {input.warnings.length > 0 ? (
                <Alert className="mt-3 border-review/40 bg-review/5 text-review">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle className="text-[13px] font-semibold">
                    Constraint warnings
                  </AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-muted-foreground">
                      {input.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="mt-4 space-y-4">
                {/* Core fields */}
                <div className="space-y-2">
                  <FieldLabel htmlFor={`${idPrefix}-currency`} required>
                    Currency
                  </FieldLabel>
                  <Select
                    value={currency}
                    onValueChange={setCurrency}
                    disabled={submitting}
                  >
                    <SelectTrigger
                      id={`${idPrefix}-currency`}
                      className="h-11 w-full"
                      aria-required="true"
                    >
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor={`${idPrefix}-max-total`} required>
                    Maximum total spend
                  </FieldLabel>
                  <Input
                    id={`${idPrefix}-max-total`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="e.g. 900"
                    value={maxTotal}
                    disabled={submitting}
                    aria-required="true"
                    aria-invalid={maxTotalInvalid}
                    aria-describedby={
                      maxTotalInvalid ? `${idPrefix}-max-total-error` : undefined
                    }
                    onChange={(event) => setMaxTotal(event.target.value)}
                    className="h-11"
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Total ceiling in major units — 900 means{" "}
                    {currency ? currency : "the selected currency"} 900.00.
                  </p>
                  {maxTotalInvalid ? (
                    <p
                      id={`${idPrefix}-max-total-error`}
                      className="text-[11px] font-medium text-block"
                    >
                      Enter a plain amount, e.g. 900 or 900.00 (max 2 decimals).
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor={`${idPrefix}-max-shipping`}>
                    Shipping limit
                  </FieldLabel>
                  <Input
                    id={`${idPrefix}-max-shipping`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Not specified"
                    value={maxShipping}
                    disabled={submitting}
                    aria-invalid={maxShippingInvalid}
                    aria-describedby={
                      maxShippingInvalid
                        ? `${idPrefix}-max-shipping-error`
                        : undefined
                    }
                    onChange={(event) => setMaxShipping(event.target.value)}
                    className="h-11"
                  />
                  {maxShippingInvalid ? (
                    <p
                      id={`${idPrefix}-max-shipping-error`}
                      className="text-[11px] font-medium text-block"
                    >
                      Enter a plain amount, e.g. 40 or 40.50 (max 2 decimals).
                    </p>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Leave empty for no shipping ceiling.
                    </p>
                  )}
                </div>

                <div className="flex min-h-11 items-center justify-between gap-4">
                  <FieldLabel htmlFor={`${idPrefix}-recurring`}>
                    Recurring payments allowed
                  </FieldLabel>
                  <Switch
                    id={`${idPrefix}-recurring`}
                    checked={allowRecurring}
                    onCheckedChange={setAllowRecurring}
                    disabled={submitting}
                  />
                </div>

                <div className="flex min-h-11 items-center justify-between gap-4">
                  <FieldLabel htmlFor={`${idPrefix}-refurbished`}>
                    Allow refurbished items
                  </FieldLabel>
                  <Switch
                    id={`${idPrefix}-refurbished`}
                    checked={allowRefurbished}
                    onCheckedChange={setAllowRefurbished}
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor={`${idPrefix}-purchase-type`}>
                    Purchase type
                  </FieldLabel>
                  <Select
                    value={purchaseType}
                    onValueChange={(next) =>
                      setPurchaseType(next as PurchaseType)
                    }
                    disabled={submitting}
                  >
                    <SelectTrigger
                      id={`${idPrefix}-purchase-type`}
                      className="h-11 w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ONE_TIME">ONE_TIME</SelectItem>
                      <SelectItem value="RECURRING">RECURRING</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor={`${idPrefix}-validity-days`}>
                    Validity days
                  </FieldLabel>
                  <Input
                    id={`${idPrefix}-validity-days`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    placeholder="30 (default)"
                    value={validityDays}
                    disabled={submitting}
                    aria-invalid={validityDaysInvalid}
                    aria-describedby={
                      validityDaysInvalid
                        ? `${idPrefix}-validity-days-error`
                        : undefined
                    }
                    onChange={(event) => setValidityDays(event.target.value)}
                    className="h-11"
                  />
                  {validityDaysInvalid ? (
                    <p
                      id={`${idPrefix}-validity-days-error`}
                      className="text-[11px] font-medium text-block"
                    >
                      Enter a whole number of days (1 or more).
                    </p>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      How long the authorization stays active. Empty = 30-day
                      default.
                    </p>
                  )}
                </div>

                {/* Additional constraints */}
                <Collapsible>
                  <CollapsibleTrigger
                    className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-md border bg-secondary/30 px-3 font-data text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-label="Toggle additional constraints"
                  >
                    ADDITIONAL CONSTRAINTS
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <FieldLabel htmlFor={`${idPrefix}-max-quantity`}>
                        Maximum quantity
                      </FieldLabel>
                      <Input
                        id={`${idPrefix}-max-quantity`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={maxQuantity}
                        disabled={submitting}
                        onChange={(event) => setMaxQuantity(event.target.value)}
                        className="h-11"
                      />
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Units per transaction.
                      </p>
                    </div>

                    {(
                      [
                        {
                          key: "allowedCategories",
                          label: "Allowed categories",
                          state: allowedCategories,
                          set: setAllowedCategories,
                        },
                        {
                          key: "blockedCategories",
                          label: "Blocked categories",
                          state: blockedCategories,
                          set: setBlockedCategories,
                        },
                        {
                          key: "allowedMerchants",
                          label: "Allowed merchants",
                          state: allowedMerchants,
                          set: setAllowedMerchants,
                        },
                        {
                          key: "blockedMerchants",
                          label: "Blocked merchants",
                          state: blockedMerchants,
                          set: setBlockedMerchants,
                        },
                      ] as const
                    ).map((field) => (
                      <div key={field.key} className="space-y-2">
                        <FieldLabel htmlFor={`${idPrefix}-${field.key}`}>
                          {field.label}
                        </FieldLabel>
                        <Input
                          id={`${idPrefix}-${field.key}`}
                          autoComplete="off"
                          placeholder="Comma-separated, e.g. laptops, accessories"
                          value={field.state}
                          disabled={submitting}
                          onChange={(event) => field.set(event.target.value)}
                          className="h-11"
                        />
                      </div>
                    ))}

                    <div className="space-y-2">
                      <FieldLabel htmlFor={`${idPrefix}-approval-mode`}>
                        Approval mode
                      </FieldLabel>
                      <Select
                        value={approvalMode}
                        onValueChange={(next) =>
                          setApprovalMode(next as ApprovalMode)
                        }
                        disabled={submitting}
                      >
                        <SelectTrigger
                          id={`${idPrefix}-approval-mode`}
                          className="h-11 w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AUTO">AUTO</SelectItem>
                          <SelectItem value="MANUAL_REVIEW">
                            MANUAL_REVIEW
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {input.draft.approvalMode === null
                          ? "No preference stated — defaulting to AUTO. "
                          : ""}
                        AUTO: policy decides automatically · MANUAL_REVIEW: ask
                        me before executing.
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t px-5 py-4 sm:px-6">
          {missingHelper ? (
            <p role="status" className="mb-3 text-[12px] text-review">
              {missingHelper}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Confirming creates immutable version 1 and activates this mandate.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="h-11 font-data text-[11px] uppercase tracking-[0.14em] sm:w-auto"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 font-data text-[11px] uppercase tracking-[0.14em] sm:w-auto"
                onClick={() => void handleConfirm()}
                disabled={!canConfirm}
              >
                {submitting ? (
                  <>
                    <Loader2
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                    ACTIVATING…
                  </>
                ) : (
                  "CONFIRM MANDATE"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
