import type { SupportedTrendRegion } from "@/lib/trends/config";
import { MARKET_RESEARCH_LANGUAGES } from "./market-selection";

export type PublicEvidenceResult = {
  title: string;
  url: string;
  domain: string;
  shortExtract: string;
  publishedAt: string | null;
  market?: string;
  language?: string;
};

export interface StylingEvidenceSearchProvider {
  search(input: {
    keyword: string;
    audience: "women" | "men";
    region: string;
    season: string;
    language: string;
  }): Promise<PublicEvidenceResult[]>;
}

export const SERPER_REQUEST_RESULT_COUNT = 10;
export const SERPER_USABLE_RESULT_LIMIT = 6;
export const SERPER_CREDIT_EXHAUSTION_RETRY_SECONDS = 12 * 60 * 60;
const PROVIDER_ERROR_BODY_LIMIT_BYTES = 2_048;
const PROVIDER_REASON_LIMIT = 240;

export const SERPER_MARKET_LANGUAGE_SETTINGS = {
  IN: { gl: "in", languages: { en: "en", hi: "hi" } },
  US: { gl: "us", languages: { en: "en" } },
  GB: { gl: "gb", languages: { en: "en" } },
  FR: { gl: "fr", languages: { fr: "fr", en: "en" } },
  IT: { gl: "it", languages: { it: "it", en: "en" } },
  DE: { gl: "de", languages: { de: "de", en: "en" } },
  JP: { gl: "jp", languages: { ja: "ja", en: "en" } },
  KR: { gl: "kr", languages: { ko: "ko", en: "en" } },
  AU: { gl: "au", languages: { en: "en" } },
  BR: { gl: "br", languages: { pt: "pt", en: "en" } },
  SG: { gl: "sg", languages: { en: "en", zh: "zh-cn" } },
  AE: { gl: "ae", languages: { ar: "ar", en: "en" } },
} as const satisfies Record<SupportedTrendRegion, { gl: string; languages: Record<string, string> }>;

const LOCAL_QUERY_TERMS: Record<string, { women: string; men: string; phrase: string }> = {
  en: { women: "women's", men: "men's", phrase: "how to wear outfit styling street style" },
  hi: { women: "महिलाओं", men: "पुरुषों", phrase: "कैसे पहनें आउटफिट स्टाइलिंग" },
  fr: { women: "femme", men: "homme", phrase: "comment porter idées de tenue street style" },
  it: { women: "donna", men: "uomo", phrase: "come indossare idee outfit street style" },
  de: { women: "Damen", men: "Herren", phrase: "kombinieren Outfit Ideen Streetstyle" },
  ja: { women: "レディース", men: "メンズ", phrase: "着こなし コーデ ストリートスタイル" },
  ko: { women: "여성", men: "남성", phrase: "코디 스타일링 스트리트 패션" },
  pt: { women: "feminino", men: "masculino", phrase: "como usar ideias de looks street style" },
  zh: { women: "女士", men: "男士", phrase: "穿搭 造型 街拍" },
  ar: { women: "نسائي", men: "رجالي", phrase: "كيفية التنسيق أفكار إطلالات" },
};

export type SerperFailureKind =
  | "invalid_request"
  | "credential_problem"
  | "quota_exhausted"
  | "quota_or_rate_limit"
  | "temporary_provider_failure"
  | "provider_failure";

export class SerperEvidenceSearchError extends Error {
  constructor(
    readonly kind: SerperFailureKind,
    readonly status: number,
    readonly providerCode: string | null,
    readonly providerReason: string,
    readonly retryAfterSeconds: number | null,
  ) {
    const code = providerCode ? `; code=${providerCode}` : "";
    const retry = retryAfterSeconds ? `; retry_after=${retryAfterSeconds}s` : "";
    super(`Evidence search ${kind} (${status}${code}${retry}): ${providerReason}`);
    this.name = "SerperEvidenceSearchError";
  }
}

