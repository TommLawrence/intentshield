import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <ShieldAlert aria-hidden="true" className="size-6 text-block" />
      <p className="mt-4 font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        404 / OUTSIDE THE BOUNDARY
      </p>
      <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        This route was never authorized.
      </h1>
      <Button
        asChild
        variant="outline"
        className="mt-8 h-11 font-data text-[11px] uppercase tracking-[0.14em]"
      >
        <Link href="/">RETURN TO /</Link>
      </Button>
    </div>
  );
}
