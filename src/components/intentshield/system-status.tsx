"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MonoLabel, SectionHeading } from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";

/**
 * Health contract served by the orchestrator's `GET /api/health` route.
 * This UI never fabricates a state that the endpoint did not report.
 */
interface HealthResponse {
  status: "ok" | "degraded" | "error";
  service: "intentshield";
  phase: string;
  database: { connected: boolean };
  paypal: { configured: boolean; environment: "SANDBOX" | "LIVE" };
  ai: { provider: string; model: string };
  policyEngine: { version: string; rules: number };
  timestamp: string;
}

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; data: HealthResponse }
  | { kind: "error" };

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<HealthResponse>;
  return (
    typeof candidate.database === "object" &&
    candidate.database !== null &&
    typeof candidate.database.connected === "boolean" &&
    typeof candidate.paypal === "object" &&
    candidate.paypal !== null &&
    typeof candidate.paypal.configured === "boolean" &&
    (candidate.paypal.environment === "SANDBOX" ||
      candidate.paypal.environment === "LIVE") &&
    typeof candidate.ai === "object" &&
    candidate.ai !== null &&
    typeof candidate.ai.provider === "string" &&
    typeof candidate.ai.model === "string" &&
    typeof candidate.policyEngine === "object" &&
    candidate.policyEngine !== null &&
    typeof candidate.policyEngine.version === "string" &&
    typeof candidate.policyEngine.rules === "number"
  );
}

function useHealth() {
  const [state, setState] = React.useState<HealthState>({ kind: "loading" });

  const load = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/health", {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Health endpoint answered ${response.status}`);
      }
      const payload: unknown = await response.json();
      if (!isHealthResponse(payload)) {
        throw new Error("Health payload did not match the documented contract");
      }
      setState({ kind: "ok", data: payload });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { state, retry: load };
}

type PillState = {
  label: string;
  className: string;
  pulsing: boolean;
};

function pillState(state: HealthState): PillState {
  switch (state.kind) {
    case "loading":
      return {
        label: "CHECKING",
        className: "border-border text-muted-foreground",
        pulsing: true,
      };
    case "error":
      return {
        label: "UNREACHABLE",
        className: "border-block/40 text-block",
        pulsing: false,
      };
    case "ok":
      switch (state.data.status) {
        case "ok":
          return {
            label: "OPERATIONAL",
            className: "border-allow/40 text-allow",
            pulsing: false,
          };
        case "degraded":
          return {
            label: "DEGRADED",
            className: "border-review/50 text-review",
            pulsing: false,
          };
        default:
          return {
            label: "FAULT",
            className: "border-block/40 text-block",
            pulsing: false,
          };
      }
  }
}

/** Compact live status indicator shown in the header; links to #status. */
export function SystemStatusPill() {
  const { state } = useHealth();
  const pill = pillState(state);

  return (
    <a
      href="#status"
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-md border bg-card/60 px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        pill.className
      )}
      aria-label={`System status: ${pill.label.toLowerCase()}. View integration state.`}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-current",
          pill.pulsing && "animate-pulse"
        )}
      />
      <span className="font-data text-[10px] font-medium uppercase tracking-[0.14em]">
        {pill.label}
      </span>
    </a>
  );
}

function StatusRow({
  label,
  sublabel,
  value,
  valueClassName,
  hint,
}: {
  label: string;
  sublabel?: string;
  value: string;
  valueClassName?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="font-data text-[11px] uppercase tracking-[0.16em] text-foreground">
          {label}
        </p>
        {sublabel ? (
          <p className="mt-1 font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {sublabel}
          </p>
        ) : null}
      </div>
      <div className="sm:shrink-0 sm:text-right">
        <p
          className={cn(
            "font-data text-[12px] tracking-[0.08em] text-foreground",
            valueClassName
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function StatusRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 border-b px-4 py-3.5 last:border-b-0">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

function formatCheckedAt(timestamp: string): string | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(11, 19);
}

export default function SystemStatus() {
  const { state, retry } = useHealth();

  return (
    <section id="status" aria-labelledby="status-title" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading
            id="status-title"
            eyebrow="04 / SYSTEM STATUS"
            title="Integration state, honestly reported"
            description="IntentShield never fakes a PayPal response. Unconfigured means unavailable."
          />
        </Reveal>

        <Reveal className="mt-10">
          <div className="overflow-hidden rounded-md border bg-card">
            {state.kind === "loading" ? (
              <div role="status" aria-label="Checking system status">
                <StatusRowSkeleton />
                <StatusRowSkeleton />
                <StatusRowSkeleton />
                <StatusRowSkeleton />
              </div>
            ) : null}

            {state.kind === "error" ? (
              <div className="flex flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div>
                  <p className="font-data text-[11px] uppercase tracking-[0.16em] text-block">
                    HEALTH ENDPOINT UNREACHABLE
                  </p>
                  <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-muted-foreground">
                    The status endpoint did not answer. No state is simulated —
                    what you see is what exists.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0 font-data text-[11px] uppercase tracking-[0.14em]"
                  onClick={() => void retry()}
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  RETRY
                </Button>
              </div>
            ) : null}

            {state.kind === "ok" ? (
              <div>
                <StatusRow
                  label="DATABASE"
                  sublabel="PRISMA / SQLITE"
                  value={state.data.database.connected ? "CONNECTED" : "UNREACHABLE"}
                  valueClassName={
                    state.data.database.connected
                      ? "text-allow"
                      : "text-block"
                  }
                />
                <StatusRow
                  label="POLICY ENGINE"
                  value={`${state.data.policyEngine.version} · ${state.data.policyEngine.rules} RULES`}
                />
                <StatusRow
                  label="PAYPAL SANDBOX"
                  value={
                    state.data.paypal.configured
                      ? `CONFIGURED · ${state.data.paypal.environment}`
                      : "NOT CONFIGURED"
                  }
                  valueClassName={
                    state.data.paypal.configured
                      ? "text-allow"
                      : "text-review"
                  }
                  hint={
                    state.data.paypal.configured
                      ? undefined
                      : "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env — execution stays honestly unavailable until then"
                  }
                />
                <StatusRow
                  label="AI PROVIDER"
                  value={`${state.data.ai.provider} · ${state.data.ai.model}`}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex min-h-[14px] items-center">
            {state.kind === "ok" ? (
              <MonoLabel className="text-[10px] tracking-[0.14em]">
                {`CHECKED ${formatCheckedAt(state.data.timestamp) ?? "—"} UTC`}
              </MonoLabel>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
