import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadAuthoritativeMarketPlan, type AuthoritativeMarketScoreReader } from "./market-authority";
import { parseRepoMarketDiscoveryBatch } from "./market-discovery-provider";
import { selectStylingResearchMarkets } from "./market-selection";
import { safeResearchDiagnostic } from "./research-diagnostics";
import { partitionMarketDiscoveryBatch, runResearchWorker, type ResearchJob, type ResearchStore } from "./research-worker";
import { LINEN_RECOVERY_TARGET, runLinenRecovery } from "./linen-recovery";

const MARKETS=["IN","US","GB","FR","IT","DE","JP","KR","AU","BR","SG","AE"] as const;
const NOW=new Date("2026-07-20T00:00:00.000Z");

function discoveryBatch(overrides: { allRateLimited?:boolean }={}) {
  return parseRepoMarketDiscoveryBatch({
    schemaVersion:"repo-pytrends-market-discovery-v1",
    provider:"google_trends_pytrends",
    canonicalKeyword:"linen",
    generatedAt:NOW.toISOString(),
    cacheHit:false,
    providerCalls:overrides.allRateLimited?3:13,
    maximumProviderCalls:18,
    markets:MARKETS.map((market,index)=>overrides.allRateLimited?{
      market,normalizedInterest:0,recentMomentum:0,confidence:0,observationCompleteness:0,
      providerTimestamp:NOW.toISOString(),
      retryInformation:{attempts:3,maxAttempts:3,rateLimited:true,retryAfterSeconds:21600,nextRetryAt:"2026-07-20T06:00:00.000Z"},
      failureReason:"google_trends_rate_limited",
    }:{
      market,normalizedInterest:90-index*3,recentMomentum:40-index,confidence:.9,observationCompleteness:1,
      providerTimestamp:NOW.toISOString(),
      retryInformation:{attempts:1,maxAttempts:3,rateLimited:false,retryAfterSeconds:null,nextRetryAt:null},
      failureReason:null,
    }),
  },"linen");
}

function evidenceProvider() {
  return {async search(input:{audience:string;region:string;language:string}){
    return [
      {title:`${input.audience} linen shirt and trousers ${input.region} ${input.language}`,url:`https://vogue.example/${input.region}/${input.language}/${input.audience}`,domain:"vogue.example",shortExtract:"White linen shirt tucked into wide leg linen trousers with leather sandals and a belt",publishedAt:"2026-07-01T00:00:00.000Z",market:input.region,language:input.language},
      {title:`Local linen tailoring ${input.audience} ${input.region} ${input.language}`,url:`https://gq.example/${input.region}/${input.language}/${input.audience}`,domain:"gq.example",shortExtract:"Blue linen shirt layered with tailored linen trousers and black loafers",publishedAt:"2026-06-28T00:00:00.000Z",market:input.region,language:input.language},
    ];
  }};
}

function job():ResearchJob{return{id:"job",concept_id:"concept",canonical_keyword:"linen",requesting_market:"BR",season:"current",attempts:1,max_attempts:3};}

