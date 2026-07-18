#!/usr/bin/env tsx
import "./load-env";
import { appendFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function monthStart(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function addMonths(month: string, count: number) {
  const date = new Date(`${month}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return monthStart(date);
}

const supabase = createClient(
  process.env.SUPABASE_URL || requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

async function main() {
  const currentMonth = monthStart(new Date());
  const previousMonth = addMonths(currentMonth, -1);

  const { data: regionRows, error: regionError } = await supabase
    .from("trend_period_region_status")
    .select("region,period_month,period_status,provider_ready,row_count,keyword_count,attempted_at,finalized_at,error_message")
    .in("period_month", [previousMonth, currentMonth])
    .order("period_month", { ascending: false })
    .order("region", { ascending: true });

  if (regionError) throw regionError;

  const { data: globalRows, error: globalError } = await supabase
    .from("trend_global_period_status")
    .select("period_month,period_status,expected_regions,complete_regions,missing_regions,material_coverage_ratio,is_materially_complete,computed_at")
    .in("period_month", [previousMonth, currentMonth])
    .order("period_month", { ascending: false });

  if (globalError) throw globalError;

  const lines = [
    "## Trend period status",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `Current partial month: ${currentMonth}`,
    `Previous month: ${previousMonth}`,
    "",
    "### Global coverage",
    "",
    "| Period | Status | Coverage | Complete regions | Missing regions |",
    "| --- | --- | ---: | --- | --- |",
    ...(globalRows || []).map((row) => {
      const coverage = Number(row.material_coverage_ratio || 0);
      return `| ${row.period_month} | ${row.period_status} | ${(coverage * 100).toFixed(0)}% | ${(row.complete_regions || []).join(", ") || "-"} | ${(row.missing_regions || []).join(", ") || "-"} |`;
    }),
    "",
    "### Regional status",
    "",
    "| Period | Region | Status | Ready | Rows | Keywords | Finalized at | Error |",
    "| --- | --- | --- | --- | ---: | ---: | --- | --- |",
    ...(regionRows || []).map((row) =>
      `| ${row.period_month} | ${row.region} | ${row.period_status} | ${row.provider_ready ? "yes" : "no"} | ${row.row_count || 0} | ${row.keyword_count || 0} | ${row.finalized_at || "-"} | ${String(row.error_message || "-").replaceAll("|", "\\|")} |`,
    ),
    "",
  ];

  const output = lines.join("\n");
  console.log(output);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${output}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
