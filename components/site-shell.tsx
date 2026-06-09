"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, Package, PanelLeft, ScanSearch, TrendingUp, ShieldCheck, Compass, Sparkles, Gamepad2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/products", label: "Products", icon: Package },
  { href: "/trends", label: "Trends", icon: ScanSearch, TrendingUp },
  { href: "/predict", label: "Predictions", icon: TrendingUp },
  { href: "/brands", label: "Brands", icon: ShieldCheck },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/style-quiz", label: "Style Quiz", icon: Sparkles },
  { href: "/game", label: "Trend Oracle", icon: Gamepad2 },
  { href: "/outfit-upload", label: "Style Guide", icon: Camera },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/") {
    return <>{children}</>;
  }

  if (pathname === "/signin") {
    return <>{children}</>;
  }

  if (
    pathname === "/discover" ||
    pathname.startsWith("/discover/") ||
    pathname === "/trends" ||
    pathname === "/trends/predictions" ||
    pathname === "/predict" ||
    pathname === "/article" ||
    pathname === "/style" ||
    pathname === "/wardrobe" ||
    pathname === "/outfit-upload"
  ) {
    return <div className="pt-[52px]">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-bg pt-[52px] text-text">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-[#f2ece2] px-6 py-6 lg:flex lg:flex-col">
          <div className="mb-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface shadow-soft">
                <PanelLeft className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                  Fashion Trend
                </p>
                <p className="text-lg font-semibold">Intelligence</p>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
              Keyword-based market monitoring for fashion ecommerce teams.
            </p>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                    active
                      ? "border-accent/20 bg-accentSoft text-accent shadow-soft"
                      : "border-transparent text-muted hover:border-border hover:bg-surface hover:text-text",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-3xl border border-border bg-surface p-5 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Phase 1</p>
            <p className="mt-2 text-sm leading-6 text-text">
              Scraping, storage, and keyword analytics without AI.
            </p>
          </div>
        </aside>

        <main className="flex-1 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1280px]">
            <div className="mb-4 rounded-3xl border border-border bg-surface p-3 shadow-soft lg:hidden">
              <div className="mb-3 flex items-center gap-3 px-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-bg">
                  <PanelLeft className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Fashion Trend</p>
                  <p className="text-sm font-semibold">Intelligence</p>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "inline-flex min-w-max items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition",
                        active
                          ? "border-accent/20 bg-accentSoft text-accent"
                          : "border-border bg-bg text-muted",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
