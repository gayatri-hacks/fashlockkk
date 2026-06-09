import { addDays, format, startOfWeek, subWeeks } from "date-fns";
import type {
  BrandRow,
  CategoryRecord,
  DashboardStats,
  ProductRecord,
  ProductRow,
  ScrapeRunRecord,
  ScrapeSummary,
  SourceRecord,
  TrendKeywordRecord,
  TrendRow,
} from "@/lib/types";

function lower(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function weekKey(date: Date) {
  return startOfWeek(date, { weekStartsOn: 1 }).toISOString().slice(0, 10);
}

function getKeywordCount(title: string, keyword: string) {
  const normalizedTitle = lower(title);
  const normalizedKeyword = lower(keyword);
  return normalizedTitle.includes(normalizedKeyword) ? 1 : 0;
}

export function getTrendStatus(growthPercentage: number) {
  if (growthPercentage > 15) return "Rising" as const;
  if (growthPercentage < -15) return "Declining" as const;
  return "Stable" as const;
}

export function toProductRows(
  products: ProductRecord[],
  sources: SourceRecord[],
  categories: CategoryRecord[],
): ProductRow[] {
  const sourceMap = new Map(sources.map((source) => [source.id, source.name]));
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

  return products.map((product) => ({
    id: product.id,
    image_url: product.image_url,
    title: product.title,
    brand: product.brand ?? "Unknown",
    source: sourceMap.get(product.source_id) ?? "Unknown",
    category: categoryMap.get(product.category_id ?? -1) ?? "Uncategorized",
    price: product.price ?? 0,
    discount_percentage: product.discount_percentage ?? 0,
    color: product.color ?? "Unknown",
    scraped_at: product.scraped_at,
    product_url: product.product_url,
  }));
}

export function buildBrandRows(
  products: ProductRecord[],
  categories: CategoryRecord[],
): BrandRow[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const grouped = new Map<string, ProductRecord[]>();

  for (const product of products) {
    const key = product.brand ?? "Unknown";
    const items = grouped.get(key) ?? [];
    items.push(product);
    grouped.set(key, items);
  }

  return [...grouped.entries()]
    .map(([brand, items]) => {
      const categoryCounts = new Map<string, number>();
      let totalPrice = 0;
      let totalDiscount = 0;
      let count = 0;

      for (const item of items) {
        const category = categoryMap.get(item.category_id ?? -1) ?? "Uncategorized";
        categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
        totalPrice += item.price ?? 0;
        totalDiscount += item.discount_percentage ?? 0;
        count += 1;
      }

      return {
        brand,
        productCount: count,
        averagePrice: count ? totalPrice / count : 0,
        averageDiscount: count ? totalDiscount / count : 0,
        topCategories: [...categoryCounts.entries()]
          .map(([category, categoryCount]) => ({ category, count: categoryCount }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
      };
    })
    .sort((a, b) => b.productCount - a.productCount);
}

export function buildDashboardStats(input: {
  products: ProductRecord[];
  sources: SourceRecord[];
  categories: CategoryRecord[];
  scrapeRuns: ScrapeRunRecord[];
  trendKeywords: TrendKeywordRecord[];
}): DashboardStats {
  const { products, sources, categories, scrapeRuns, trendKeywords } = input;
  const brandCount = new Set(products.map((product) => product.brand).filter(Boolean)).size;
  const trendRows = buildTrendRows(products, trendKeywords);
  const topRisingTrends = [...trendRows]
    .filter((row) => row.status === "Rising")
    .sort((a, b) => b.growthPercentage - a.growthPercentage)
    .slice(0, 5);
  const topDecliningTrends = [...trendRows]
    .filter((row) => row.status === "Declining")
    .sort((a, b) => a.growthPercentage - b.growthPercentage)
    .slice(0, 5);
  const commonColors = [...new Set(products.map((product) => product.color ?? "Unknown"))]
    .map((color) => ({
      color,
      count: products.filter((product) => (product.color ?? "Unknown") === color).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const categoryBuckets = new Map<string, { sum: number; count: number }>();
  for (const product of products) {
    const category = categoryMap.get(product.category_id ?? -1) ?? "Uncategorized";
    const bucket = categoryBuckets.get(category) ?? { sum: 0, count: 0 };
    bucket.sum += product.price ?? 0;
    bucket.count += 1;
    categoryBuckets.set(category, bucket);
  }
  const averagePriceByCategory = [...categoryBuckets.entries()]
    .map(([category, bucket]) => ({
      category,
      averagePrice: bucket.count ? bucket.sum / bucket.count : 0,
    }))
    .sort((a, b) => b.averagePrice - a.averagePrice);

  const latestRun = [...scrapeRuns].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];

  return {
    totalProducts: products.length,
    totalBrands: brandCount,
    topRisingTrends,
    topDecliningTrends,
    commonColors,
    averagePriceByCategory,
    latestScrapeStatus: {
      status: latestRun?.status ?? "idle",
      startedAt: latestRun?.started_at ?? null,
      completedAt: latestRun?.completed_at ?? null,
      productsFound: latestRun?.products_found ?? 0,
      errorMessage: latestRun?.error_message ?? null,
      sourceName: sources.find((source) => source.id === latestRun?.source_id)?.name,
      categoryName: categories.find((category) => category.id === (latestRun?.category_id ?? -1))?.name,
    },
  };
}

export function buildTrendRows(
  products: ProductRecord[],
  trendKeywords: TrendKeywordRecord[],
): TrendRow[] {
  const latestWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const previousWeek = subWeeks(latestWeek, 1);
  const currentWeekStart = latestWeek.toISOString();
  const previousWeekStart = previousWeek.toISOString();
  const currentCounts = new Map<string, number>();
  const previousCounts = new Map<string, number>();

  for (const keyword of trendKeywords) {
    currentCounts.set(keyword.keyword, 0);
    previousCounts.set(keyword.keyword, 0);
  }

  for (const product of products) {
    const productDate = new Date(product.scraped_at);
    const bucket = weekKey(productDate);
    const isCurrentWeek = bucket === currentWeekStart.slice(0, 10);
    const isPreviousWeek = bucket === previousWeekStart.slice(0, 10);

    for (const keyword of trendKeywords) {
      const count = getKeywordCount(product.title, keyword.keyword);
      if (!count) continue;

      if (isCurrentWeek) {
        currentCounts.set(keyword.keyword, (currentCounts.get(keyword.keyword) ?? 0) + count);
      } else if (isPreviousWeek) {
        previousCounts.set(keyword.keyword, (previousCounts.get(keyword.keyword) ?? 0) + count);
      }
    }
  }

  return trendKeywords
    .map((keyword) => {
      const currentCount = currentCounts.get(keyword.keyword) ?? 0;
      const previousCount = previousCounts.get(keyword.keyword) ?? 0;
      const growthPercentage =
        previousCount > 0
          ? ((currentCount - previousCount) / previousCount) * 100
          : currentCount > 0
            ? 100
            : 0;

      return {
        keyword: keyword.keyword,
        currentCount,
        previousCount,
        growthPercentage,
        status: getTrendStatus(growthPercentage),
      };
    })
    .filter((row) => row.currentCount > 0 || row.previousCount > 0)
    .sort((a, b) => b.growthPercentage - a.growthPercentage);
}

export function buildTrendSeries(
  products: ProductRecord[],
  trendKeywords: TrendKeywordRecord[],
  weeks = 6,
) {
  const start = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weeks - 1);
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const date = addDays(start, index * 7);
    return {
      week: format(date, "MMM d"),
      isoWeekStart: weekKey(date),
    };
  });

  const topKeywords = buildTrendRows(products, trendKeywords).slice(0, 5).map((row) => row.keyword);
  const series = buckets.map((bucket) => {
    const row: Record<string, string | number> = { week: bucket.week };

    for (const keyword of topKeywords) {
      row[keyword] = 0;
    }

    for (const product of products) {
      if (weekKey(new Date(product.scraped_at)) !== bucket.isoWeekStart) continue;

      for (const keyword of topKeywords) {
        if (getKeywordCount(product.title, keyword)) {
          row[keyword] = Number(row[keyword] ?? 0) + 1;
        }
      }
    }

    return row;
  });

  return {
    topKeywords,
    series,
  };
}

export function buildScrapeSummary(scrapeRuns: ScrapeRunRecord[], sourceName?: string, categoryName?: string): ScrapeSummary {
  const latestRun = [...scrapeRuns].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];

  return {
    status: latestRun?.status ?? "idle",
    startedAt: latestRun?.started_at ?? null,
    completedAt: latestRun?.completed_at ?? null,
    productsFound: latestRun?.products_found ?? 0,
    errorMessage: latestRun?.error_message ?? null,
    sourceName,
    categoryName,
  };
}
