"use client";

import * as React from "react";

export default function GlobalError({
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
    <html lang="en" style={{ background: "#0b0f15" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          textAlign: "center",
          background: "#0b0f15",
          color: "#e8edf2",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#f0616e",
          }}
        >
          SYSTEM FAULT
        </p>
        <h1
          style={{
            margin: "12px 0 0",
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            fontFamily:
              "'Space Grotesk', system-ui, -apple-system, sans-serif",
          }}
        >
          Something failed on this screen
        </h1>
        {error.digest ? (
          <p
            style={{
              margin: "16px 0 0",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: "#7d8b9c",
            }}
          >
            FAULT ID: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: 32,
            minHeight: 44,
            padding: "0 20px",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#e8edf2",
            background: "transparent",
            border: "1px solid #1e2937",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          RETRY
        </button>
      </body>
    </html>
  );
}
