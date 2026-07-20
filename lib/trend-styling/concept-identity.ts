import { createHash } from "crypto";
import { canonicalizeTrendKeyword } from "@/lib/trends/keyword-normalization";

export function isolatedConceptId(keyword: string) {
  const canonical = canonicalizeTrendKeyword(keyword);
  const hex = createHash("sha256").update(`fashlock:isolated-style-concept:v1:${canonical}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5"; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}`;
}
