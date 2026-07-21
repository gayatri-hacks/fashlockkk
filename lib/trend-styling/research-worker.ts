import { createHash } from "crypto";
import { SUPPORTED_TREND_REGIONS } from "@/lib/trends/config";
import { getSupabaseClient } from "@/lib/supabase";
import { deduplicateStylingSources } from "./evidence-deduplication";
import {
  EvidenceProviderQuotaError,
  type PublicEvidenceResult,
  type StylingEvidenceSearchProvider,
} from "./evidence-provider";
import { MARKET_RESEARCH_LANGUAGES, selectStylingResearchMarkets, type StylingMarketPlan, type StylingMarketSignal } from "./market-selection";
import { isolatedConceptId } from "./concept-identity";
import { loadAuthoritativeMarketPlan } from "./market-authority";
import {
  createRepoOwnedMarketInterestProvider,
  GoogleTrendsQuotaDeferralError,
  googleTrendsQuotaRetryAt,
  isAllRateLimitedMarketDiscoveryBatch,
  isUsableMarketDiscoveryResult,
  MARKET_DISCOVERY_LIMITS,
  MARKET_DISCOVERY_PROVIDER_NAME,
  parseRepoMarketDiscoveryBatch,
  type MarketDiscoveryBatch,
  type MarketDiscoveryResult,
  type MarketInterestProvider,
} from "./market-discovery-provider";

export const RESEARCH_LIMITS = {
  maxKeywordsPerRun: 1,
  maxMarketDiscoveryProviderCallsPerKeyword: MARKET_DISCOVERY_LIMITS.maxProviderCallsPerKeyword,
  maxStylingSearchCallsPerKeyword: 16,
  maxResultsPerCall: 6,
  lastKnownGoodMarketEvidenceDays: 7,
} as const;

export type ResearchMarketSource = "none" | "authoritative_scores" | "last_known_good_market_evidence" | "live_pytrends";
export type ResearchJob = { id: string; concept_id: string; canonical_keyword: string; requesting_market: string; season: string; attempts: number; max_attempts: number };
export type EvidenceInsert = { id:string; concept_id: string; canonical_keyword: string; audience: "women"|"men"; region: string; season: string; garment_pairings: string[]; silhouettes: string[]; materials: string[]; colours: string[]; footwear: string[]; accessories: string[]; styling_techniques: string[]; source_url: string; source_domain: string; source_language: string; short_extract: string; published_at: string; observed_at: string; quality_score: number; recency_score: number; market_relevance_score: number; content_fingerprint: string };

export type ResearchQuotaDeferral = {
  errorCategory: "google_trends_quota_or_rate_limit" | "quota_exhausted";
  retryAfter: string;
  message: string;
};

export interface ResearchStore {
  claim(workerId: string): Promise<ResearchJob|null>;
  loadMarketEvidence?(job:ResearchJob,now:Date):Promise<MarketDiscoveryBatch|null>;
  saveMarketEvidence?(job:ResearchJob,batch:MarketDiscoveryBatch,now:Date):Promise<void>;
  insertEvidence(rows: EvidenceInsert[]): Promise<void>;
  complete(job: ResearchJob, data: { selectedMarkets: string[]; evaluatedMarkets: string[]; selectedReasons:Record<string,string[]>; evidenceHash: string }): Promise<void>;
  retry(job: ResearchJob, error: string, retryAfter?:string|null): Promise<void>;
  deferQuota?(job: ResearchJob, error: ResearchQuotaDeferral): Promise<void>;
}

class InsufficientMarketDiscoveryError extends Error {
  readonly errorCategory = "insufficient_market_evidence" as const;
  constructor(readonly retryAfter:string){super("insufficient materially supported market evidence");this.name="InsufficientMarketDiscoveryError";}
}

export function nextMarketDiscoveryRetry(batch:MarketDiscoveryBatch,now:Date){
  const candidates=batch.markets.map((market)=>market.retryInformation.nextRetryAt).filter((value):value is string=>Boolean(value)).map((value)=>new Date(value).getTime()).filter((value)=>Number.isFinite(value)&&value>now.getTime());
  const target=candidates.length?Math.min(...candidates):now.getTime()+6*3600000;
  return new Date(Math.max(now.getTime()+5*60000,Math.min(now.getTime()+24*3600000,target))).toISOString();
}

