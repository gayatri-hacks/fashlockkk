import { cn, formatPercent } from "@/lib/utils";
import type { TrendRow } from "@/lib/types";

export function TrendCard({ trend }: { trend: TrendRow }) {
  const tone =
    trend.status === "Rising"
      ? "border-success/20 bg-[#eef8f1]"
      : trend.status === "Declining"
        ? "border-danger/20 bg-[#fcf0f0]"
        : "border-border bg-surface";

  return (
    <div className={cn("rounded-3xl border p-5 shadow-soft", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-text">{trend.keyword}</p>
          <p className="mt-1 text-sm text-muted">
            {trend.currentCount} current / {trend.previousCount} previous
          </p>
        </div>
        <span className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-semibold text-text">
          {trend.status}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-[0.16em] text-muted">Week-over-week</p>
        <p className="mt-1 text-2xl font-semibold text-text">{formatPercent(trend.growthPercentage)}</p>
      </div>
    </div>
  );
}
