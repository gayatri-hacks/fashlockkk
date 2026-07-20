export type PublicEvidenceResult = { title: string; url: string; domain: string; shortExtract: string; publishedAt: string | null; market?: string; language?: string };
export interface StylingEvidenceSearchProvider { search(input: { keyword: string; audience: "women" | "men"; region: string; season: string; language: string }): Promise<PublicEvidenceResult[]>; }
export function buildBoundedStylingSearches(input:{keyword:string;audience:"women"|"men";region:string;season:string;language:string}){return [`${input.keyword} ${input.audience} how to wear ${input.season} ${input.region} language:${input.language}`,`${input.keyword} ${input.audience} street style lookbook ${input.region} language:${input.language}`].slice(0,2);}
export function parseSerperStylingResults(payload:any,input:{region:string;language:string}){const results:PublicEvidenceResult[]=[];for(const item of (payload?.organic||[]).slice(0,6)){try{const url=new URL(String(item.link));results.push({title:String(item.title||"").slice(0,240),url:url.toString(),domain:url.hostname.replace(/^www\./,""),shortExtract:String(item.snippet||"").slice(0,500),publishedAt:item.date?new Date(item.date).toISOString():null,market:input.region,language:input.language});}catch{}}return results;}

/** Bounded metadata-only Serper adapter. It is called only by an intentional refresh worker. */
export function createStylingEvidenceSearchProvider(): StylingEvidenceSearchProvider {
  return { async search(input) {
    const key = process.env.SERPER_API_KEY; if (!key) throw new Error("SERPER_API_KEY is required");
    const queries = buildBoundedStylingSearches(input);
    const results: PublicEvidenceResult[] = [];
    for (const q of queries) {
      const response = await fetch("https://google.serper.dev/search", { method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": key }, body: JSON.stringify({ q, num: 6 }) });
      if (!response.ok) throw new Error(`Evidence search failed (${response.status})`);
      results.push(...parseSerperStylingResults(await response.json(),input));
    }
    return [...new Map(results.map((item) => [item.url, item])).values()].slice(0, 12);
  }};
}