export function evidenceProviderQuotaRetryAt(error: EvidenceProviderQuotaError, claimedAttempts: number, now: Date) {
  const minimumSeconds = 6 * 60 * 60;
  const maximumSeconds = 24 * 60 * 60;
  const attemptBackoffSeconds = minimumSeconds * 2 ** Math.min(2, Math.max(0, claimedAttempts - 1));
  const requestedSeconds = Number.isFinite(error.retryAfterSeconds)
    ? Number(error.retryAfterSeconds)
    : minimumSeconds;
  const boundedSeconds = Math.min(
    maximumSeconds,
    Math.max(minimumSeconds, requestedSeconds, attemptBackoffSeconds),
  );
  return new Date(now.getTime() + boundedSeconds * 1_000).toISOString();
}

const VOCAB = { garments: ["shirt","blouse","t-shirt","tee","jeans","trousers","skirt","dress","blazer","jacket","kurta","saree","shorts","waistcoat"], silhouettes: ["oversized","fitted","wide leg","barrel","cropped","relaxed","tailored","flared","straight leg"], materials: ["linen","cotton","denim","silk","satin","leather","suede","knit","crochet","wool"], colours: ["white","black","blue","indigo","cream","beige","brown","red","green","yellow","pink","navy"], footwear: ["loafers","sneakers","sandals","boots","heels","flats","mules"], accessories: ["belt","bag","scarf","necklace","earrings","watch","cap"], techniques: ["tucked","layered","belted","tonal","colour blocking","rolled sleeves","open shirt","high waist"] } as const;
function matches(text: string, values: readonly string[]) { const lower=` ${text.toLowerCase()} `; return values.filter((value)=>lower.includes(value)); }
export function extractStylingAttributes(text: string) { return { garment_pairings: matches(text,VOCAB.garments), silhouettes: matches(text,VOCAB.silhouettes), materials: matches(text,VOCAB.materials), colours: matches(text,VOCAB.colours), footwear: matches(text,VOCAB.footwear), accessories: matches(text,VOCAB.accessories), styling_techniques: matches(text,VOCAB.techniques) }; }
export function canonicalizeEvidenceUrl(value: string) { const url=new URL(value); url.hash=""; [...url.searchParams.keys()].forEach((key)=>{ if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key); }); url.hostname=url.hostname.toLowerCase().replace(/^www\./,""); url.pathname=url.pathname.replace(/\/$/,"")||"/"; return url.toString(); }
function freshness(date: string, now: Date) { const days=Math.max(0,(now.getTime()-new Date(date).getTime())/86400000); return days<=60?1:days<=120 ? .55 : 0; }
function quality(domain: string) { return /vogue|gq|elle|harpersbazaar|designer|retailer/i.test(domain)?.9:.65; }
export function evidenceFromResult(input: { result: PublicEvidenceResult; job: ResearchJob; audience: "women"|"men"; market: string; language: string; observedAt: Date }): EvidenceInsert|null { const url=canonicalizeEvidenceUrl(input.result.url); const published=input.result.publishedAt ? new Date(input.result.publishedAt) : input.observedAt; if(Number.isNaN(published.getTime())) return null; const attrs=extractStylingAttributes(`${input.result.title} ${input.result.shortExtract}`); if(attrs.garment_pairings.length<2 || !attrs.materials.length) return null; const source_domain=new URL(url).hostname; const content_fingerprint=createHash("sha256").update(`${input.result.title.toLowerCase()}|${input.result.shortExtract.toLowerCase()}`).digest("hex"); return { id:isolatedConceptId(`evidence ${input.job.concept_id} ${content_fingerprint}`), concept_id:input.job.concept_id, canonical_keyword:input.job.canonical_keyword, audience:input.audience, region:input.market, season:input.job.season, ...attrs, source_url:url, source_domain, source_language:input.language, short_extract:input.result.shortExtract.slice(0,500), published_at:published.toISOString(), observed_at:input.observedAt.toISOString(), quality_score:quality(source_domain), recency_score:freshness(published.toISOString(),input.observedAt), market_relevance_score:input.result.market===input.market?1:.6, content_fingerprint }; }

