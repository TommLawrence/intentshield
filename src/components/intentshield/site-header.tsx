"use client";

import * as React from "react";
import { Menu, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SystemStatusPill,
} from "@/components/intentshield/system-status";
import { ThemeToggle } from "@/components/intentshield/theme-toggle";

const NAV_LINKS = [
  { label: "OVERVIEW", href: "#overview" },
  { label: "POLICY CHAIN", href: "#chain" },
  { label: "TRUST BOUNDARY", href: "#trust" },
  { label: "RULES", href: "#rules" },
  { label: "STATUS", href: "#status" },
  { label: "ROADMAP", href: "#roadmap" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 8;
      setScrolled((prev) => (prev === next ? prev : next));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur transition-shadow supports-[backdrop-filter]:bg-background/65 data-[scrolled]:shadow-[0_10px_30px_-16px_rgba(3,8,14,0.65)]"
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <a
          href="#overview"
          className="flex min-h-11 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-card">
            <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            IntentShield
          </span>
        </a>

        <Badge
          variant="outline"
          className="hidden border-review/40 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-review sm:inline-flex"
        >
          SANDBOX PROTOTYPE
        </Badge>

        <nav
          aria-label="Primary"
          className="ml-auto hidden items-center gap-5 lg:flex"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <SystemStatusPill />
          <ThemeToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground hover:text-foreground lg:hidden"
            aria-label="Open navigation menu"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(true)}
          >
            <Menu aria-hidden="true" className="size-5" />
          </Button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[85vw] gap-0 border-border bg-background p-0 sm:max-w-xs"
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="font-data text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              NAVIGATION
            </SheetTitle>
            <SheetDescription className="text-[13px]">
              Jump to any section of this foundation shell.
            </SheetDescription>
          </SheetHeader>
          <nav
            id="mobile-navigation"
            aria-label="Mobile"
            className="flex flex-col px-5"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center border-b py-3 font-data text-[12px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring last:border-b-0"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
