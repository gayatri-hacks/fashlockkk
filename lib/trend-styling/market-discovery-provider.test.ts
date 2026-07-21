import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRepoOwnedMarketInterestProvider, MARKET_DISCOVERY_LIMITS, parseRepoMarketDiscoveryBatch } from "./market-discovery-provider";
import { runResearchWorker, type ResearchJob, type ResearchStore } from "./research-worker";

const markets = ["IN","US","GB","FR","IT","DE","JP","KR","AU","BR","SG","AE"] as const;

function mockedBatch() {
  return {
    schemaVersion: "repo-pytrends-market-discovery-v1",
    provider: "google_trends_pytrends",
    canonicalKeyword: "linen",
    generatedAt: "2026-07-20T00:00:00Z",
    cacheHit: false,
    providerCalls: 13,
    maximumProviderCalls: 18,
    markets: markets.map((market,index)=>({
      market,
      normalizedInterest: 90-index,
      recentMomentum: 25-index,
      confidence: .9,
      observationCompleteness: 1,
      providerTimestamp: "2026-07-20T00:00:00Z",
      retryInformation: {attempts:1,maxAttempts:3,rateLimited:false,retryAfterSeconds:null,nextRetryAt:null},
      failureReason: null,
    })),
  };
}

test("repo-owned market provider validates one mocked 12-market batch without HTTP",async()=>{
  let calls=0;
  const provider=createRepoOwnedMarketInterestProvider(async(keyword)=>{calls++;assert.equal(keyword,"linen");return mockedBatch();});
  const result=await provider.discover({keyword:" Linen ",conceptId:"isolated-concept"});
  assert.equal(calls,1);
  assert.equal(result.markets.length,12);
  assert.equal(new Set(result.markets.map(({market})=>market)).size,12);
  assert.ok(result.providerCalls<=MARKET_DISCOVERY_LIMITS.maxProviderCallsPerKeyword);
  assert.ok(result.markets.every((market)=>market.providerTimestamp&&market.retryInformation));
});

test("market discovery parser rejects missing or duplicate configured markets",()=>{
  const value=mockedBatch();
  value.markets[11]={...value.markets[11],market:"IN"};
  assert.throws(()=>parseRepoMarketDiscoveryBatch(value,"linen"),/duplicate or missing/i);
});

test("rate-limited market discovery atomically defers without consuming an attempt",async()=>{
  const job:ResearchJob={id:"job",concept_id:"concept",canonical_keyword:"linen",requesting_market:"IN",season:"summer",attempts:2,max_attempts:3};
  let retryAfter:string|null|undefined;let searches=0;let providerCalls=0;let attempts=job.attempts;let ordinaryRetries=0;
  const store:ResearchStore={async claim(){return job},async saveMarketEvidence(){},async insertEvidence(){throw new Error("unexpected evidence insert")},async checkpointEvidence(){throw new Error("unexpected completion")},async retry(){ordinaryRetries++},async deferQuota(_job,error){retryAfter=error.retryAfter;attempts-=1}};
  const batch:any=mockedBatch();batch.markets=batch.markets.map((market:any)=>({...market,normalizedInterest:0,recentMomentum:0,confidence:0,observationCompleteness:0,failureReason:"google_trends_rate_limited",retryInformation:{attempts:3,maxAttempts:3,rateLimited:true,retryAfterSeconds:120,nextRetryAt:"2026-07-20T00:02:00Z"}}));
  const result=await runResearchWorker({workerId:"test",store,interestProvider:{async discover(){providerCalls++;return parseRepoMarketDiscoveryBatch(batch,"linen")}},searchProvider:{async search(){searches++;return[]}},now:new Date("2026-07-20T00:00:00Z"),authoritativeMarketPlanLoader:async()=>null});
  assert.equal(result.status,"deferred");
  assert.equal(providerCalls,1);
  assert.equal(searches,0);
  assert.equal(ordinaryRetries,0);
  assert.equal(attempts,1);
  assert.equal(retryAfter,"2026-07-20T12:00:00.000Z");
});

test("manual workflow owns Python market discovery and has no undefined endpoint dependency",async()=>{
  const [workflow,worker,provider,migration]=await Promise.all([
    readFile(new URL("../../.github/workflows/manual-trend-styling-research.yml",import.meta.url),"utf8"),
    readFile(new URL("./research-worker.ts",import.meta.url),"utf8"),
    readFile(new URL("./market-discovery-provider.ts",import.meta.url),"utf8"),
    readFile(new URL("../../database/030_repo_owned_market_discovery.sql",import.meta.url),"utf8"),
  ]);
  assert.match(workflow,/actions\/setup-python@v5/);
  assert.match(workflow,/pip install -r scraper\/requirements\.txt/);
  assert.match(workflow,/test_discover_keyword_markets/);
  assert.match(workflow,/run-manual-trend-styling-research\.ts "\$\{args\[@\]\}"/);
  assert.match(workflow,/args\+=\(--execute\)/);
  const removedEndpoint=["TREND","MARKET","DISCOVERY","ENDPOINT"].join("_");
  const removedToken=["TREND","MARKET","DISCOVERY","TOKEN"].join("_");
  assert.equal(`${workflow}\n${worker}\n${provider}`.includes(removedEndpoint),false);
  assert.equal(`${workflow}\n${worker}\n${provider}`.includes(removedToken),false);
  assert.match(migration,/create table if not exists trend_style_market_evidence/);
  assert.doesNotMatch(migration,/insert into (trend_keywords|regional_trend_scores|global_trend_scores)/i);
});
