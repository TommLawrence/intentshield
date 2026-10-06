"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { MandateApiErrorBody, MandateStatus } from "@/lib/mandates/types";

/**
 * Shared client-side helpers for the Mandate Console.
 *
 * Money convention: API amounts are INTEGER MINOR UNITS (cents). Humans edit
 * major units in the UI and the server re-normalizes deterministically — the
 * client never computes policy, it only formats for display.
 */

/** Typed error carrying the stable API error code (and details when present). */
export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Minimal JSON fetch wrapper for the frozen mandate API contract.
 * Errors are ALWAYS rethrown as ApiError with the body's code/message.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...init,
      headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError("NETWORK", "Could not reach the IntentShield service.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = body as MandateApiErrorBody | null;
    const error =
      errorBody && typeof errorBody === "object" && "error" in errorBody
        ? errorBody.error
        : null;
    throw new ApiError(
      error?.code ?? "UNKNOWN",
      error?.message ?? `The service answered ${response.status}.`,
      error?.details
    );
  }
  return body as T;
}

/** String details from an API error's `details` field (arrays joined later). */
function stringDetails(details: unknown): string[] {
  if (Array.isArray(details)) {
    return details.filter((item): item is string => typeof item === "string");
  }
  if (typeof details === "string") {
    return [details];
  }
  return [];
}

/** Human-safe error text for toasts/alerts — never raw objects or stacks. */
export function formatApiErrorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const details = stringDetails(err.details);
    const detailText =
      details.length > 0 ? ` (${details.join(" · ")})` : "";
    const text = `${err.message}${detailText}`.trim();
    return text.length > 0 ? text : fallback;
  }
  return fallback;
}

/** `"2026-10-06T14:50:38.461Z"` → `"2026-10-06 14:50:38 UTC"`. */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/** Date-only variant for compact list rows. */
export function formatDateUtc(iso: string): string {
  return formatUtc(iso).slice(0, 10);
}

/** Minor units → major-unit input value: 90000 → "900", 4050 → "40.5". */
export function minorToMajorInput(minor: number): string {
  return (minor / 100).toString();
}

/** Acceptable major-unit amount: up to 9 integer digits, up to 2 decimals. */
export const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

/** Whole-day validity pattern (1+). */
export const DAYS_PATTERN = /^\d+$/;

/** Parse a comma-separated constraint input into an array (null when empty). */
export function parseCommaList(text: string): string[] | null {
  const items = text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : null;
}

const MANDATE_STATUS_STYLES: Record<MandateStatus, string> = {
  DRAFT: "border-review/50 bg-review/10 text-review",
  ACTIVE: "border-allow/40 bg-allow/10 text-allow",
  REVOKED: "border-block/40 bg-block/10 text-block",
  EXPIRED: "border-border bg-secondary/40 text-muted-foreground",
};

/** Lifecycle status badge — amber draft, emerald active, rose revoked. */
export function MandateStatusBadge({
  status,
  className,
}: {
  status: MandateStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-data text-[10px] font-medium uppercase tracking-[0.14em]",
        MANDATE_STATUS_STYLES[status],
        className
      )}
    >
      {status}
    </Badge>
  );
}

/** Definition-list row: mono micro-label left, value right (stacked on mobile). */
export function FieldRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 font-data text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "text-[13px] leading-relaxed text-foreground sm:text-right",
          valueClassName
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Form label in the house mono micro-label style, with a required marker. */
export function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
    >
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="ml-1 text-review">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      ) : null}
    </Label>
  );
}
