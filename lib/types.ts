export type SourceRecord = {
  id: number;
  name: string;
  base_url: string | null;
  created_at: string;
};

export type CategoryRecord = {
  id: number;
  name: string;
  created_at: string;
};

export type ScrapeRunRecord = {
  id: number;
  source_id: number;
  category_id: number | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  products_found: number | null;
  error_message: string | null;
};

export type ProductRecord = {
  id: number;
  source_id: number;
  category_id: number | null;
  title: string;
  brand: string | null;
  price: number | null;
  original_price: number | null;
  discount_percentage: number | null;
  color: string | null;
  image_url: string | null;
  product_url: string;
  scraped_at: string;
  created_at: string;
};

export type TrendKeywordRecord = {
  id: number;
  keyword: string;
  category: string | null;
  created_at: string;
};

export type TrendSnapshotRecord = {
  id: number;
  keyword_id: number;
  source_id: number | null;
  category_id: number | null;
  product_count: number;
  snapshot_date: string;
  previous_count: number | null;
  growth_percentage: number | null;
  status: "Rising" | "Stable" | "Declining";
};

export type DashboardStats = {
  totalProducts: number;
  totalBrands: number;
  topRisingTrends: TrendRow[];
  topDecliningTrends: TrendRow[];
  commonColors: Array<{ color: string; count: number }>;
  averagePriceByCategory: Array<{ category: string; averagePrice: number }>;
  latestScrapeStatus: ScrapeSummary;
};

export type TrendRow = {
  keyword: string;
  currentCount: number;
  previousCount: number;
  growthPercentage: number;
  status: "Rising" | "Stable" | "Declining";
  source?: string;
  category?: string;
};

export type ScrapeSummary = {
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  productsFound: number;
  errorMessage: string | null;
  sourceName?: string;
  categoryName?: string;
};

export type ProductRow = {
  id: number;
  image_url: string | null;
  title: string;
  brand: string;
  source: string;
  category: string;
  price: number;
  discount_percentage: number;
  color: string;
  scraped_at: string;
  product_url: string;
};

export type TrendChartPoint = {
  date: string;
  count: number;
};

export type BrandRow = {
  brand: string;
  productCount: number;
  averagePrice: number;
  averageDiscount: number;
  topCategories: Array<{ category: string; count: number }>;
};
