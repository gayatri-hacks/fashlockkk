#!/usr/bin/env tsx
import "./load-env";
import { createClient } from "@supabase/supabase-js";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const supabase = createClient(
  process.env.SUPABASE_URL || requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

async function assertSelectable(table: string, columns: string) {
  const { error, count } = await supabase
    .from(table)
    .select(columns, { count: "exact", head: true });

  if (error) {
    throw new Error(`${table} missing required columns: ${error.message}`);
  }

  console.log(`${table}: present (${count ?? "unknown"} rows)`);
}

async function checkCatalogIndex() {
  const { data, error } = await supabase
    .schema("pg_catalog")
    .from("pg_indexes")
    .select("indexname,indexdef")
    .eq("schemaname", "public")
    .eq("tablename", "historical_trend_data")
    .eq("indexname", "historical_trend_data_keyword_month_market_unique_idx")
    .limit(1);

  if (error) {
    console.log(`unique index catalog check: skipped (${error.message})`);
    return;
  }

  const index = data?.[0];
  if (!index || !String(index.indexdef || "").includes("UNIQUE")) {
    throw new Error("historical_trend_data_keyword_month_market_unique_idx is not visible as a unique index");
  }

  console.log("historical_trend_data_keyword_month_market_unique_idx: present and unique");
}

async function main() {
  await assertSelectable(
    "historical_trend_data",
    "keyword_id,month,market,period_status,period_finalized_at,provider_finalized_at,ingestion_run_id",
  );
  await assertSelectable(
    "trend_period_region_status",
    "region,period_month,period_status,expected_period_end,provider_ready,row_count,keyword_count,attempted_at,finalized_at,retry_after,error_message,computation_version,metadata",
  );
  await assertSelectable(
    "trend_global_period_status",
    "period_month,period_status,expected_regions,complete_regions,missing_regions,material_coverage_ratio,is_materially_complete,computed_at,metadata",
  );
  console.log("period finalization views: none defined by migration 023");
  await checkCatalogIndex();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
