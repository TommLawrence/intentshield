"use client";

import * as React from "react";
import { Menu, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SystemStatusPill,
} from "@/components/intentshield/system-status";
import { ThemeToggle } from "@/components/intentshield/theme-toggle";

const NAV_LINKS = [
  { label: "OVERVIEW", href: "#overview" },
  { label: "MANDATES", href: "#mandates" },
  { label: "AGENT", href: "#agent" },
  { label: "LAB", href: "#lab" },
  { label: "LEDGER", href: "#ledger" },
  { label: "RULES", href: "#rules" },
  { label: "STATUS", href: "#status" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = React.useState(false);

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
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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

        <div className="ml-auto flex min-w-0 items-center gap-1 lg:ml-0">
          <SystemStatusPill />
          <ThemeToggle />
          {/* Compact section menu — a popover anchored to the trigger, not a
              full-height drawer. Radix provides the keyboard, focus and
              screen-reader semantics (menu, aria-expanded, typeahead, Esc). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-muted-foreground hover:text-foreground lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu aria-hidden="true" className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-44"
            >
              {NAV_LINKS.map((link) => (
                <DropdownMenuItem key={link.href} asChild>
                  <a
                    href={link.href}
                    className="min-h-9 font-data text-[12px] uppercase tracking-[0.14em] text-muted-foreground data-[highlighted]:text-foreground"
                  >
                    {link.label}
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
