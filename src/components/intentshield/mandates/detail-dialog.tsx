"use client";

import * as React from "react";
import { Ban, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  MANDATE_EVENT_TYPES,
  type MandateDetailResponse,
  type MandateStatus,
  type MandateVersionSummary,
  type NormalizedMandateDraft,
} from "@/lib/mandates/types";
import {
  FieldRow,
  MandateStatusBadge,
  apiFetch,
  formatApiErrorText,
  formatUtc,
} from "@/components/intentshield/mandates/shared";

const LIST_HELPER =
  "Comma-separated values are shown joined; “Unrestricted” / “None” mean the constraint was not set.";

function approvalModeText(mode: string): string {
  return mode === "MANUAL_REVIEW"
    ? "MANUAL_REVIEW — ask me before executing"
    : "AUTO — policy decides automatically";
}

function listOrDash(
  values: string[] | null,
  emptyText: string
): string {
  if (!values || values.length === 0) {
    return emptyText;
  }
  return values.join(", ");
}

/** Read-only rows for a confirmed, immutable version. */
function VersionRows({ version }: { version: MandateVersionSummary }) {
  return (
    <dl>
      <FieldRow
        label="Maximum spend"
        value={formatMoney(version.maxTotal, version.currency)}
        valueClassName="font-data text-[13px] font-medium"
      />
      <FieldRow label="Currency" value={version.currency} />
      <FieldRow
        label="Shipping limit"
        value={
          version.maxShipping !== null
            ? formatMoney(version.maxShipping, version.currency)
            : "Not specified"
        }
      />
      <FieldRow
        label="Recurring payments"
        value={version.allowRecurring ? "Allowed" : "Not allowed"}
      />
      <FieldRow
        label="Condition"
        value={version.allowRefurbished ? "Refurbished allowed" : "New items only"}
      />
      <FieldRow label="Purchase type" value={version.purchaseType} />
      <FieldRow label="Maximum quantity" value={String(version.maxQuantity)} />
      <FieldRow
        label="Categories allowed"
        value={listOrDash(version.allowedCategories, "Unrestricted")}
      />
      <FieldRow
        label="Categories blocked"
        value={listOrDash(version.blockedCategories, "None")}
      />
      <FieldRow
        label="Merchants allowed"
        value={listOrDash(version.allowedMerchants, "Unrestricted")}
      />
      <FieldRow
        label="Merchants blocked"
        value={listOrDash(version.blockedMerchants, "None")}
      />
      <FieldRow label="Approval mode" value={approvalModeText(version.approvalMode)} />
      <FieldRow label="Valid from" value={formatUtc(version.validFrom)} />
      <FieldRow label="Valid until" value={formatUtc(version.validUntil)} />
      <FieldRow label="Created" value={formatUtc(version.createdAt)} />
    </dl>
  );
}

/** Read-only rows for an unconfirmed draft (safety path — usually reviewed instead). */
function DraftRows({ draft }: { draft: NormalizedMandateDraft }) {
  return (
    <dl>
      <FieldRow
        label="Currency"
        value={draft.currency ?? "Not determined"}
        valueClassName={draft.currency ? undefined : "text-review"}
      />
      <FieldRow
        label="Maximum total spend"
        value={
          draft.maxTotal !== null && draft.currency
            ? formatMoney(draft.maxTotal, draft.currency)
            : "Not determined"
        }
        valueClassName={draft.maxTotal !== null ? undefined : "text-review"}
      />
      <FieldRow
        label="Shipping limit"
        value={
          draft.maxShipping !== null && draft.currency
            ? formatMoney(draft.maxShipping, draft.currency)
            : "Not specified"
        }
      />
      <FieldRow
        label="Recurring payments"
        value={draft.allowRecurring ? "Allowed" : "Not allowed"}
      />
      <FieldRow
        label="Condition"
        value={draft.allowRefurbished ? "Refurbished allowed" : "New items only"}
      />
      <FieldRow label="Purchase type" value={draft.purchaseType} />
      <FieldRow label="Maximum quantity" value={String(draft.maxQuantity)} />
      <FieldRow
        label="Validity"
        value={
          draft.validityDays !== null
            ? `${draft.validityDays} days`
            : "Not stated — 30-day default"
        }
      />
      <FieldRow
        label="Categories allowed"
        value={listOrDash(draft.allowedCategories, "Unrestricted")}
      />
      <FieldRow
        label="Categories blocked"
        value={listOrDash(draft.blockedCategories, "None")}
      />
      <FieldRow
        label="Merchants allowed"
        value={listOrDash(draft.allowedMerchants, "Unrestricted")}
      />
      <FieldRow
        label="Merchants blocked"
        value={listOrDash(draft.blockedMerchants, "None")}
      />
      <FieldRow
        label="Approval mode"
        value={
          draft.approvalMode
            ? approvalModeText(draft.approvalMode)
            : "Not stated — AUTO default"
        }
      />
    </dl>
  );
}