function planFromDiscovery(batch: MarketDiscoveryBatch, requestingMarket: string): StylingMarketPlan {
  const signals: StylingMarketSignal[] = batch.markets.map((score) => ({
    region: score.market,
    regionalMomentum: score.recentMomentum,
    currentInterestPercentile: score.normalizedInterest,
    confidence: score.confidence,
    dataFreshness: score.observationCompleteness,
    observationCount: Math.round(score.observationCompleteness * 12),
  }));
  return selectStylingResearchMarkets({ signals, lifecycle: "RISING", requestingMarket });
}

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/g, " ").slice(0, 240);
}

function errorCategory(error: unknown) {
  if (error instanceof GoogleTrendsQuotaDeferralError) return error.errorCategory;
  if (error instanceof EvidenceProviderQuotaError) return error.errorCategory;
  if (error instanceof InsufficientMarketDiscoveryError) return error.errorCategory;
  return "research_retryable" as const;
}

export async function runResearchWorker(input: {
  workerId: string;
  store: ResearchStore;
  interestProvider: MarketInterestProvider;
  searchProvider: StylingEvidenceSearchProvider;
  now?: Date;
  authoritativeMarketPlanLoader?: (canonicalKeyword:string,requestingMarket:string,now:Date)=>Promise<StylingMarketPlan|null>;
}) {
  const job=await input.store.claim(input.workerId);
  if(!job) return {status:"idle" as const};
  const now=input.now||new Date();
  let marketSource: ResearchMarketSource = "none";
  try {
    const loadAuthority = input.authoritativeMarketPlanLoader || ((keyword, market, observedAt) =>
      loadAuthoritativeMarketPlan(keyword, market, { now: observedAt }));
    let plan = await loadAuthority(job.canonical_keyword, job.requesting_market, now);
    let discovery: MarketDiscoveryBatch | null = null;
    if (plan) {
      marketSource = "authoritative_scores";
    } else {
      const lastKnownGood=await input.store.loadMarketEvidence?.(job,now)||null;
      if (lastKnownGood) {
        const cachedPlan = planFromDiscovery(lastKnownGood, job.requesting_market);
        if (cachedPlan.strongestMarkets.length >= 3) {
          discovery = lastKnownGood;
          plan = cachedPlan;
          marketSource = "last_known_good_market_evidence";
        }
      }
    }
    if (!plan) {
      marketSource = "live_pytrends";
      discovery=await input.interestProvider.discover({keyword:job.canonical_keyword,conceptId:job.concept_id});
      if(discovery.providerCalls>RESEARCH_LIMITS.maxMarketDiscoveryProviderCallsPerKeyword)throw new Error("market discovery provider-call limit exceeded");
      await input.store.saveMarketEvidence?.(job,discovery,now);
      if (isAllRateLimitedMarketDiscoveryBatch(discovery)) {
        throw new GoogleTrendsQuotaDeferralError(googleTrendsQuotaRetryAt(discovery, job.attempts, now));
      }
      plan=planFromDiscovery(discovery,job.requesting_market);
      if(plan.strongestMarkets.length<3)throw new InsufficientMarketDiscoveryError(nextMarketDiscoveryRetry(discovery,now));
    }

    const rows:EvidenceInsert[]=[];
    let calls=0;
    for(const market of plan.researchMarkets) for(const language of MARKET_RESEARCH_LANGUAGES[market]) for(const audience of ["women","men"] as const){
      if(++calls>RESEARCH_LIMITS.maxStylingSearchCallsPerKeyword) throw new Error("styling search call limit exceeded");
      const raw=await input.searchProvider.search({keyword:job.canonical_keyword,audience,region:market,season:job.season,language});
      for(const result of deduplicateStylingSources(raw.slice(0,RESEARCH_LIMITS.maxResultsPerCall))){
        const row=evidenceFromResult({result,job,audience,market,language,observedAt:now});
        if(row&&row.recency_score>0) rows.push(row);
      }
    }
    const unique=[...new Map(rows.map((row)=>[row.content_fingerprint,row])).values()];
    if(new Set(unique.map((row)=>row.source_domain)).size<2) throw new Error("insufficient independent fresh evidence");
    await input.store.insertEvidence(unique);
    const evidenceHash=createHash("sha256").update(JSON.stringify(unique.map((row)=>[row.content_fingerprint,row.region,row.audience,row.published_at]).sort())).digest("hex");
    await input.store.complete(job,{selectedMarkets:plan.researchMarkets,evaluatedMarkets:plan.evaluatedMarkets,selectedReasons:plan.selectedReasons,evidenceHash});
    return {status:"completed" as const,job,evidence:unique,marketPlan:plan,marketDiscovery:discovery,marketSource};
  } catch(error){
    const message=safeErrorMessage(error);
    if (error instanceof EvidenceProviderQuotaError) {
      if (!input.store.deferQuota) throw new Error("Research store does not support quota-safe deferral");
      const retryAfter=evidenceProviderQuotaRetryAt(error,job.attempts,now);
      await input.store.deferQuota(job,{errorCategory:error.errorCategory,retryAfter,message});
      return {status:"deferred" as const,job,error:message,errorCategory:error.errorCategory,retryAfter,marketSource};
    }
    if (error instanceof GoogleTrendsQuotaDeferralError) {
      if (!input.store.deferQuota) throw new Error("Research store does not support quota-safe deferral");
      await input.store.deferQuota(job,error);
      return {status:"deferred" as const,job,error:message,errorCategory:error.errorCategory,retryAfter:error.retryAfter,marketSource};
    }
    const seconds=Number((error as {retryAfterSeconds?:unknown})?.retryAfterSeconds);
    const providerRetry=Number.isFinite(seconds)&&seconds>0?new Date(now.getTime()+Math.min(86_400,Math.max(60,seconds))*1000).toISOString():null;
    const retryAfter=error instanceof InsufficientMarketDiscoveryError?error.retryAfter:providerRetry;
    await input.store.retry(job,message,retryAfter);
    return {status:"retryable" as const,job,error:message,errorCategory:errorCategory(error),retryAfter,marketSource};
  }
}

