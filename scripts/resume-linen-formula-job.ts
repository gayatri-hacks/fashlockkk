#!/usr/bin/env node
import "./load-env";
import { getSupabaseClient } from "../lib/supabase";
import { requireManualServiceRole } from "../lib/trend-styling/manual-job";
import { runLinenFormulaResume } from "../lib/trend-styling/linen-formula-resume";

async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const result = await runLinenFormulaResume(argv, execute ? async (productionConfirmation) => {
    requireManualServiceRole();
    const db = getSupabaseClient();
    if (!db) throw new Error("Supabase service-role client is unavailable");
    const { data, error } = await db.rpc("resume_exact_linen_formula_job", { production_confirmation: productionConfirmation });
    if (error) throw error;
    return typeof data === "string" ? data : null;
  } : undefined);
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Controlled linen formula resume failed");
  process.exitCode = 1;
});
