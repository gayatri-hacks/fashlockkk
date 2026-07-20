import { RetryableImageGenerationError } from "./image-generator";

export const LOCAL_OLLAMA_QUOTA_FALLBACK_FLAG = "ENABLE_LOCAL_OLLAMA_QUOTA_FALLBACK";
export function nextSafeQuotaWindow(error:RetryableImageGenerationError,now=new Date()){const seconds=Math.max(60,error.retryAfterSeconds||86400);return new Date(now.getTime()+seconds*1000).toISOString();}
export function buildCloudflareQuotaDeferral(job:{metadata?:Record<string,unknown>|null},error:RetryableImageGenerationError,now=new Date()){const retryAfter=nextSafeQuotaWindow(error,now);return {status:"deferred" as const,retry_after:retryAfter,deferred_provider:"cloudflare" as const,deferred_reason:"quota_exhausted" as const,locked_at:null,locked_by:null,error_message:`Cloudflare quota exhausted; retry after ${retryAfter}`,metadata:{...(job.metadata||{}),provider:"cloudflare",reason:"quota_exhausted",retryAfter,retryReason:"quota_exhausted"}};}
export function localQuotaFallbackEnabled(env:NodeJS.ProcessEnv=process.env){return env[LOCAL_OLLAMA_QUOTA_FALLBACK_FLAG]==="true";}