function unavailableMarketResult(market: (typeof SUPPORTED_TREND_REGIONS)[number]["code"], now: Date): MarketDiscoveryResult {
  return {
    market,
    normalizedInterest:0,
    recentMomentum:0,
    confidence:0,
    observationCompleteness:0,
    providerTimestamp:now.toISOString(),
    retryInformation:{attempts:0,maxAttempts:MARKET_DISCOVERY_LIMITS.maxAttemptsPerCall,rateLimited:false,retryAfterSeconds:null,nextRetryAt:null},
    failureReason:"last_known_good_unavailable",
  };
}

export function partitionMarketDiscoveryBatch(batch: MarketDiscoveryBatch) {
  return {
    successful: batch.markets.filter(isUsableMarketDiscoveryResult),
    failed: batch.markets.filter((market)=>!isUsableMarketDiscoveryResult(market)),
  };
}

export function createSupabaseResearchStore(options: { exactJobId?: string } = {}):ResearchStore {
  const db=getSupabaseClient();
  if(!db) throw new Error("Supabase service credentials required");
  return {
    async claim(workerId){
      if(options.exactJobId){
        const now=new Date();
        const {data:candidate,error:readError}=await db.from("trend_style_research_jobs").select("*").eq("id",options.exactJobId).maybeSingle();
        if(readError)throw readError;
        if(!candidate||candidate.status!=="pending"||candidate.attempts>=candidate.max_attempts)return null;
        if(candidate.retry_after&&new Date(candidate.retry_after)>now)return null;
        const {data,error}=await db.from("trend_style_research_jobs").update({status:"researching",attempts:candidate.attempts+1,updated_at:now.toISOString(),error_message:null,retry_after:null}).eq("id",options.exactJobId).eq("status","pending").eq("attempts",candidate.attempts).select("*").maybeSingle();
        if(error)throw error;
        return data||null;
      }
      const {data,error}=await db.rpc("claim_next_trend_style_research_job",{worker_id:workerId});
      if(error)throw error;
      return data?.[0]||null;
    },
    async loadMarketEvidence(job,now){
      const cutoff=new Date(now.getTime()-RESEARCH_LIMITS.lastKnownGoodMarketEvidenceDays*86_400_000).toISOString();
      const {data,error}=await db.from("trend_style_market_evidence").select("market,normalized_interest,recent_momentum,confidence,observation_completeness,provider_timestamp,retry_information,failure_reason").eq("concept_id",job.concept_id).eq("provider",MARKET_DISCOVERY_PROVIDER_NAME).gte("provider_timestamp",cutoff).order("provider_timestamp",{ascending:false});
      if(error)throw error;
      const latest=new Map<string,MarketDiscoveryResult>();
      for(const row of data||[]) {
        if(latest.has(row.market))continue;
        const parsed:MarketDiscoveryResult={market:row.market,normalizedInterest:Number(row.normalized_interest),recentMomentum:Number(row.recent_momentum),confidence:Number(row.confidence),observationCompleteness:Number(row.observation_completeness),providerTimestamp:row.provider_timestamp,retryInformation:row.retry_information,failureReason:row.failure_reason};
        if(isUsableMarketDiscoveryResult(parsed))latest.set(row.market,parsed);
      }
      if(latest.size<3)return null;
      return parseRepoMarketDiscoveryBatch({schemaVersion:"repo-pytrends-market-discovery-v1",provider:MARKET_DISCOVERY_PROVIDER_NAME,canonicalKeyword:job.canonical_keyword,generatedAt:[...latest.values()][0].providerTimestamp,cacheHit:true,providerCalls:0,maximumProviderCalls:RESEARCH_LIMITS.maxMarketDiscoveryProviderCallsPerKeyword,markets:SUPPORTED_TREND_REGIONS.map(({code})=>latest.get(code)||unavailableMarketResult(code,now))},job.canonical_keyword);
    },
    async saveMarketEvidence(job,batch,now){
      const expiresAt=new Date(now.getTime()+MARKET_DISCOVERY_LIMITS.cacheTtlHours*3600000).toISOString();
      const partitioned=partitionMarketDiscoveryBatch(batch);
      const successful=partitioned.successful.map((market)=>({concept_id:job.concept_id,canonical_keyword:job.canonical_keyword,market:market.market,normalized_interest:market.normalizedInterest,recent_momentum:market.recentMomentum,confidence:market.confidence,observation_completeness:market.observationCompleteness,provider:batch.provider,provider_timestamp:market.providerTimestamp,retry_information:market.retryInformation,failure_reason:market.failureReason,expires_at:expiresAt,updated_at:now.toISOString()}));
      if(successful.length){
        const {error}=await db.from("trend_style_market_evidence").upsert(successful,{onConflict:"concept_id,market,provider"});
        if(error)throw error;
      }
      const failures=partitioned.failed.map((market)=>({job_id:job.id,concept_id:job.concept_id,canonical_keyword:job.canonical_keyword,market:market.market,provider:batch.provider,error_category:market.retryInformation.rateLimited?"quota_or_rate_limit":"market_unavailable",failure_reason:(market.failureReason||"market_evidence_unusable").slice(0,240),retry_after:market.retryInformation.nextRetryAt,provider_timestamp:market.providerTimestamp}));
      if(failures.length){
        const {error}=await db.from("trend_style_market_discovery_failures").insert(failures);
        if(error)throw error;
      }
    },
    async insertEvidence(rows){const {error}=await db.from("trend_style_evidence").insert(rows);if(error)throw error;},
    async complete(job,data){const {error}=await db.from("trend_style_research_jobs").update({status:"completed",selected_markets:data.selectedMarkets,evaluated_markets:data.evaluatedMarkets,selected_market_reasons:data.selectedReasons,evidence_hash:data.evidenceHash,retry_after:null,completed_at:new Date().toISOString()}).eq("id",job.id);if(error)throw error;},
    async retry(job,errorMessage,retryAfter){const terminal=job.attempts>=job.max_attempts;const {error}=await db.from("trend_style_research_jobs").update({status:terminal?"failed":"pending",error_message:errorMessage.slice(0,500),retry_after:terminal?null:retryAfter||null}).eq("id",job.id);if(error)throw error;},
    async deferQuota(job,error){const {data,error:rpcError}=await db.rpc("defer_trend_style_research_job_quota",{target_job_id:job.id,expected_claimed_attempts:job.attempts,retry_at:error.retryAfter,safe_error_message:error.message});if(rpcError)throw rpcError;if(!data)throw new Error("Quota deferral did not match the claimed research job");},
  };
}

export function createConfiguredMarketInterestProvider():MarketInterestProvider { return createRepoOwnedMarketInterestProvider(); }
