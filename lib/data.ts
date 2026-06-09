import { buildBrandRows, buildDashboardStats, buildScrapeSummary, buildTrendRows, buildTrendSeries, toProductRows } from "@/lib/analytics";
import { mockDataset } from "@/lib/mock-data";
import { getSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import type { ProductFiltersInput } from "@/lib/schemas";
import { unstable_cache } from "next/cache";
import type {
  BrandRow,
  DashboardStats,
  ProductRow,
  ScrapeSummary,
  TrendRow,
} from "@/lib/types";

type LiveDataset = typeof mockDataset;

const PRODUCT_PAGE_SIZE = 20;
const REFERENCE_PAGE_SIZE = 100;
const SCRAPE_RUN_PAGE_SIZE = 20;
const SNAPSHOT_PAGE_SIZE = 100;
const PREDICTION_PAGE_SIZE = 20;

async function loadLiveDataset(): Promise<LiveDataset | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !hasSupabaseEnv()) {
    return null;
  }

  const [productsRes, sourcesRes, categoriesRes, scrapeRunsRes, trendKeywordsRes, trendSnapshotsRes] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, source_id, category_id, title, brand, price, original_price, discount_percentage, color, image_url, product_url, scraped_at, created_at")
        .order("scraped_at", { ascending: false })
        .range(0, PRODUCT_PAGE_SIZE - 1),
      supabase
        .from("sources")
        .select("id, name, base_url, created_at")
        .order("created_at", { ascending: true })
        .range(0, REFERENCE_PAGE_SIZE - 1),
      supabase
        .from("categories")
        .select("id, name, created_at")
        .order("created_at", { ascending: true })
        .range(0, REFERENCE_PAGE_SIZE - 1),
      supabase
        .from("scrape_runs")
        .select("id, source_id, category_id, status, started_at, completed_at, products_found, error_message")
        .order("started_at", { ascending: false })
        .range(0, SCRAPE_RUN_PAGE_SIZE - 1),
      supabase
        .from("trend_keywords")
        .select("id, keyword, category, created_at")
        .order("created_at", { ascending: true })
        .range(0, REFERENCE_PAGE_SIZE - 1),
      supabase
        .from("trend_snapshots")
        .select("id, keyword_id, source_id, category_id, product_count, snapshot_date, previous_count, growth_percentage, status")
        .order("snapshot_date", { ascending: false })
        .range(0, SNAPSHOT_PAGE_SIZE - 1),
    ]);

  if (
    productsRes.error ||
    sourcesRes.error ||
    categoriesRes.error ||
    scrapeRunsRes.error ||
    trendKeywordsRes.error ||
    trendSnapshotsRes.error
  ) {
    return null;
  }

  return {
    sources: sourcesRes.data ?? [],
    categories: categoriesRes.data ?? [],
    products: productsRes.data ?? [],
    scrapeRuns: scrapeRunsRes.data ?? [],
    trendKeywords: trendKeywordsRes.data ?? [],
    trendSnapshots: trendSnapshotsRes.data ?? [],
  };
}