export class EvidenceProviderQuotaError extends SerperEvidenceSearchError {
  readonly errorCategory = "quota_exhausted" as const;
  readonly provider = "serper" as const;

  constructor(
    status: number,
    providerCode: string | null,
    providerReason: string,
    retryAfterSeconds = SERPER_CREDIT_EXHAUSTION_RETRY_SECONDS,
  ) {
    super("quota_exhausted", status, providerCode, providerReason, retryAfterSeconds);
    this.name = "EvidenceProviderQuotaError";
  }
}

export function resolveSerperLocale(region: string, language: string) {
  const market = region.trim().toUpperCase() as SupportedTrendRegion;
  const settings = SERPER_MARKET_LANGUAGE_SETTINGS[market];
  if (!settings) throw new Error(`Unsupported Serper market: ${region}`);
  if (!MARKET_RESEARCH_LANGUAGES[market].includes(language)) {
    throw new Error(`Unsupported research language for ${market}`);
  }
  const hl = (settings.languages as Record<string, string>)[language];
  if (!hl) throw new Error(`Missing Serper language mapping for ${market}`);
  return { market, language, gl: settings.gl, hl };
}

export function buildBoundedStylingSearches(input: {
  keyword: string;
  audience: "women" | "men";
  region: string;
  season: string;
  language: string;
}) {
  resolveSerperLocale(input.region, input.language);
  const terms = LOCAL_QUERY_TERMS[input.language] || LOCAL_QUERY_TERMS.en;
  const season = input.season.trim().toLowerCase() === "current" ? "" : ` ${input.season.trim()}`;
  return [`${input.keyword.trim()} ${terms[input.audience]}${season} ${terms.phrase}`.replace(/\s+/g, " ").trim()];
}

export function buildSerperSearchRequest(input: {
  keyword: string;
  audience: "women" | "men";
  region: string;
  season: string;
  language: string;
}) {
  const locale = resolveSerperLocale(input.region, input.language);
  const [q] = buildBoundedStylingSearches(input);
  return { q, gl: locale.gl, hl: locale.hl, num: SERPER_REQUEST_RESULT_COUNT };
}

function publishedDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseSerperStylingResults(payload: unknown, input: { region: string; language: string }) {
  const organic = payload && typeof payload === "object" && Array.isArray((payload as { organic?: unknown[] }).organic)
    ? (payload as { organic: Array<Record<string, unknown>> }).organic
    : [];
  const ranked = organic.map((item, index) => ({
    item,
    rank: Number.isFinite(Number(item.position)) ? Number(item.position) : index + 1,
  })).sort((left, right) => left.rank - right.rank);
  const results: PublicEvidenceResult[] = [];
  for (const { item } of ranked) {
    if (results.length >= SERPER_USABLE_RESULT_LIMIT) break;
    try {
      const title = String(item.title || "").trim().slice(0, 240);
      const shortExtract = String(item.snippet || "").trim().slice(0, 500);
      if (!title || !shortExtract) continue;
      const url = new URL(String(item.link));
      if (!/^https?:$/.test(url.protocol)) continue;
      results.push({
        title,
        url: url.toString(),
        domain: url.hostname.replace(/^www\./, ""),
        shortExtract,
        publishedAt: publishedDate(item.date),
        market: input.region,
        language: input.language,
      });
    } catch {
      // A malformed organic result is unusable; continue within the local six-result cap.
    }
  }
  return results;
}