function versionBadgeLabel(status: MandateStatus, isCurrent: boolean): string {
  if (!isCurrent) {
    return "SUPERSEDED";
  }
  return status;
}

/**
 * Block heading in the house mono micro-label style, as a semantic h3.
 * (primitives' MonoLabel only ships p/span/div — this file needs headings)
 */
function BlockHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      id={id}
      className="font-data text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
    >
      {children}
    </h3>
  );
}

const AUDIT_EVENT_TINTS: { match: string; className: string }[] = [
  {
    match: MANDATE_EVENT_TYPES.CONFIRMED,
    className: "text-allow",
  },
  {
    match: MANDATE_EVENT_TYPES.VERSION_CREATED,
    className: "text-allow",
  },
  {
    match: MANDATE_EVENT_TYPES.REVOKED,
    className: "text-block",
  },
  {
    match: MANDATE_EVENT_TYPES.EXTRACTION_FAILED,
    className: "text-block",
  },
  {
    match: MANDATE_EVENT_TYPES.CLARIFICATION_REQUESTED,
    className: "text-review",
  },
];

function auditTint(eventType: string): string {
  return (
    AUDIT_EVENT_TINTS.find((entry) => entry.match === eventType)?.className ??
    "text-muted-foreground"
  );
}

export function MandateDetailDialog({
  detail,
  open,
  onClose,
  onChanged,
}: {
  detail: MandateDetailResponse;
  open: boolean;
  onClose: () => void;
  /** Ask the parent to refresh the list (e.g. after revocation). */
  onChanged: () => void;
}) {
  // Local copy so a revocation can update the open dialog without remount.
  const [current, setCurrent] = React.useState<MandateDetailResponse>(detail);
  React.useEffect(() => {
    setCurrent(detail);
  }, [detail]);

  const [confirmRevoke, setConfirmRevoke] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);

  const description =
    current.status === "ACTIVE"
      ? `This mandate is active — version ${current.currentVersion} is the authorization the policy engine enforces.`
      : current.status === "REVOKED"
        ? "This mandate was revoked and no longer authorizes anything. Its versions and audit trail remain on record."
        : current.status === "EXPIRED"
          ? "This mandate has passed its validity window and no longer authorizes anything."
          : "This mandate is still a draft — nothing is authorized until it is confirmed.";

  async function handleRevoke() {
    if (revoking) {
      return;
    }
    setRevoking(true);
    try {
      const updated = await apiFetch<MandateDetailResponse>(
        `/api/mandates/${current.id}/revoke`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setCurrent(updated);
      setConfirmRevoke(false);
      onChanged();
      toast.success("Mandate revoked. History preserved.");
    } catch (err) {
      setConfirmRevoke(false);
      toast.error(formatApiErrorText(err, "Could not revoke this mandate."));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="top-[50%] flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-3xl translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b px-4 py-3 sm:gap-2 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center gap-2 pr-11">
            <MandateStatusBadge status={current.status} />
            <span className="font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {`V${current.currentVersion}`}
            </span>
          </div>
          <DialogTitle className="pr-11 font-display text-lg font-semibold tracking-tight sm:text-xl">
            {current.title}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-snug">
            {description}
          </DialogDescription>
          <p className="font-data text-[10px] uppercase leading-snug tracking-[0.14em] text-muted-foreground">
            {`MANDATE ${current.id.slice(0, 8)} · CREATED ${formatUtc(
              current.createdAt
            )}`}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:space-y-6 sm:px-6 sm:py-5">
          {/* The human's words — always visible. */}
          <section aria-labelledby={`instruction-${current.id}`}>
            <BlockHeading id={`instruction-${current.id}`}>
              YOUR INSTRUCTION
            </BlockHeading>
            <blockquote className="mt-3 whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-[13px] italic leading-relaxed text-muted-foreground">
              {`“${current.instruction}”`}
            </blockquote>
          </section>

          {/* The authorized terms (or the draft, if it was never confirmed). */}
          <section
            aria-labelledby={`authorized-${current.id}`}
            className="rounded-lg border p-4"
          >
            <BlockHeading id={`authorized-${current.id}`}>
              {current.current
                ? `AUTHORIZED MANDATE (V${current.current.version})`
                : "DRAFT INTERPRETATION"}
            </BlockHeading>

            {current.current ? (
              <div className="mt-2">
                <VersionRows version={current.current} />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <Alert className="border-review/40 bg-review/5 text-review">
                  <ShieldAlert aria-hidden="true" />
                  <AlertTitle className="text-[13px] font-semibold">
                    DRAFT — nothing authorized yet
                  </AlertTitle>
                  <AlertDescription className="text-[13px] leading-relaxed text-muted-foreground">
                    This mandate has not been confirmed, so it cannot authorize
                    any transaction. Its interpretation is shown for review.
                  </AlertDescription>
                </Alert>
                {current.draft ? (
                  <DraftRows draft={current.draft.fields} />
                ) : null}
              </div>
            )}
          </section>

          {/* Immutable version history — v1 first, never deletable. */}
          {current.versions.length > 0 ? (
            <section aria-labelledby={`versions-${current.id}`}>
              <BlockHeading id={`versions-${current.id}`}>
                VERSION HISTORY
              </BlockHeading>
              <ol className="mt-3 overflow-hidden rounded-lg border">
                {current.versions.map((version) => (
                  <li
                    key={version.version}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b px-4 py-3 last:border-b-0"
                  >
                    <span className="font-data text-[11px] font-medium tracking-[0.14em] text-foreground">
                      {`V${version.version}`}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-data text-[10px] font-medium uppercase tracking-[0.14em]",
                        version.isCurrent
                          ? current.status === "ACTIVE"
                            ? "border-allow/40 bg-allow/10 text-allow"
                            : current.status === "REVOKED"
                              ? "border-block/40 bg-block/10 text-block"
                              : "border-review/50 bg-review/10 text-review"
                          : "border-border bg-secondary/40 text-muted-foreground"
                      )}
                    >
                      {versionBadgeLabel(current.status, version.isCurrent)}
                    </Badge>
                    <span className="text-[12px] leading-relaxed text-muted-foreground">
                      {`${formatMoney(version.maxTotal, version.currency)} · ${
                        version.allowRecurring
                          ? "recurring allowed"
                          : "no recurring"
                      } · ${version.purchaseType}`}
                    </span>
                    <span className="ml-auto font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {formatUtc(version.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Append-only audit trail. */}
          <section aria-labelledby={`audit-${current.id}`}>
            <BlockHeading id={`audit-${current.id}`}>
              AUDIT TRAIL
            </BlockHeading>
            {current.audit.length > 0 ? (
              <ol className="mt-3 max-h-40 overflow-y-auto rounded-lg border px-4 py-1">
                {current.audit.map((event) => (
                  <li
                    key={`${event.eventType}-${event.correlationId}-${event.createdAt}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-1.5 last:border-b-0"
                  >
                    <span
                      className={cn(
                        "font-data text-[10px] font-medium uppercase tracking-[0.12em]",
                        auditTint(event.eventType)
                      )}
                    >
                      {event.eventType}
                    </span>
                    <span className="font-data text-[10px] tracking-[0.06em] text-muted-foreground">
                      {`${formatUtc(event.createdAt)} · #${event.correlationId.slice(
                        0,
                        8
                      )}`}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-[13px] text-muted-foreground">
                No audit events recorded.
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {LIST_HELPER}
            </p>
          </section>
        </div>

        <div className="shrink-0 border-t px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
            {current.status === "ACTIVE" ? (
              <AlertDialog
                open={confirmRevoke}
                onOpenChange={setConfirmRevoke}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full border-block/40 text-block hover:bg-block/10 hover:text-block sm:w-auto"
                  >
                    <Ban aria-hidden="true" className="size-4" />
                    REVOKE MANDATE
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke this mandate?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Revocation ends this authorization immediately. The
                      mandate and all its versions remain on record. This
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={revoking}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={(event) => {
                        event.preventDefault();
                        void handleRevoke();
                      }}
                      disabled={revoking}
                    >
                      {revoking ? (
                        <>
                          <Loader2
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                          REVOKING…
                        </>
                      ) : (
                        "REVOKE"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="h-9 shrink-0 px-3 font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              CLOSE
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
