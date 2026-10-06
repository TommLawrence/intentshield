import { NextResponse } from "next/server";

import { MandateApiError } from "@/lib/mandates/service";
import type { MandateApiErrorBody } from "@/lib/mandates/types";

/**
 * Shared API plumbing for route handlers: uniform error bodies, no stack
 * traces, no internals, no secrets (§22). Unknown failures collapse to a
 * generic 500 — the details go to the server log only.
 */

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown
): NextResponse<MandateApiErrorBody> {
  return NextResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status });
}

export function handleRouteError(err: unknown, routeLabel: string): NextResponse<MandateApiErrorBody> {
  if (err instanceof MandateApiError) {
    return jsonError(err.status, err.code, err.message, err.details);
  }
  // Safe logging only — message text, never stack or internals.
  console.error(`[api:${routeLabel}]`, err instanceof Error ? err.message : "unknown error");
  return jsonError(500, "INTERNAL", "Something went wrong on our side. Please try again.");
}

/** Parse a JSON request body, toleracing empty bodies (mapped to null). */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    if (text.trim().length === 0) return null;
    return JSON.parse(text);
  } catch {
    throw new MandateApiError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}
