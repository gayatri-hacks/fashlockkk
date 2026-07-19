import { FASHION_IMAGE_VARIANTS, type FashionImageVariant } from "@/lib/images/build-fashion-image-prompt";

export type ImageWorkerClaimRpc = {
  name: "claim_next_image_generation_job" | "claim_next_image_generation_job_for_variant";
  args: {
    worker_id: string;
    lock_timeout_minutes: number;
    desired_variant?: FashionImageVariant;
  };
};

export function parseImageWorkerVariant(value: string | undefined): FashionImageVariant | null {
  if (!value) return null;
  if (FASHION_IMAGE_VARIANTS.includes(value as FashionImageVariant)) return value as FashionImageVariant;
  throw new Error(`IMAGE_WORKER_VARIANT must be one of: ${FASHION_IMAGE_VARIANTS.join(", ")}`);
}

export function buildImageWorkerClaimRpc({
  workerId,
  lockTimeoutMinutes,
  desiredVariant,
}: {
  workerId: string;
  lockTimeoutMinutes: number;
  desiredVariant?: FashionImageVariant | null;
}): ImageWorkerClaimRpc {
  if (!desiredVariant) {
    return {
      name: "claim_next_image_generation_job",
      args: {
        worker_id: workerId,
        lock_timeout_minutes: lockTimeoutMinutes,
      },
    };
  }

  return {
    name: "claim_next_image_generation_job_for_variant",
    args: {
      worker_id: workerId,
      desired_variant: desiredVariant,
      lock_timeout_minutes: lockTimeoutMinutes,
    },
  };
}
