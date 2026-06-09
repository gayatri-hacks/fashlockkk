import type { ReactNode } from "react";

export function FiltersBar({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-soft">{children}</div>;
}