const loadCachedLiveDataset = unstable_cache(loadLiveDataset, ["live-dataset-v2"], {
  revalidate: 12 * 60 * 60,
  tags: ["products", "trends", "dashboard"],
});

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return Promise.race<T | null>([
    promise.catch(() => null),
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function getDataset() {
  return (await withTimeout(loadCachedLiveDataset(), 3500)) ?? mockDataset;
}

function filterProducts(products: ProductRow[], filters: ProductFiltersInput) {
  const search = filters.search.trim().toLowerCase();
  return products.filter((product) => {
    const matchesSearch =
      !search ||
      [product.title, product.brand, product.source, product.category, product.color]
        .join(" ")
        .toLowerCase()
        .includes(search);
    const matchesSource = !filters.source || product.source === filters.source;
    const matchesBrand = !filters.brand || product.brand === filters.brand;
    const matchesCategory = !filters.category || product.category === filters.category;
    const matchesColor = !filters.color || product.color === filters.color;

    return matchesSearch && matchesSource && matchesBrand && matchesCategory && matchesColor;
  });
}

export async function loadDashboardData(): Promise<DashboardStats> {
  const dataset = await getDataset();
  return buildDashboardStats(dataset);
}

export async function loadProductsData(filters: ProductFiltersInput): Promise<ProductRow[]> {
  const dataset = await getDataset();
  const rows = toProductRows(dataset.products, dataset.sources, dataset.categories);
  return filterProducts(rows, filters);
}

export async function loadTrendsData(weeks = 6): Promise<{
  trendRows: TrendRow[];
  chart: ReturnType<typeof buildTrendSeries>;
}> {
  const dataset = await getDataset();

  // Use pre-calculated snapshots from Python trend engine (includes Google Trends signal).
  // Fall back to live calculation only if snapshots table is empty.
  let trendRows: TrendRow[];
  if (dataset.trendSnapshots && dataset.trendSnapshots.length > 0) {
    // Aggregate snapshots: for each keyword pick the latest snapshot with highest product_count
    const snapshotMap = new Map<string, TrendRow>();
    for (const snap of dataset.trendSnapshots) {
      const kw = dataset.trendKeywords.find((k) => k.id === snap.keyword_id);
      if (!kw) continue;
      const existing = snapshotMap.get(kw.keyword);
      const snapGrowth = snap.growth_percentage ?? 0;
      if (!existing || snapGrowth > (existing.growthPercentage ?? 0)) {
        snapshotMap.set(kw.keyword, {
          keyword: kw.keyword,
          currentCount: snap.product_count ?? 0,
          previousCount: snap.previous_count ?? 0,
          growthPercentage: snapGrowth,
          status: (snap.status as "Rising" | "Stable" | "Declining") ?? "Stable",
        });
      }

    }
    trendRows = [...snapshotMap.values()].sort((a, b) => b.growthPercentage - a.growthPercentage);
  } else {
    trendRows = buildTrendRows(dataset.products, dataset.trendKeywords);
  }

  return {
    trendRows,
    chart: buildTrendSeries(dataset.products, dataset.trendKeywords, weeks),
  };
}

export async function loadBrandsData(): Promise<BrandRow[]> {
  const dataset = await getDataset();
  return buildBrandRows(dataset.products, dataset.categories);
}

export async function loadScrapeSummary(): Promise<ScrapeSummary> {
  const dataset = await getDataset();
  const latestRun = dataset.scrapeRuns[0];
  return buildScrapeSummary(
    dataset.scrapeRuns,
    dataset.sources.find((source) => source.id === latestRun?.source_id)?.name,
    dataset.categories.find((category) => category.id === latestRun?.category_id)?.name,
  );
}

export async function loadFilters() {
  const dataset = await getDataset();
  const products = toProductRows(dataset.products, dataset.sources, dataset.categories);

  const unique = (key: "source" | "brand" | "category" | "color") =>
    [...new Set(products.map((item) => item[key]).filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b));

  return {
    sources: unique("source"),
    brands: unique("brand"),
    categories: unique("category"),
    colors: unique("color").filter((color) => color.toLowerCase() !== "unknown"),
  };
}

async function loadPredictionsDataUncached() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("trend_predictions")
    .select("keyword, projected_india_score, confidence_score, estimated_lag_months, arrival_date, best_predictor_market, status")
    .order("projected_india_score", { ascending: false })
    .range(0, PREDICTION_PAGE_SIZE - 1);

  if (error) return [];
  return data ?? [];
}

async function loadForecastDataUncached() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("trend_forecasts")
    .select("keyword, predicted_score, forecast_date, lower_bound, upper_bound")
    .gte("forecast_date", new Date().toISOString().split("T")[0])
    .order("predicted_score", { ascending: false })
    .range(0, PREDICTION_PAGE_SIZE - 1);

  if (error) return [];
  return data ?? [];
}

export const loadPredictionsData = unstable_cache(loadPredictionsDataUncached, ["trend-predictions-v2"], {
  revalidate: 12 * 60 * 60,
  tags: ["trends"],
});

export const loadForecastData = unstable_cache(loadForecastDataUncached, ["trend-forecasts-v2"], {
  revalidate: 12 * 60 * 60,
  tags: ["trends"],
});