async function readBoundedResponseText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remaining = PROVIDER_ERROR_BODY_LIMIT_BYTES;
  let text = "";
  try {
    while (remaining > 0) {
      const { done, value } = await reader.read();
      if (done) break;
      const bounded = value.subarray(0, remaining);
      remaining -= bounded.byteLength;
      text += decoder.decode(bounded, { stream: remaining > 0 });
      if (bounded.byteLength < value.byteLength) break;
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text;
}

function sanitizeProviderValue(value: unknown, apiKey: string, limit: number) {
  let safe = String(value || "");
  if (apiKey) safe = safe.split(apiKey).join("[redacted]");
  return safe
    .replace(/((?:x-)?api[-_ ]?key\s*[:=]\s*)[^\s,;}]+/gi, "$1[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function extractProviderDiagnostic(text: string, apiKey: string) {
  let parsed: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(text) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const nested = parsed?.error && typeof parsed.error === "object" && !Array.isArray(parsed.error)
    ? parsed.error as Record<string, unknown>
    : null;
  const reasonValue = parsed?.message
    || (typeof parsed?.error === "string" ? parsed.error : null)
    || nested?.message
    || nested?.reason;
  const codeValue = parsed?.code || nested?.code || nested?.status;
  const retryValue = parsed?.retryAfterSeconds || parsed?.retry_after || nested?.retryAfterSeconds || nested?.retry_after;
  const boundedCreditReason = /\bnot enough credits\b/i.exec(text)?.[0] || null;
  const plainTextReason = !reasonValue && text.trim() && !/^[{[]/.test(text.trim())
    ? text.trim().split(/\r?\n/, 1)[0]
    : null;
  return {
    reason: sanitizeProviderValue(reasonValue || boundedCreditReason || plainTextReason || "provider returned no safe diagnostic", apiKey, PROVIDER_REASON_LIMIT),
    code: codeValue ? sanitizeProviderValue(codeValue, apiKey, 64) : null,
    retryAfterSeconds: Number.isFinite(Number(retryValue)) ? Math.max(1, Math.min(86_400, Number(retryValue))) : null,
  };
}

function retryAfterHeaderSeconds(value: string | null, now = new Date()) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.min(86_400, Math.ceil(numeric));
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(1, Math.min(86_400, Math.ceil((date.getTime() - now.getTime()) / 1_000)));
}

async function serperHttpError(response: Response, apiKey: string) {
  const diagnostic = extractProviderDiagnostic(await readBoundedResponseText(response), apiKey);
  const status = response.status;
  const creditExhausted = /\bnot enough credits\b/i.test(`${diagnostic.code || ""} ${diagnostic.reason}`);
  if (status === 400 && creditExhausted) {
    return new EvidenceProviderQuotaError(
      status,
      diagnostic.code,
      diagnostic.reason,
      diagnostic.retryAfterSeconds || SERPER_CREDIT_EXHAUSTION_RETRY_SECONDS,
    );
  }
  if (status === 400) return new SerperEvidenceSearchError("invalid_request", status, diagnostic.code, diagnostic.reason, null);
  if (status === 401 || status === 403) return new SerperEvidenceSearchError("credential_problem", status, diagnostic.code, diagnostic.reason, 3_600);
  if (status === 429) {
    const retryAfter = retryAfterHeaderSeconds(response.headers.get("retry-after")) || diagnostic.retryAfterSeconds || 300;
    return new SerperEvidenceSearchError("quota_or_rate_limit", status, diagnostic.code, diagnostic.reason, retryAfter);
  }
  if (status >= 500) return new SerperEvidenceSearchError("temporary_provider_failure", status, diagnostic.code, diagnostic.reason, 300);
  return new SerperEvidenceSearchError("provider_failure", status, diagnostic.code, diagnostic.reason, null);
}

/** Bounded metadata-only Serper adapter. It is called only by an intentional refresh worker. */
export function createStylingEvidenceSearchProvider(options: { fetchImpl?: typeof fetch; apiKey?: string } = {}): StylingEvidenceSearchProvider {
  return {
    async search(input) {
      const key = options.apiKey ?? process.env.SERPER_API_KEY;
      if (!key) throw new Error("SERPER_API_KEY is required");
      const response = await (options.fetchImpl || fetch)("https://google.serper.dev/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": key },
        body: JSON.stringify(buildSerperSearchRequest(input)),
      });
      if (!response.ok) throw await serperHttpError(response, key);
      return parseSerperStylingResults(await response.json(), input).slice(0, SERPER_USABLE_RESULT_LIMIT);
    },
  };
}
