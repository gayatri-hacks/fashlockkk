const EXPLICIT_ALIAS_MAP = new Map<string, string>([
  ["co ord", "co-ord"],
  ["co ord set", "co-ord"],
  ["co-ords", "co-ord"],
  ["co-ords set", "co-ord"],
  ["coord", "co-ord"],
  ["coord set", "co-ord"],
  ["coords", "co-ord"],
  ["coords set", "co-ord"],
  ["co ordinate", "co-ord"],
  ["co ordinates", "co-ord"],
  ["co-ord set", "co-ord"],
  ["wide-leg", "wide leg"],
  ["wideleg", "wide leg"],
  ["wide legged", "wide leg"],
  ["t shirt", "t-shirt"],
  ["tee shirt", "t-shirt"],
  ["tee", "t-shirt"],
]);

const FASHION_TERMS = [
  "aesthetic",
  "accessory",
  "bag",
  "baggy",
  "ballet",
  "barrel",
  "blazer",
  "blocking",
  "boot",
  "button",
  "cargo",
  "chinos",
  "coat",
  "co-ord",
  "coord",
  "cotton",
  "craft",
  "crochet",
  "cropped",
  "denim",
  "dress",
  "drape",
  "embroidered",
  "embroidery",
  "fabric",
  "fashion",
  "fit",
  "flared",
  "floral",
  "garment",
  "graphic",
  "handloom",
  "jacket",
  "jeans",
  "kurta",
  "layer",
  "layering",
  "leather",
  "linen",
  "loose",
  "luxury",
  "maxi",
  "mesh",
  "minimal",
  "mini",
  "oversized",
  "pant",
  "pattern",
  "placket",
  "pleated",
  "print",
  "printed",
  "quiet",
  "relaxed",
  "saree",
  "shirt",
  "shoe",
  "short",
  "silhouette",
  "skirt",
  "sleeve",
  "slip",
  "sneaker",
  "streetwear",
  "suit",
  "tailored",
  "tailoring",
  "tee",
  "textile",
  "top",
  "trench",
  "trouser",
  "t-shirt",
  "tunic",
  "utility",
  "vest",
  "vintage",
  "washed",
  "wear",
  "weave",
  "y2k",
];

const NON_FASHION_TERMS = [
  "stock",
  "share price",
  "crypto",
  "bitcoin",
  "movie",
  "football",
  "cricket",
  "weather",
  "coupon",
  "discount code",
  "real estate",
  "election",
];

export function normalizeTrendKeyword(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[_/]+/g, " ")
    .replace(/[.,:;!?()[\]{}"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return EXPLICIT_ALIAS_MAP.get(normalized) || normalized;
}

export function canonicalizeTrendKeyword(value: string) {
  const normalized = normalizeTrendKeyword(value);
  const hyphenNormalized = normalized
    .replace(/\bwide\s*-\s*leg(?:ged)?\b/g, "wide leg")
    .replace(/\bwideleg\b/g, "wide leg")
    .replace(/\bco\s*-\s*ord(s)?(?:\s+set)?\b/g, "co-ord")
    .replace(/\bco\s+ord(s)?(?:\s+set)?\b/g, "co-ord")
    .replace(/\bcoord(s)?(?:\s+set)?\b/g, "co-ord");
  return EXPLICIT_ALIAS_MAP.get(hyphenNormalized) || hyphenNormalized;
}

export function isFashionKeyword(value: string) {
  const normalized = canonicalizeTrendKeyword(value);
  if (!normalized || normalized.length < 3) return false;
  if (NON_FASHION_TERMS.some((term) => normalized.includes(term))) return false;
  return FASHION_TERMS.some((term) => normalized === term || normalized.includes(term));
}

export function isBroadOneWordSignal(value: string) {
  const normalized = canonicalizeTrendKeyword(value);
  return normalized.split(/\s+/).length === 1 && [
    "loose",
    "washed",
    "printed",
    "cropped",
    "minimal",
    "graphic",
  ].includes(normalized);
}

export function titleCaseTrend(value: string) {
  return canonicalizeTrendKeyword(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word === "co-ord" || word === "t-shirt" ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
