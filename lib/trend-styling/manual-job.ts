import { SUPPORTED_TREND_REGIONS, type SupportedTrendRegion } from "@/lib/trends/config";
import { canonicalizeTrendKeyword, isFashionKeyword } from "@/lib/trends/keyword-normalization";
import { getSupabaseClient } from "@/lib/supabase";
import { isolatedConceptId } from "./concept-identity";

export type ManualStylingOptions = {
  keyword: string;
  market: string;
  season: string;
  createJob: boolean;
  execute: boolean;
  confirmManualJobCreation: boolean;
};

export type ManualStylingTarget = {
  canonicalKeyword: string;
  market: SupportedTrendRegion;
  season: string;
  conceptId: string;
  jobId: string;
};

export type ManualConceptInsert = {
  id: string;
  canonical_keyword: string;
  source_context: "user_search";
};

export type ManualResearchJobInsert = {
  id: string;
  canonical_keyword: string;
  concept_id: string;
  requesting_market: SupportedTrendRegion;
  season: string;
  source_context: "user_search";
  selected_markets: string[];
  evaluated_markets: string[];
  status: "pending";
};

export interface ManualJobStore {
  jobExists(jobId: string): Promise<boolean>;
  ensureConcept(row: ManualConceptInsert): Promise<void>;
  ensureJob(row: ManualResearchJobInsert): Promise<void>;
}

function optionValue(argv: string[], name: string, fallback: string) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function parseManualStylingArguments(argv: string[]): ManualStylingOptions {
  const execute = argv.includes("--execute");
  const dryRun = argv.includes("--dry-run");
  if (execute && dryRun) throw new Error("Choose either --execute or --dry-run");
  return {
    keyword: optionValue(argv, "--keyword", "linen"),
    market: optionValue(argv, "--market", "IN"),
    season: optionValue(argv, "--season", "current"),
    createJob: argv.includes("--create-job"),
    execute,
    confirmManualJobCreation: argv.includes("--confirm-manual-job-creation"),
  };
}

export function resolveManualStylingTarget(options: Pick<ManualStylingOptions, "keyword" | "market" | "season">): ManualStylingTarget {
  const canonicalKeyword = canonicalizeTrendKeyword(options.keyword);
  if (!canonicalKeyword || canonicalKeyword.length > 120 || !isFashionKeyword(canonicalKeyword)) {
    throw new Error("Unsupported fashion keyword");
  }

  const market = options.market.trim().toUpperCase();
  const supportedMarket = SUPPORTED_TREND_REGIONS.find(({ code }) => code === market)?.code;
  if (!supportedMarket) throw new Error("Unsupported styling market");

  const season = options.season.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  if (!season || season.length > 40 || !/^[a-z0-9][a-z0-9 -]*$/.test(season)) {
    throw new Error("Invalid styling season");
  }

  const conceptId = isolatedConceptId(canonicalKeyword);
  const jobId = isolatedConceptId(`manual styling job ${conceptId} ${supportedMarket} ${season} user search`);
  return { canonicalKeyword, market: supportedMarket, season, conceptId, jobId };
}

export function requireManualServiceRole(env: NodeJS.ProcessEnv = process.env) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Manual job creation requires Supabase service-role credentials");
  }
}

export function createSupabaseManualJobStore(): ManualJobStore {
  requireManualServiceRole();
  const db = getSupabaseClient();
  if (!db) throw new Error("Supabase service-role client is unavailable");
  return {
    async jobExists(jobId) {
      const { data, error } = await db.from("trend_style_research_jobs").select("id").eq("id", jobId).maybeSingle();
      if (error) throw error;
      return Boolean(data?.id);
    },
    async ensureConcept(row) {
      const { error } = await db.from("trend_style_concepts").upsert(row, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    },
    async ensureJob(row) {
      const { error } = await db.from("trend_style_research_jobs").upsert(row, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}

export async function prepareManualStylingJob(options: ManualStylingOptions, store?: ManualJobStore) {
  const target = resolveManualStylingTarget(options);

  if (options.createJob && !options.execute) {
    throw new Error("--create-job requires --execute");
  }
  if (options.createJob && !options.confirmManualJobCreation) {
    throw new Error("--create-job requires --confirm-manual-job-creation");
  }
  if (!options.execute || !options.createJob) {
    return { status: options.execute ? "creation_skipped" as const : "dry_run" as const, target };
  }
  if (!store) throw new Error("Manual job store is required for confirmed creation");

  const existed = await store.jobExists(target.jobId);
  await store.ensureConcept({ id: target.conceptId, canonical_keyword: target.canonicalKeyword, source_context: "user_search" });
  await store.ensureJob({
    id: target.jobId,
    canonical_keyword: target.canonicalKeyword,
    concept_id: target.conceptId,
    requesting_market: target.market,
    season: target.season,
    source_context: "user_search",
    selected_markets: [],
    evaluated_markets: [],
    status: "pending",
  });
  return { status: existed ? "existing" as const : "created" as const, target };
}
