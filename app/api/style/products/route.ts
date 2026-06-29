import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { classifyStyleQuery, siteFilter } from "@/lib/style-query-classifier";

export const revalidate = 7200;

type ProductCategory = "ethnic" | "western" | "activewear" | "premium" | "street";
type ProductGender = "female" | "male";

type SerperShoppingItem = {
  title?: string;
  price?: string;
  imageUrl?: string;
  link?: string;
  source?: string;
};

function normalizeCategory(value: unknown): ProductCategory {
  const category = typeof value === "string" ? value : "";
  if (["ethnic", "western", "activewear", "premium", "street"].includes(category)) {
    return category as ProductCategory;
  }
  return "western";
}

function normalizeGender(value: unknown): ProductGender {
  return value === "male" ? "male" : "female";
}

async function searchProducts(searchQuery: string, category: ProductCategory, gender: ProductGender) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const apiKey = key;
  const classification = await classifyStyleQuery(searchQuery);
  const filteredQuery =
    classification.type === "fusion"
      ? searchQuery
      : `${searchQuery} ${siteFilter(classification.premiumSites)}`;

  async function fetchShopping(q: string, gl: string) {
    const response = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q,
        gl,
        hl: "en",
        num: 6,
      }),
    });

    if (!response.ok) {
      console.error("Serper style products failed:", response.status, await response.text());
      return [];
    }

    const data = (await response.json()) as { shopping?: SerperShoppingItem[] };
    return data.shopping ?? [];
  }

  const normalizeProducts = (items: SerperShoppingItem[]) =>
    items
      .filter((item) => item.title && item.price && item.imageUrl && item.link)
      .filter((item) => !/\b(meesho|snapdeal|wholesale|bulk)\b/i.test(`${item.title} ${item.link} ${item.source}`))
      .slice(0, 4)
      .map((item) => ({
        title: item.title ?? "Product",
        price: item.price ?? "",
        imageUrl: item.imageUrl ?? "",
        link: item.link ?? "",
        source: item.source ?? "Retailer",
      }));

  const filteredProducts = normalizeProducts(await fetchShopping(filteredQuery, classification.searchRegion));
  if (filteredProducts.length || classification.type === "fusion") return filteredProducts;

  return normalizeProducts(await fetchShopping(searchQuery, "in"));
}

const cachedSearchProducts = unstable_cache(
  searchProducts,
  ["style-products-region-shopping-v2-empty-fallback"],
  { revalidate: 60 * 60 * 2 },
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const searchQuery = typeof body.searchQuery === "string" ? body.searchQuery.trim() : "";
    const category = normalizeCategory(body.category);
    const gender = normalizeGender(body.gender);

    if (!searchQuery) {
      return NextResponse.json({ error: "Missing searchQuery" }, { status: 400 });
    }

    const products = await cachedSearchProducts(searchQuery, category, gender);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Style products route error:", error);
    return NextResponse.json({ error: "Failed to search style products" }, { status: 500 });
  }
}
