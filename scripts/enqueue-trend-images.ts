#!/usr/bin/env tsx
import "./load-env";
import {
  FASHION_IMAGE_VARIANTS,
  syntheticTrendIdForKeyword,
  type FashionImageVariant,
} from "../lib/images/build-fashion-image-prompt";
import { enqueueTrendImageJob, loadTrendImageSeed } from "../lib/images/generated-fashion-images";
import { getSupabaseClient } from "../lib/supabase";

type Options = {
  limit: number;
  variant: FashionImageVariant | "all";
  trendId?: number;
  keyword?: string;
  formula?: string;
  occasion?: string;
  gender?: "women" | "men";
  force: boolean;
  topOnly: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { limit: 5, variant: "trend_hero", force: false, topOnly: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--limit" && next) {
      options.limit = Number(next);
      index += 1;
    } else if (arg === "--variant" && next) {
      if (next !== "all" && !FASHION_IMAGE_VARIANTS.includes(next as FashionImageVariant)) {
        throw new Error(`Unknown variant: ${next}`);
      }
      options.variant = next as Options["variant"];
      index += 1;
    } else if (arg === "--trend-id" && next) {
      options.trendId = Number(next);
      index += 1;
    } else if (arg === "--keyword" && next) {
      options.keyword = next;
      index += 1;
    } else if (arg === "--formula" && next) {
      options.formula = next;
      index += 1;
    } else if (arg === "--occasion" && next) {
      options.occasion = next;
      index += 1;
    } else if (arg === "--gender" && next) {
      if (next !== "women" && next !== "men") throw new Error(`Unknown gender: ${next}`);
      options.gender = next;
      index += 1;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--top-only") {
      options.topOnly = true;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) options.limit = 5;
  if (options.formula && !options.gender) {
    throw new Error("--gender women|men is required when --formula is provided");
  }
  return options;
}

async function loadTrendIds(options: Options) {
  if (options.keyword) return [syntheticTrendIdForKeyword(options.keyword)];
  if (options.trendId) return [options.trendId];

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase service credentials are required");

  if (options.topOnly) {
    const { data, error } = await supabase
      .from("historical_trend_data")
      .select("keyword_id, google_score")
      .eq("market", "IN")
      .order("google_score", { ascending: false })
      .limit(options.limit);

    if (error) throw error;
    return Array.from(new Set((data || []).map((row: any) => Number(row.keyword_id)).filter(Boolean))).slice(0, options.limit);
  }

  const { data, error } = await supabase
    .from("trend_keywords")
    .select("id")
    .order("id", { ascending: true })
    .limit(options.limit);

  if (error) throw error;
  return (data || []).map((row: any) => Number(row.id)).filter(Boolean);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const variants = options.variant === "all" ? ["trend_hero", "trend_women", "trend_men"] : [options.variant];
  const trendIds = await loadTrendIds(options);

  let queued = 0;
  let skipped = 0;

  for (const trendId of trendIds) {
    const trend = options.keyword
      ? {
          id: trendId,
          keyword: options.keyword,
          editorialName: options.keyword,
        }
      : await loadTrendImageSeed(trendId);
    if (!trend) {
      console.warn(`Trend ${trendId} not found; skipped.`);
      skipped += variants.length;
      continue;
    }

    for (const variant of variants) {
      const result = await enqueueTrendImageJob({
        trend,
        variant: variant as FashionImageVariant,
        outfitFormula: options.formula,
        outfitOccasion: options.occasion,
        gender: options.gender,
        force: options.force,
        priority: options.topOnly ? 10 : 0,
      });

      if (result.status === "queued") queued += 1;
      else skipped += 1;

      console.log(`${result.status}: trend=${trend.id} variant=${variant} keyword="${trend.keyword}"`);
    }
  }

  console.log(`Done. queued=${queued} skipped=${skipped}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