test("fresh authoritative canonical-keyword scores are read-only and support exactly three strongest markets",async()=>{
  const calls:string[]=[];
  const reader:AuthoritativeMarketScoreReader={
    async readGlobal(keyword){calls.push(`global:${keyword}`);return{lifecycle:"RISING",confidence:.88,latest_period:"2026-07"};},
    async readRegional(keyword){calls.push(`regional:${keyword}`);return MARKETS.map((region,index)=>({region,regional_momentum:80-index*2,confidence:.9,data_freshness:1,observation_count:12,current_interest_percentile:95-index*2,computed_at:NOW.toISOString()}));},
  };
  const plan=await loadAuthoritativeMarketPlan("linen","BR",{reader,now:NOW});
  assert.ok(plan);
  assert.deepEqual(calls,["global:linen","regional:linen"]);
  assert.equal(plan.marketSource,"authoritative_scores");
  assert.equal(plan.evaluatedMarkets.length,12);
  assert.equal(plan.strongestMarkets.length,3);
  assert.ok(plan.researchMarkets.includes("BR"));
  const source=await readFile(new URL("./market-authority.ts",import.meta.url),"utf8");
  assert.doesNotMatch(source,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
});

test("authoritative market scores bypass cached evidence and pytrends",async()=>{
  const researchJob=job();let pytrendsCalls=0;let cacheReads=0;let completed=false;
  const plan=selectStylingResearchMarkets({lifecycle:"RISING",requestingMarket:"BR",signals:MARKETS.map((region,index)=>({region,regionalMomentum:80-index*2,confidence:.9,dataFreshness:1,observationCount:12,currentInterestPercentile:95-index*2}))});
  const store:ResearchStore={async claim(){return researchJob},async loadMarketEvidence(){cacheReads++;return discoveryBatch()},async saveMarketEvidence(){throw new Error("live evidence must not be saved")},async insertEvidence(){},async checkpointEvidence(){completed=true},async retry(){throw new Error("unexpected retry")}};
  const result=await runResearchWorker({workerId:"test",store,interestProvider:{async discover(){pytrendsCalls++;return discoveryBatch()}},searchProvider:evidenceProvider(),now:NOW,authoritativeMarketPlanLoader:async(keyword)=>{assert.equal(keyword,"linen");return plan}});
  assert.equal(result.status,"evidence_ready");
  assert.equal(result.marketSource,"authoritative_scores");
  assert.equal(pytrendsCalls,0);
  assert.equal(cacheReads,0);
  assert.equal(completed,true);
  const workerSource=await readFile(new URL("./research-worker.ts",import.meta.url),"utf8");
  assert.doesNotMatch(workerSource,/image_generation_jobs|enqueue.*image/i);
});

test("last-known-good market evidence bypasses live pytrends when authority is unavailable",async()=>{
  let pytrendsCalls=0;
  const store:ResearchStore={async claim(){return job()},async loadMarketEvidence(){return discoveryBatch()},async saveMarketEvidence(){throw new Error("unexpected live save")},async insertEvidence(){},async checkpointEvidence(){},async retry(){throw new Error("unexpected retry")}};
  const result=await runResearchWorker({workerId:"test",store,interestProvider:{async discover(){pytrendsCalls++;return discoveryBatch()}},searchProvider:evidenceProvider(),now:NOW,authoritativeMarketPlanLoader:async()=>null});
  assert.equal(result.status,"evidence_ready");
  assert.equal(result.marketSource,"last_known_good_market_evidence");
  assert.equal(pytrendsCalls,0);
});

test("all-429 batches cannot select markets or replace successful evidence",()=>{
  const good=discoveryBatch();
  const existing=new Map(good.markets.map((market)=>[market.market,market.normalizedInterest]));
  const failed=discoveryBatch({allRateLimited:true});
  const partition=partitionMarketDiscoveryBatch(failed);
  for(const incoming of partition.successful)existing.set(incoming.market,incoming.normalizedInterest);
  assert.equal(partition.successful.length,0);
  assert.equal(partition.failed.length,12);
  assert.deepEqual([...existing.values()],good.markets.map((market)=>market.normalizedInterest));
  const plan=selectStylingResearchMarkets({lifecycle:"RISING",signals:failed.markets.map((market)=>({region:market.market,regionalMomentum:market.recentMomentum,confidence:market.confidence,dataFreshness:market.observationCompleteness,observationCount:0,currentInterestPercentile:market.normalizedInterest}))});
  assert.deepEqual(plan.strongestMarkets,[]);
});

test("zero-value markets cannot pass market validation",()=>{
  const plan=selectStylingResearchMarkets({lifecycle:"STABLE",requestingMarket:"IN",signals:MARKETS.map((region)=>({region,regionalMomentum:0,confidence:1,dataFreshness:1,observationCount:12,currentInterestPercentile:0}))});
  assert.equal(plan.strongestMarkets.length,0);
  assert.equal(plan.insufficientMarkets.length,12);
  assert.deepEqual(plan.researchMarkets,["IN"]);
});

test("safe diagnostics omit credentials and provider payloads",()=>{
  const secret="serper-key-super-secret";
  const diagnostic=safeResearchDiagnostic({status:"deferred",errorCategory:`${secret}:429`,marketSource:`live_pytrends:${secret}`,retryAfter:"2026-07-20T12:00:00Z",error:`payload ${secret}`} as never);
  const serialized=JSON.stringify(diagnostic);
  assert.doesNotMatch(serialized,/serper-key|payload|super-secret/);
  assert.deepEqual(diagnostic,{status:"deferred",error_category:"research_retryable",market_source:"none",retry_after:"2026-07-20T12:00:00.000Z"});
});

test("controlled linen recovery is dry-run-first and exact-job targeted",async()=>{
  let calls=0;
  const dry=await runLinenRecovery([],async()=>{calls++;return LINEN_RECOVERY_TARGET.jobId});
  assert.equal(dry.status,"dry_run");
  assert.equal(calls,0);
  await assert.rejects(runLinenRecovery(["--execute","--expected-attempts","2"]),/confirm-production-recovery is required/);
  await assert.rejects(runLinenRecovery(["--execute","--expected-attempts","2","--confirm-production-recovery"]),/confirm-fixed-code-deployed is required/);
  await assert.rejects(runLinenRecovery(["--execute","--expected-attempts","1","--confirm-production-recovery"]),/attempts=2/);
  let arguments_:Record<string,unknown>|null=null;
  const recovered=await runLinenRecovery(["--execute","--expected-attempts","2","--confirm-production-recovery","--confirm-fixed-code-deployed"],async(input)=>{calls++;arguments_=input;return LINEN_RECOVERY_TARGET.jobId});
  assert.equal(recovered.status,"recovered");
  assert.equal(calls,1);
  assert.deepEqual(arguments_,{target_job_id:LINEN_RECOVERY_TARGET.jobId,expected_concept_id:LINEN_RECOVERY_TARGET.conceptId,expected_attempts:2,production_confirmation:"CONFIRM_PRODUCTION_STYLING_JOB_RECOVERY"});
});

test("migration makes quota rollback and recovery atomic and service-role-only",async()=>{
  const migration=await readFile(new URL("../../database/031_trend_styling_market_reliability.sql",import.meta.url),"utf8");
  assert.match(migration,/attempts=attempts-1/);
  assert.match(migration,/status='researching'[\s\S]*attempts=expected_claimed_attempts/);
  assert.match(migration,/status='pending'[\s\S]*concept_id=expected_concept_id[\s\S]*attempts=expected_attempts/);
  for(const signature of ["defer_trend_style_research_job_quota\\(uuid,integer,timestamptz,text\\)","recover_trend_style_research_job_attempt\\(uuid,uuid,integer,text\\)"]){
    assert.match(migration,new RegExp(`revoke all on function ${signature} from public,anon,authenticated`,`i`));
    assert.match(migration,new RegExp(`grant execute on function ${signature} to service_role`,`i`));
  }
  assert.doesNotMatch(migration,/\b(insert into|update|delete from)\s+(global_trend_scores|regional_trend_scores|historical_trend_data)\b/i);
});
