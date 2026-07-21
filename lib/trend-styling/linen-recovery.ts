export const LINEN_RECOVERY_TARGET = {
  jobId: "2e0ef127-73cb-5bc6-8707-2d6305719e8c",
  conceptId: "37905936-ba71-5ea7-b0b9-72c3856527a7",
  expectedAttempts: 2,
} as const;

export function parseLinenRecoveryArguments(argv: string[]) {
  const values = new Map<string,string>();
  const flags = new Set<string>();
  for (let index=0;index<argv.length;index+=1) {
    const item=argv[index];
    if (item === "--execute" || item === "--confirm-production-recovery" || item === "--confirm-fixed-code-deployed") {
      flags.add(item);
      continue;
    }
    if (item === "--expected-attempts") {
      const value=argv[index+1];
      if (!value || value.startsWith("--")) throw new Error("--expected-attempts requires a value");
      values.set(item,value);
      index+=1;
      continue;
    }
    throw new Error(`Unsupported recovery argument: ${item}`);
  }
  const expectedAttempts=Number(values.get("--expected-attempts")||LINEN_RECOVERY_TARGET.expectedAttempts);
  if (expectedAttempts!==LINEN_RECOVERY_TARGET.expectedAttempts) throw new Error("Recovery requires expected attempts=2");
  return {
    execute:flags.has("--execute"),
    confirmed:flags.has("--confirm-production-recovery"),
    fixedCodeDeployed:flags.has("--confirm-fixed-code-deployed"),
    expectedAttempts,
  };
}

export async function runLinenRecovery(
  argv: string[],
  executeRpc?: (arguments_:Record<string,unknown>)=>Promise<string|null>,
) {
  const options=parseLinenRecoveryArguments(argv);
  const safeTarget={
    jobId:LINEN_RECOVERY_TARGET.jobId,
    conceptId:LINEN_RECOVERY_TARGET.conceptId,
    expectedAttempts:options.expectedAttempts,
  };
  if (!options.execute) return {status:"dry_run" as const,...safeTarget};
  if (!options.confirmed) throw new Error("--confirm-production-recovery is required with --execute");
  if (!options.fixedCodeDeployed) throw new Error("--confirm-fixed-code-deployed is required with --execute");
  if (!executeRpc) throw new Error("Recovery RPC executor is required");
  const recoveredId=await executeRpc({
    target_job_id:LINEN_RECOVERY_TARGET.jobId,
    expected_concept_id:LINEN_RECOVERY_TARGET.conceptId,
    expected_attempts:options.expectedAttempts,
    production_confirmation:"CONFIRM_PRODUCTION_STYLING_JOB_RECOVERY",
  });
  if (recoveredId!==LINEN_RECOVERY_TARGET.jobId) throw new Error("Recovery RPC did not return the exact linen job");
  return {status:"recovered" as const,...safeTarget};
}
