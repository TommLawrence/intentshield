"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="font-data text-[11px] uppercase tracking-[0.18em] text-block">
        SYSTEM FAULT
      </p>
      <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Something failed on this screen
      </h1>
      {error.digest ? (
        <p className="mt-4 font-data text-[11px] tracking-[0.08em] text-muted-foreground">
          FAULT ID: {error.digest}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="mt-8 h-11 font-data text-[11px] uppercase tracking-[0.14em]"
        onClick={() => reset()}
      >
        RETRY
      </Button>
    </div>
  );
}
