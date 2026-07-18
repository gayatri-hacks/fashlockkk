#!/usr/bin/env tsx
import "./load-env";
import { recomputeMultiRegionTrends } from "../lib/trends/multi-region-pipeline";

function parseArgs(argv: string[]) {
  const options = {
    dryRun: true,
    limit: 75,
    refineNames: false,
    enqueueImages: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--write") options.dryRun = false;
    if (arg === "--dry-run") options.dryRun = true;
    if (arg === "--limit" && next) {
      options.limit = Number(next);
      index += 1;
    }
    if (arg === "--refine-names") options.refineNames = true;
    if (arg === "--enqueue-images") options.enqueueImages = true;
  }

  return options;
}

async function main() {
  const result = await recomputeMultiRegionTrends(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
