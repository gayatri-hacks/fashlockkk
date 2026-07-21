#!/usr/bin/env tsx
import "./load-env";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

function requirePattern(label:string,text:string,pattern:RegExp){assert.match(text,pattern,label);}

async function main(){
  const root=process.cwd();
  const [migration027,migration028,migration029,migration030,migration031,migration032,preflight]=await Promise.all([
    readFile(path.join(root,"database/027_trend_styling_intelligence.sql"),"utf8"),
    readFile(path.join(root,"database/028_trend_styling_market_research.sql"),"utf8"),
    readFile(path.join(root,"database/029_image_quota_deferral.sql"),"utf8"),
    readFile(path.join(root,"database/030_repo_owned_market_discovery.sql"),"utf8"),
    readFile(path.join(root,"database/031_trend_styling_market_reliability.sql"),"utf8"),
    readFile(path.join(root,"database/032_trend_styling_formula_completion_state.sql"),"utf8"),
    readFile(path.join(root,"database/verify_trend_styling_migrations.sql"),"utf8"),
  ]);
  const migrations=`${migration027}\n${migration028}\n${migration029}\n${migration030}\n${migration031}\n${migration032}`;
  assert.doesNotMatch(migrations,/\b(drop\s+table|truncate|delete\s+from)\b/i,"styling migrations must not delete tables or rows");
  assert.doesNotMatch(migrations,/\b(insert\s+into|update|delete\s+from)\s+(trend_keywords|regional_trend_scores|global_trend_scores)\b/i,"styling migrations must not write authoritative trend tables");

  requirePattern("027 creates evidence",migration027,/create table if not exists trend_style_evidence/i);
  requirePattern("027 creates formulas",migration027,/create table if not exists trend_outfit_formulas/i);
  requirePattern("027 formula hash uniqueness",migration027,/unique index if not exists trend_outfit_formulas_hash_uidx/i);
  requirePattern("027 approved slot uniqueness",migration027,/unique index if not exists trend_outfit_formulas_approved_slot_uidx/i);
  requirePattern("027 six variants",migration027,/trend_formula_women.*trend_formula_men/i);
  requirePattern("027 RLS",migration027,/alter table trend_style_evidence enable row level security/i);

  requirePattern("028 isolated concepts",migration028,/create table if not exists trend_style_concepts/i);
  requirePattern("028 exact six-formula approval",migration028,/formula_count<>6.*audience_count<>2.*slot_count<>3.*matrix_count<>6/is);
  requirePattern("028 atomic approval RPC",migration028,/create or replace function approve_trend_formula_set\(candidate_set_id uuid\)/i);
  requirePattern("028 approved set uniqueness",migration028,/unique index if not exists trend_outfit_formulas_approved_set_slot_uidx/i);
  requirePattern("028 generated image formula uniqueness",migration028,/unique index if not exists generated_fashion_images_formula_uidx/i);
  requirePattern("028 image job formula uniqueness",migration028,/unique index if not exists image_generation_jobs_formula_uidx/i);
  const securityDefiners=(migration028.match(/security definer/gi)||[]).length;
  const fixedSearchPaths=(migration028.match(/security definer set search_path=public/gi)||[]).length;
  assert.equal(fixedSearchPaths,securityDefiners,"every SECURITY DEFINER function in 028 must fix search_path=public");
  for(const signature of ["approve_trend_formula_set\\(uuid\\)","claim_next_trend_style_research_job\\(text\\)"]){
    requirePattern(`${signature} public revoke`,migration028,new RegExp(`revoke all on function ${signature} from public\\s*,?\\s*anon\\s*,?\\s*authenticated`,`i`));
    requirePattern(`${signature} service grant`,migration028,new RegExp(`grant execute on function ${signature} to service_role`,`i`));
  }

  requirePattern("030 isolated market cache",migration030,/create table if not exists trend_style_market_evidence/i);
  for(const column of ["normalized_interest","recent_momentum","confidence","observation_completeness","provider_timestamp","retry_information","failure_reason","expires_at","selected_market_reasons","retry_after"]){requirePattern(`030 ${column}`,migration030,new RegExp(`\\b${column}\\b`,`i`));}
  for(const market of ["IN","US","GB","FR","IT","DE","JP","KR","AU","BR","SG","AE"]){requirePattern(`030 market ${market}`,migration030,new RegExp(`'${market}'`));}
  requirePattern("030 deferred job uniqueness",migration030,/unique index if not exists image_generation_jobs_formula_active_uidx[\s\S]*'deferred'/i);
  requirePattern("030 internal cache RLS",migration030,/alter table trend_style_market_evidence enable row level security/i);
  requirePattern("030 internal access revoked",migration030,/revoke all on table trend_style_market_evidence from public,anon,authenticated/i);
  requirePattern("030 service role access",migration030,/grant select,insert,update,delete on table trend_style_market_evidence to service_role/i);
  requirePattern("030 retry-aware claim",migration030,/retry_after is null or retry_after<=now\(\)/i);
  const migration030SecurityDefiners=(migration030.match(/security definer/gi)||[]).length;
  const migration030FixedSearchPaths=(migration030.match(/security definer set search_path=public/gi)||[]).length;
  assert.equal(migration030FixedSearchPaths,migration030SecurityDefiners,"every SECURITY DEFINER function in 030 must fix search_path=public");

  requirePattern("031 separate failure diagnostics",migration031,/create table if not exists trend_style_market_discovery_failures/i);
  requirePattern("031 quota attempt release",migration031,/create or replace function defer_trend_style_research_job_quota[\s\S]*attempts=attempts-1[\s\S]*status='researching'[\s\S]*attempts=expected_claimed_attempts/i);
  requirePattern("031 exact recovery guard",migration031,/create or replace function recover_trend_style_research_job_attempt[\s\S]*CONFIRM_PRODUCTION_STYLING_JOB_RECOVERY[\s\S]*concept_id=expected_concept_id[\s\S]*attempts=expected_attempts/i);
  requirePattern("031 failure RLS",migration031,/alter table trend_style_market_discovery_failures enable row level security/i);
  requirePattern("031 failure public revoke",migration031,/revoke all on table trend_style_market_discovery_failures from public,anon,authenticated/i);
  requirePattern("031 failure service role",migration031,/grant select,insert,update,delete on table trend_style_market_discovery_failures to service_role/i);
  const migration031SecurityDefiners=(migration031.match(/security definer/gi)||[]).length;
  const migration031FixedSearchPaths=(migration031.match(/security definer set search_path=public/gi)||[]).length;
  assert.equal(migration031FixedSearchPaths,migration031SecurityDefiners,"every SECURITY DEFINER function in 031 must fix search_path=public");
  for(const signature of ["defer_trend_style_research_job_quota\\(uuid,integer,timestamptz,text\\)","recover_trend_style_research_job_attempt\\(uuid,uuid,integer,text\\)"]){
    requirePattern(`${signature} public revoke`,migration031,new RegExp(`revoke all on function ${signature} from public\\s*,?\\s*anon\\s*,?\\s*authenticated`,`i`));
    requirePattern(`${signature} service grant`,migration031,new RegExp(`grant execute on function ${signature} to service_role`,`i`));
  }

  for(const state of ["pending","researching","evidence_ready","formula_generating","completed","validating","images_pending","insufficient_evidence","failed"]){requirePattern(`032 compatible state ${state}`,migration032,new RegExp(`'${state}'`,`i`));}
  requirePattern("032 replacement status constraint",migration032,/drop constraint if exists trend_style_research_jobs_status_check[\s\S]*add constraint trend_style_research_jobs_status_check check/i);
  requirePattern("032 active state uniqueness",migration032,/create unique index if not exists trend_style_research_jobs_formula_active_uidx[\s\S]*evidence_ready[\s\S]*formula_generating/i);
  requirePattern("032 evidence checkpoint",migration032,/create or replace function mark_trend_style_research_evidence_ready/i);
  requirePattern("032 formula claim",migration032,/create or replace function begin_trend_style_formula_generation[\s\S]*status='formula_generating'[\s\S]*status='evidence_ready'[\s\S]*retry_after/i);
  requirePattern("032 formula quota deferral",migration032,/create or replace function defer_trend_style_formula_quota/i);
  requirePattern("032 non-quota evidence return",migration032,/create or replace function return_trend_style_formula_to_evidence_ready[\s\S]*status='evidence_ready'[\s\S]*status='formula_generating'/i);
  requirePattern("032 atomic approval and completion",migration032,/create or replace function approve_trend_formula_set_and_complete_job[\s\S]*formula_count<>6[\s\S]*approved_count<>6[\s\S]*status='completed'/i);
  requirePattern("032 exact linen resume",migration032,/resume_exact_linen_formula_job[\s\S]*2e0ef127-73cb-5bc6-8707-2d6305719e8c[\s\S]*37905936-ba71-5ea7-b0b9-72c3856527a7[\s\S]*not exists/i);
  assert.doesNotMatch(migration032,/\b(drop\s+table|truncate|delete\s+from)\b/i,"032 must preserve all production data");
  assert.doesNotMatch(migration032,/alter table\s+\w+\s+disable row level security/i,"032 must retain existing RLS");
  const migration032SecurityDefiners=(migration032.match(/security definer/gi)||[]).length;
  const migration032FixedSearchPaths=(migration032.match(/security definer set search_path=public/gi)||[]).length;
  assert.equal(migration032FixedSearchPaths,migration032SecurityDefiners,"every SECURITY DEFINER function in 032 must fix search_path=public");
  for(const signature of [
    "mark_trend_style_research_evidence_ready\\(uuid,integer,text\\[\\],text\\[\\],jsonb,text\\)",
    "begin_trend_style_formula_generation\\(uuid\\)",
    "defer_trend_style_formula_quota\\(uuid,timestamptz,text\\)",
    "return_trend_style_formula_to_evidence_ready\\(uuid,text\\)",
    "approve_trend_formula_set_and_complete_job\\(uuid,uuid\\)",
    "resume_exact_linen_formula_job\\(text\\)",
  ]){
    requirePattern(`${signature} public revoke`,migration032,new RegExp(`revoke all on function ${signature} from public\\s*,?\\s*anon\\s*,?\\s*authenticated`,`i`));
    requirePattern(`${signature} service grant`,migration032,new RegExp(`grant execute on function ${signature} to service_role`,`i`));
  }
  requirePattern("032 inherited job RLS",`${migration028}\n${migration030}`,/alter table trend_style_research_jobs enable row level security/i);

  assert.doesNotMatch(preflight,/^\s*(insert|update|delete|create|alter|drop|truncate)\b/im,"catalog preflight must remain read-only");
  for(const check of ["027_prerequisite","028_prerequisite","029_prerequisite","030_prerequisite","031_prerequisite","compatibility","formula and six-image uniqueness","RLS enabled","service-role-only"]){requirePattern(`preflight ${check}`,preflight,new RegExp(check.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"));}
  console.log("Trend styling migration static preflight: passed");
  console.log("- deployed prerequisites: database/027_trend_styling_intelligence.sql then database/028_trend_styling_market_research.sql then database/029_image_quota_deferral.sql");
  console.log("- migration order: database/027_trend_styling_intelligence.sql, 028_trend_styling_market_research.sql, 029_image_quota_deferral.sql, 030_repo_owned_market_discovery.sql, 031_trend_styling_market_reliability.sql, then 032_trend_styling_formula_completion_state.sql");
  console.log("- destructive/conflicting authoritative-table behavior: none detected");

  if(process.argv.includes("--database")){
    const databaseUrl=process.env.TREND_STYLING_PREFLIGHT_DATABASE_URL;
    if(!databaseUrl)throw new Error("TREND_STYLING_PREFLIGHT_DATABASE_URL is required with --database");
    const result=spawnSync("psql",[databaseUrl,"-X","-v","ON_ERROR_STOP=1","-A","-t","-F","\t","-f",path.join(root,"database/verify_trend_styling_migrations.sql")],{encoding:"utf8",env:process.env});
    if(result.error)throw result.error;
    if(result.status!==0)throw new Error(`Read-only database preflight failed (${result.status})`);
    const lines=String(result.stdout||"").split(/\r?\n/).filter(Boolean);const failed=lines.filter((line)=>line.endsWith("\tf"));
    if(result.stderr)process.stderr.write(result.stderr);
    process.stdout.write(lines.map((line)=>`${line}\n`).join(""));
    if(failed.length)throw new Error(`Read-only database preflight reported ${failed.length} failed checks`);
  }else{
    console.log("- database catalog checks: skipped (use --database with TREND_STYLING_PREFLIGHT_DATABASE_URL)");
  }
}

main().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exit(1);});
