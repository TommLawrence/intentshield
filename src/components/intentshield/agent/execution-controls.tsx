"use client";

import * as React from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TransactionDetailResponse } from "@/lib/transactions/types";
import {
  ApiError,
  apiFetch,
  formatApiErrorText,
} from "@/components/intentshield/agent/shared";

/**
 * Shared execution / human-review controls — the guarded path to PayPal.
 *
 * Used by the agent console (full variant) and the Payment Intent Record
 * dialog footer (compact variant — the ledger doubles as the review cockpit).
 *
 * BLOCK is structural: a BLOCKED transaction never renders an execute
 * affordance. There is no code path from a BLOCK decision to PayPal.
 */

const NOT_CONFIGURED_HINT =
  "Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env, restart, then retry. IntentShield never fakes PayPal results.";

interface ExecuteResponse {
  transaction: TransactionDetailResponse;
  approveUrl: string | null;
}

type ExecuteError =
  | { kind: "not-configured"; message: string }
  | { kind: "other"; message: string };

export function ExecutionControls({
  transaction,
  onUpdated,
  variant = "full",
}: {
  transaction: TransactionDetailResponse;
  /** Replace the displayed transaction with a fresh server state. */
  onUpdated: (tx: TransactionDetailResponse) => void;
  variant?: "full" | "compact";
}) {
  const compact = variant === "compact";

  const [executing, setExecuting] = React.useState(false);
  const [approving, setApproving] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [executeError, setExecuteError] = React.useState<ExecuteError | null>(
    null
  );
  const [approveUrlOverride, setApproveUrlOverride] = React.useState<
    string | null
  >(null);

  // Reset internal state when a different transaction is displayed.
  React.useEffect(() => {
    setExecuteError(null);
    setApproveUrlOverride(null);
  }, [transaction.id]);

  const busy =
    executing || approving || rejecting || capturing || confirmApprove;
  const approveUrl = approveUrlOverride ?? transaction.paypal?.approveUrl ?? null;
  const warnings = transaction.evaluation?.warnings ?? [];

  async function runExecute(correlationId: string) {
    setExecuteError(null);
    try {
      const data = await apiFetch<ExecuteResponse>(
        `/api/transactions/${transaction.id}/execute`,
        { method: "POST", body: JSON.stringify({ correlationId }) }
      );
      setApproveUrlOverride(data.approveUrl);
      onUpdated(data.transaction);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PAYPAL_NOT_CONFIGURED") {
        setExecuteError({ kind: "not-configured", message: err.message });
      } else {
        setExecuteError({
          kind: "other",
          message: formatApiErrorText(
            err,
            "The guarded executor refused this request."
          ),
        });
      }
    }
  }

  async function handleExecute() {
    setExecuting(true);
    await runExecute(transaction.correlationId);
    setExecuting(false);
  }

  async function handleApproveAndExecute() {
    setApproving(true);
    setExecuteError(null);
    try {
      // 1 — the human gate: explicit approval creates the payment intent.
      const approved = await apiFetch<TransactionDetailResponse>(
        `/api/transactions/${transaction.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "APPROVE",
            correlationId: transaction.correlationId,
          }),
        }
      );
      onUpdated(approved);
      // 2 — immediately send it to the guarded executor on the SAME correlation.
      await runExecute(transaction.correlationId);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PAYPAL_NOT_CONFIGURED") {
        setExecuteError({ kind: "not-configured", message: err.message });
      } else {
        setExecuteError({
          kind: "other",
          message: formatApiErrorText(
            err,
            "The guarded executor refused this request."
          ),
        });
      }
    } finally {
      setApproving(false);
      setConfirmApprove(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    try {
      const rejected = await apiFetch<TransactionDetailResponse>(
        `/api/transactions/${transaction.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "REJECT",
            correlationId: transaction.correlationId,
          }),
        }
      );
      onUpdated(rejected);
      toast.success("Transaction rejected. History preserved.");
    } catch (err) {
      toast.error(formatApiErrorText(err, "Could not reject this transaction."));
    } finally {
      setRejecting(false);
    }
  }

  async function handleCapture() {
    setCapturing(true);
    try {
      const captured = await apiFetch<TransactionDetailResponse>(
        `/api/transactions/${transaction.id}/capture`,
        { method: "POST", body: JSON.stringify({}) }
      );
      onUpdated(captured);
      toast.success("Payment captured — see the Payment Intent Record.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_APPROVED") {
        toast.warning(err.message);
      } else {
        toast.error(
          formatApiErrorText(err, "Could not capture this payment.")
        );
      }
    } finally {
      setCapturing(false);
    }
  }

  /* ── Error alerts (rendered in both variants) ──────────────────────────── */

  const errorAlerts = executeError ? (
    executeError.kind === "not-configured" ? (
      <Alert className="border-review/50 bg-review/5 text-review">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle className="text-[13px] font-semibold">
          PayPal sandbox is not configured — execution stopped honestly
        </AlertTitle>
        <AlertDescription className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <span className="block text-foreground">
            {executeError.message}
          </span>
          <span>{NOT_CONFIGURED_HINT}</span>
        </AlertDescription>
      </Alert>
    ) : (
      <Alert variant="destructive">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle className="text-[13px] font-semibold">
          Execution refused
        </AlertTitle>
        <AlertDescription>{executeError.message}</AlertDescription>
      </Alert>
    )
  ) : null;

  /* ── Compact variant: the PIR footer cockpit ─────────────────────────────── */

  if (compact) {
    if (transaction.status === "BLOCKED") {
      return (
        <span
          aria-label="No execution path — blocked by policy"
          className="inline-flex items-center gap-1.5 rounded-md border border-block/40 bg-block/10 px-2.5 py-1.5 font-data text-[10px] font-medium uppercase tracking-[0.14em] text-block"
        >
          <ShieldAlert aria-hidden="true" className="size-3.5" />
          NO EXECUTION PATH
        </span>
      );
    }
    if (transaction.status !== "IN_REVIEW" && transaction.status !== "EVALUATED") {
      return null;
    }
    return (
      <div className="flex w-full flex-col gap-2.5 sm:w-auto">
        {errorAlerts}
        {transaction.status === "IN_REVIEW" ? (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <AlertDialog
              open={confirmApprove}
              onOpenChange={(next) => !busy && setConfirmApprove(next)}
            >
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={busy}
                  className="h-11 font-data text-[11px] uppercase tracking-[0.14em]"
                >
                  {approving ? (
                    <>
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                      APPROVING…
                    </>
                  ) : (
                    <>
                      <UserCheck aria-hidden="true" className="size-4" />
                      APPROVE &amp; EXECUTE
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <ApproveConfirmation
                warnings={warnings}
                disabled={approving}
                onConfirm={() => void handleApproveAndExecute()}
              />
            </AlertDialog>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleReject()}
              className="h-11 border-block/40 font-data text-[11px] uppercase tracking-[0.14em] text-block hover:bg-block/10 hover:text-block"
            >
              {rejecting ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              REJECT
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void handleExecute()}
            className="h-11 font-data text-[11px] uppercase tracking-[0.14em]"
          >
            {executing ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                EXECUTING…
              </>
            ) : (
              "EXECUTE VIA PAYPAL SANDBOX"
            )}
          </Button>
        )}
      </div>
    );
  }

  /* ── Full variant: the console execution path ───────────────────────────── */

  return (
    <div className="space-y-3">
      {errorAlerts}

      {transaction.status === "EVALUATED" ? (
        <div className="space-y-2.5">
          <Button
            type="button"
            disabled={busy}
            onClick={() => void handleExecute()}
            className="h-11 w-full font-data text-[11px] uppercase tracking-[0.14em] sm:w-auto"
          >
            {executing ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                EXECUTING…
              </>
            ) : (
              <>
                <ExternalLink aria-hidden="true" className="size-4" />
                EXECUTE VIA PAYPAL SANDBOX
              </>
            )}
          </Button>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            The executor re-runs the deterministic policy engine fresh at
            execution time — a stale ALLOW is never enough on its own.
          </p>
        </div>
      ) : null}

      {transaction.status === "IN_REVIEW" ? (
        <div className="space-y-3 rounded-lg border border-review/40 bg-review/5 p-4">
          <p className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-review">
            <UserCheck aria-hidden="true" className="size-4 shrink-0" />
            A HUMAN must decide.
          </p>
          {warnings.length > 0 ? (
            <ul className="space-y-1 text-[13px] leading-relaxed text-muted-foreground">
              {warnings.map((warning) => (
                <li key={warning} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-review" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <AlertDialog
              open={confirmApprove}
              onOpenChange={(next) => !busy && setConfirmApprove(next)}
            >
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={busy}
                  className="h-11 font-data text-[11px] uppercase tracking-[0.14em]"
                >
                  {approving ? (
                    <>
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                      APPROVING…
                    </>
                  ) : (
                    <>
                      <UserCheck aria-hidden="true" className="size-4" />
                      APPROVE &amp; EXECUTE
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <ApproveConfirmation
                warnings={warnings}
                disabled={approving}
                onConfirm={() => void handleApproveAndExecute()}
              />
            </AlertDialog>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleReject()}
              className="h-11 border-block/40 font-data text-[11px] uppercase tracking-[0.14em] text-block hover:bg-block/10 hover:text-block"
            >
              {rejecting ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              REJECT
            </Button>
          </div>
        </div>
      ) : null}

      {transaction.status === "BLOCKED" ? (
        <div className="rounded-lg border border-block/40 bg-block/5 p-4">
          <p className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-block">
            <ShieldAlert aria-hidden="true" className="size-4 shrink-0" />
            NO EXECUTION PATH
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            This transaction violated a hard rule and can never reach PayPal.
            The guarded executor structurally refuses blocked transactions.
          </p>
        </div>
      ) : null}

      {transaction.status === "EXECUTING" ? (
        <div className="space-y-3 rounded-lg border border-review/40 bg-review/5 p-4">
          <p className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-review">
            <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
            AWAITING BUYER APPROVAL
          </p>
          {approveUrl ? (
            <>
              <Button type="button" asChild className="h-11 font-data text-[11px] uppercase tracking-[0.14em]">
                <a href={approveUrl} target="_blank" rel="noreferrer">
                  OPEN PAYPAL BUYER APPROVAL
                  <ExternalLink aria-hidden="true" className="size-4" />
                </a>
              </Button>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Approve as the PayPal sandbox buyer; you will return here and
                the payment captures automatically.
              </p>
            </>
          ) : (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              A PayPal order is pending for this transaction.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void handleCapture()}
            className="h-11 border-review/40 font-data text-[11px] uppercase tracking-[0.14em] text-review hover:bg-review/10 hover:text-review"
          >
            {capturing ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                CAPTURING…
              </>
            ) : (
              "CAPTURE AFTER APPROVAL"
            )}
          </Button>
        </div>
      ) : null}

      {transaction.status === "COMPLETED" ? (
        <div className="rounded-lg border border-allow/40 bg-allow/5 p-4">
          <p className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-allow">
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
            CAPTURED
          </p>
          <p className="mt-1.5 break-all font-data text-[12px] leading-relaxed text-muted-foreground">
            {transaction.paypal?.captureId
              ? `Capture ${transaction.paypal.captureId}`
              : "Capture complete"}
            {transaction.paypal?.environment
              ? ` · ${transaction.paypal.environment}`
              : ""}
            {transaction.paymentIntent?.reference
              ? ` · ${transaction.paymentIntent.reference}`
              : ""}
          </p>
        </div>
      ) : null}

      {transaction.status === "CANCELLED" ? (
        <p className="rounded-lg border border-border bg-secondary/40 p-4 text-[13px] leading-relaxed text-muted-foreground">
          This transaction was cancelled — rejected by the operator. History is
          preserved on the record.
        </p>
      ) : null}

      {transaction.status === "FAILED" ? (
        <p className="rounded-lg border border-border bg-secondary/40 p-4 text-[13px] leading-relaxed text-muted-foreground">
          Execution failed. The full PayPal narrative and audit trail are on
          the Payment Intent Record.
        </p>
      ) : null}

      {transaction.status === "PROPOSED" ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          This proposal has not been evaluated yet.
        </p>
      ) : null}
    </div>
  );
}

/** Human-gate confirmation: quotes the warnings the engine escalated on. */
function ApproveConfirmation({
  warnings,
  disabled,
  onConfirm,
}: {
  warnings: string[];
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Approve this transaction?</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-3 text-[13px] leading-relaxed">
            <p>
              Your approval is recorded on the audit trail and sent to the
              guarded executor. PayPal is only called after the deterministic
              re-check passes — an approval never overrides policy.
            </p>
            {warnings.length > 0 ? (
              <div>
                <p className="font-data text-[10px] uppercase tracking-[0.14em] text-review">
                  The engine escalated because:
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {warnings.map((warning) => (
                    <li
                      key={warning}
                      className={cn(
                        "flex gap-2 rounded-md border border-review/30 bg-review/5 p-2",
                        "text-[12px] leading-relaxed text-muted-foreground"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-1 shrink-0 rounded-full bg-review"
                      />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>
                No specific warnings were recorded — a human was required by
                mandate policy.
              </p>
            )}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={disabled}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={(event) => {
            event.preventDefault();
            onConfirm();
          }}
          disabled={disabled}
        >
          <ShieldCheck aria-hidden="true" className="size-4" />
          APPROVE &amp; EXECUTE
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
