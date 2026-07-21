export const LINEN_FORMULA_RESUME_TARGET = {
  jobId: "2e0ef127-73cb-5bc6-8707-2d6305719e8c",
  conceptId: "37905936-ba71-5ea7-b0b9-72c3856527a7",
} as const;

export function parseLinenFormulaResumeArguments(argv: string[]) {
  const supported = new Set(["--dry-run", "--execute", "--confirm-production-formula-resume", "--confirm-migration-032-deployed"]);
  for (const item of argv) if (!supported.has(item)) throw new Error(`Unsupported formula resume argument: ${item}`);
  if (argv.includes("--dry-run") && argv.includes("--execute")) throw new Error("Choose either --dry-run or --execute");
  return {
    execute: argv.includes("--execute"),
    confirmed: argv.includes("--confirm-production-formula-resume"),
    migrationDeployed: argv.includes("--confirm-migration-032-deployed"),
  };
}

export async function runLinenFormulaResume(argv: string[], executeRpc?: (confirmation: string) => Promise<string | null>) {
  const options = parseLinenFormulaResumeArguments(argv);
  const target = { ...LINEN_FORMULA_RESUME_TARGET, mode: "formula_only" as const, providersCalled: false, imagesEnqueued: false };
  if (!options.execute) return { status: "dry_run" as const, ...target };
  if (!options.confirmed) throw new Error("--confirm-production-formula-resume is required with --execute");
  if (!options.migrationDeployed) throw new Error("--confirm-migration-032-deployed is required with --execute");
  if (!executeRpc) throw new Error("Formula resume RPC executor is required");
  const resumed = await executeRpc("CONFIRM_PRODUCTION_LINEN_FORMULA_ONLY_RESUME");
  if (resumed !== LINEN_FORMULA_RESUME_TARGET.jobId) throw new Error("Formula resume RPC did not return the exact linen job");
  return { status: "evidence_ready" as const, ...target };
}
