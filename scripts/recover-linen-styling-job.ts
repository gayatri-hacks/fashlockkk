#!/usr/bin/env node
import "./load-env";
import { requireManualServiceRole } from "../lib/trend-styling/manual-job";
import { parseLinenRecoveryArguments, runLinenRecovery } from "../lib/trend-styling/linen-recovery";
import { getSupabaseClient } from "../lib/supabase";

async function main() {
  const argv=process.argv.slice(2);
  const options=parseLinenRecoveryArguments(argv);
  const result=await runLinenRecovery(argv,options.execute ? async (arguments_)=>{
    requireManualServiceRole();
    const db=getSupabaseClient();
    if (!db) throw new Error("Supabase service-role client is unavailable");
    const {data,error}=await db.rpc("recover_trend_style_research_job_attempt",arguments_);
    if (error) throw error;
    return typeof data === "string" ? data : null;
  }:undefined);
  console.log(JSON.stringify(result));
}

main().catch((error)=>{
  console.error(error instanceof Error?error.message:"Controlled linen recovery failed");
  process.exitCode=1;
});
