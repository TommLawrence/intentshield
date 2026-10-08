"use client";

import * as React from "react";
import { toast } from "sonner";

import type {
  TransactionDetailResponse,
  TransactionListItem,
} from "@/lib/transactions/types";
import {
  ApiError,
  apiFetch,
  formatApiErrorText,
} from "@/components/intentshield/agent/shared";
import { dispatchLedgerRefresh } from "@/components/intentshield/ledger/shared";

/**
 * PayPal buyer-approval return handler — renders nothing.
 *
 * When the guarded executor sends the buyer to PayPal, the return URL carries
 * `?intent=<paymentIntentId>`. On mount this component looks for it, asks the
 * ledger for the matching transaction, captures the payment and tells the
 * ledger to refresh. `?intent-cancelled` means the buyer backed out — nothing
 * was charged. The URL is always cleaned afterwards.
 */
export function ReturnHandler() {
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intentId = params.get("intent");
    const cancelled = params.has("intent-cancelled");

    if (!intentId && !cancelled) {
      return;
    }
    // Clean the URL first — a refresh must not re-trigger the capture.
    window.history.replaceState({}, "", window.location.pathname);

    if (cancelled) {
      toast.info("Buyer cancelled the PayPal approval. Nothing was charged.");
      return;
    }
    if (!intentId) {
      return;
    }

    const controller = new AbortController();
    let settled = false;

    async function captureReturn() {
      toast.info("Buyer approval received — capturing the payment…");
      try {
        const list = await apiFetch<{ transactions: TransactionListItem[] }>(
          "/api/transactions",
          { signal: controller.signal }
        );
        const row = list.transactions.find(
          (item) => item.paymentIntent?.id === intentId
        );
        if (!row) {
          toast.error(
            "Could not find the returning payment intent in the ledger."
          );
          return;
        }
        const captured = await apiFetch<TransactionDetailResponse>(
          `/api/transactions/${row.id}/capture`,
          {
            method: "POST",
            body: JSON.stringify({}),
            signal: controller.signal,
          }
        );
        settled = true;
        if (captured.status === "COMPLETED") {
          toast.success("Payment captured — see the Payment Intent Record.");
        } else {
          toast.info(
            "Capture returned — open the Payment Intent Record for the outcome."
          );
        }
        dispatchLedgerRefresh();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (err instanceof ApiError && err.code === "NOT_APPROVED") {
          toast.warning(err.message);
        } else {
          toast.error(
            formatApiErrorText(err, "Could not capture the returning payment.")
          );
        }
      }
    }

    void captureReturn();

    return () => {
      if (!settled) {
        controller.abort();
      }
    };
  }, []);

  return null;
}
