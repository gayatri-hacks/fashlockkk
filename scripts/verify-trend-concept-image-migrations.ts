#!/usr/bin/env tsx
import "./load-env";
import { createClient } from "@supabase/supabase-js";

function envValue(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for migration preflight verification`);
  return value;
}

async function tableReadable(supabase: any, table: string) {
  const { error } = await supabase.from(table).select("id", { head: true, count: "exact" }).limit(1);
  return {
    ok: !error,
    error: error?.message || null,
  };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required");

  const serviceRole = createClient(supabaseUrl, envValue("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const anon = anonKey
    ? createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const reviews = await tableReadable(serviceRole, "trend_concept_image_reviews");
  const candidates = await tableReadable(serviceRole, "trend_concept_image_candidates");
  const installed024 = reviews.ok && candidates.ok;

  console.log("Trend concept image migration preflight");
  console.log("---------------------------------------");
  console.log(`024 installed: ${installed024 ? "yes" : "no"}`);
  console.log(`- trend_concept_image_reviews service_role read: ${reviews.ok ? "ok" : `failed (${reviews.error})`}`);
  console.log(`- trend_concept_image_candidates service_role read: ${candidates.ok ? "ok" : `failed (${candidates.error})`}`);
  console.log("");
  console.log("Required execution order:");
  console.log("1. database/024_trend_concept_image_review.sql");
  console.log("2. database/025_trend_concept_pixel_validation.sql");
  console.log("3. database/026_trend_concept_validation_security.sql");

  if (anon) {
    const anonReviews = await tableReadable(anon, "trend_concept_image_reviews");
    const anonCandidates = await tableReadable(anon, "trend_concept_image_candidates");
    console.log("");
    console.log("Anon privacy check after 026:");
    console.log(`- trend_concept_image_reviews anon read blocked: ${anonReviews.ok ? "no" : "yes"}`);
    console.log(`- trend_concept_image_candidates anon read blocked: ${anonCandidates.ok ? "no" : "yes"}`);
  } else {
    console.log("");
    console.log("Anon privacy check skipped: NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY is not configured.");
  }

  if (!installed024) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
