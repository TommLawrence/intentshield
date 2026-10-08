import { NextResponse } from "next/server";

// Service root: honest identity for API consumers.
// System health lives at /api/health.
export async function GET() {
  return NextResponse.json({
    service: "intentshield",
    phase: "1-foundation",
    health: "/api/health",
  });
}
