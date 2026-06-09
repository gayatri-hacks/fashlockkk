import { cn, formatCurrency, formatPercent } from "@/lib/utils";

export function StatCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: "default" | "accent" | "success" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border bg-surface p-5 shadow-soft",
        tone === "accent" && "border-accent/20 bg-[#eef0ff]",
        tone === "success" && "border-success/20 bg-[#eef8f1]",
        tone === "danger" && "border-danger/20 bg-[#fcf0f0]",
      )}
    >
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-text">{value}</p>
      {helper ? <p className="mt-2 text-sm text-muted">{helper}</p> : null}
    </div>
  );
}

export function MetricValue({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

export function PercentValue({ value }: { value: number }) {
  return <span>{formatPercent(value)}</span>;
}
