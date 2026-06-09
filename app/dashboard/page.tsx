import { BarChartPanel } from "@/components/bar-chart";
import { SectionHeader } from "@/components/section-header";
import { StatCard } from "@/components/stat-card";
import { TrendCard } from "@/components/trend-card";
import { loadDashboardData } from "@/lib/data";
import { formatPercent } from "@/lib/utils";

export default async function DashboardPage() {
  const data = await loadDashboardData();
  const maxAveragePrice = Math.max(...data.averagePriceByCategory.map((item) => item.averagePrice), 1);

  const colorsChart = data.commonColors.filter((item) => !["unknown", "s", "na", "n/a", "none", ""].includes(item.color.toLowerCase())).map((item) => ({
    name: item.color,
    value: item.count,
  }));

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Overview"
        title="Fashion trend intelligence dashboard"
        description="Track what is gaining momentum, what is cooling off, and where pricing and brand activity are shifting across fashion ecommerce."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total products scraped" value={data.totalProducts} helper="Across all sources and categories" tone="accent" />
        <StatCard label="Total brands tracked" value={data.totalBrands} helper="Distinct brands seen in catalog data" />
        <StatCard label="Latest scrape status" value={data.latestScrapeStatus.status} helper={`${data.latestScrapeStatus.productsFound} products found`} tone={data.latestScrapeStatus.status === "completed" ? "success" : data.latestScrapeStatus.status === "failed" ? "danger" : "default"} />
        <StatCard
          label="Average trend momentum"
          value={`${data.topRisingTrends.length} keywords`}
          helper="Currently rising in India"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-surface p-5 shadow-soft">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Rising trends</p>
              <h2 className="mt-2 text-xl font-semibold text-text">Top rising keywords</h2>
            </div>
          </div>
          <div className="grid gap-4">
            {data.topRisingTrends.slice(0, 3).map((trend) => (
              <TrendCard key={trend.keyword} trend={trend} />
            ))}
            {data.topRisingTrends.length === 0 ? (
              <p className="text-sm text-muted">No rising trends yet. Run the scraper and trend calculator.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-5 shadow-soft">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Declining trends</p>
            <h2 className="mt-2 text-xl font-semibold text-text">Top declining keywords</h2>
          </div>
          <div className="grid gap-4">
            {data.topDecliningTrends.slice(0, 3).map((trend) => (
              <TrendCard key={trend.keyword} trend={trend} />
            ))}
            {data.topDecliningTrends.length === 0 ? (
              <p className="text-sm text-muted">No declining trends yet.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-surface p-5 shadow-soft">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Colors</p>
            <h2 className="mt-2 text-xl font-semibold text-text">Most common colors</h2>
          </div>
          <BarChartPanel data={colorsChart} xKey="name" yKey="value" />
        </section>

        <section className="rounded-3xl border border-border bg-surface p-5 shadow-soft">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Pricing</p>
            <h2 className="mt-2 text-xl font-semibold text-text">Average price by category</h2>
          </div>
          <div className="space-y-3">
            {data.averagePriceByCategory.map((item) => (
              <div key={item.category} className="rounded-2xl border border-border bg-bg px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium text-text">{item.category}</p>
                  <p className="text-sm font-semibold text-text">₹{Math.round(item.averagePrice).toLocaleString("en-IN")}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ebe4d8]">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min((item.averagePrice / maxAveragePrice) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-border bg-surface p-5 shadow-soft">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Scrape health</p>
          <h2 className="mt-2 text-xl font-semibold text-text">Latest scrape status</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <InfoTile label="Status" value={data.latestScrapeStatus.status} />
          <InfoTile label="Source" value={data.latestScrapeStatus.sourceName ?? "Unknown"} />
          <InfoTile label="Category" value={data.latestScrapeStatus.categoryName ?? "Unknown"} />
          <InfoTile label="Products found" value={String(data.latestScrapeStatus.productsFound)} />
        </div>
        {data.latestScrapeStatus.errorMessage ? (
          <p className="mt-4 rounded-2xl border border-danger/20 bg-[#fcf0f0] px-4 py-3 text-sm text-danger">
            {data.latestScrapeStatus.errorMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg px-4 py-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-text">{value}</p>
    </div>
  );
}
