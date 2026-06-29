import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();

export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function getSupabaseClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

export function supabaseCacheTtl(table: string) {
  if (table === "historical_trend_data") return 24 * 60 * 60;
  if (table === "style_knowledge") return 48 * 60 * 60;
  if (table === "style_profiles") return 60 * 60;
  return 12 * 60 * 60;
}

export async function supabaseCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const value = await fetcher();
  memoryCache.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  return value;
}

export function clearSupabaseCache(key: string) {
  memoryCache.delete(key);
}

export function hasFreshSupabaseCache(key: string) {
  const cached = memoryCache.get(key);
  return Boolean(cached && cached.expiresAt > Date.now());
}

export function logSupabaseFallback(error?: unknown) {
  console.log("Supabase limit hit, using fallback data");
  if (error) {
    console.error("Supabase fallback reason:", error instanceof Error ? error.message : error);
  }
}
/*
APP: Fashniq — AI-powered Indian fashion trend platform for Gen Z
STACK: Next.js 14 App Router, TypeScript, Tailwind CSS, Framer Motion, Supabase

SUPABASE SCHEMA:
- products: { id, title, brand, price, original_price, discount_percentage, image_url, product_url, source_id, category_id, scraped_at }
- trend_snapshots: { id, keyword_id, source_id, category_id, growth_percentage, status, product_count, previous_count, snapshot_date }
- trend_keywords: { id, keyword }
- sources: { id, name, base_url }
- categories: { id, name }

SEASONAL THEMES:
- Summer (March-June): bg=#FFF8F0, accent=#FF6B35, secondary=#FFD166
- Monsoon (July-September): bg=#0D1B2A, accent=#00B4D8, secondary=#90E0EF  
- Festive (October-November): bg=#1A0A2E, accent=#FFD700, secondary=#C77DFF
- Winter (December-February): bg=#F0F4F8, accent=#2D3A8C, secondary=#7B9EA6

BODY TYPES: hourglass, pear, apple, rectangle, inverted-triangle
VIBES: minimal, streetwear, cottagecore, y2k, quiet-luxury, indo-fusion, coastal, quirky
AESTHETICS: each vibe maps to specific keywords from our trend_keywords table

DESIGN RULES:
- Mobile first, all components responsive
- Use Framer Motion for all animations
- Seasonal theme applied via CSS variables on :root
- Cards have rounded-3xl, soft shadows
- Typography: large bold headings, small caps labels
- Never use plain blue links — always use accent color
*/
// ADD these new helper functions to the existing supabase client:

// getProducts(limit?: number, sourceId?: number): 
//   fetch from products table, optional filter by source_id
//   order by scraped_at desc
//   return array of products

// getTrendSnapshots():
//   fetch all trend_snapshots
//   join with trend_keywords to get keyword name
//   order by growth_percentage desc
//   return array with keyword name included

// getTopRisingTrends(limit: number = 6):
//   fetch trend_snapshots where status = 'Rising'
//   order by growth_percentage desc
//   limit to given number
//   join with trend_keywords for keyword name

// getProductsByKeywords(keywords: string[], limit: number = 20):
//   fetch products where title ilike any of the keywords
//   use Supabase or() filter
//   order by scraped_at desc

// getSources():
//   fetch all sources
//   order by name asc
