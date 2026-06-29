import type { PredictPageData, PredictTrend } from "@/lib/predict-page";

export type StyleBriefProfile = {
  gender?: string | null;
  body_type?: string | null;
  skin_tone?: string | null;
  skin_undertone?: string | null;
  vibe?: string | null;
  lifestyle?: string[] | null;
  style_personality?: string[] | null;
  colour_palette?: string[] | null;
  colours_that_glow?: string[] | null;
  avoids?: string[] | null;
  budget_range?: string | null;
  favourite_pieces?: string | null;
};

export type StyleBriefTrend = {
  keyword: string;
  trendName: string;
  recommendation: string;
  identityNote: string;
  shoppingFocus: string;
  reason: string;
  styleNote: string;
  confidenceLevel: PredictTrend["confidenceLevel"];
  shopTerms: string[];
  formulas: Array<{ title: string; direction: string }>;
};

export type StyleLookbookEdit = {
  id: string;
  title: string;
  category: string;
  aesthetic: string;
  hero_image?: string | null;
  heroImage?: string | null;
  whyTrending: string;
  pieces: string[];
  stylingNote: string;
  tags: string[];
  shopTerms: string[];
  askLailaPrompt: string;
  swatches: string[];
  size: "hero" | "wide" | "compact";
};

export type StyleBrief = {
  season: string;
  year: number;
  profileSignals: string[];
  trends: StyleBriefTrend[];
  dailyEdit: Array<{ title: string; note: string; searchTerm: string }>;
  howToWear: Array<{ trendName: string; directions: Array<{ title: string; direction: string }> }>;
  shopLookTerms: string[];
  lookbookEdits: StyleLookbookEdit[];
};

function clean(value?: string | null) {
  return String(value || "").trim();
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function profileWords(profile: StyleBriefProfile) {
  return [
    profile.vibe,
    profile.body_type,
    profile.skin_tone,
    profile.skin_undertone,
    profile.budget_range,
    profile.favourite_pieces,
    ...(profile.lifestyle || []),
    ...(profile.style_personality || []),
    ...(profile.colour_palette || []),
    ...(profile.colours_that_glow || []),
  ]
    .map(clean)
    .filter(Boolean);
}

function styleIdentity(profile: StyleBriefProfile) {
  return clean(profile.vibe || profile.style_personality?.[0]) || "polished everyday";
}

function colourAnchor(profile: StyleBriefProfile) {
  return clean(profile.colours_that_glow?.[0] || profile.colour_palette?.[0] || profile.skin_undertone) || "your best neutral";
}

function bodyAnchor(profile: StyleBriefProfile) {
  return clean(profile.body_type) || "your proportions";
}

function scoreTrendForProfile(trend: PredictTrend, profile: StyleBriefProfile) {
  const haystack = normalize(
    [
      trend.keyword,
      trend.trendName,
      trend.simpleExplanation,
      trend.prediction,
      trend.whyNow,
      trend.styleNote,
      trend.shopTerms.join(" "),
    ].join(" "),
  );
  const signals = profileWords(profile).map(normalize).filter(Boolean);
  let score = trend.currentScore / 20 + Math.max(0, trend.velocity) / 50;

  for (const signal of signals) {
    for (const word of signal.split(" ").filter((item) => item.length > 3)) {
      if (haystack.includes(word)) score += 3;
    }
  }

  if (profile.gender === "male" && /\b(men|mens|menswear|tailor|shirt|trouser|jacket|watch)\b/.test(haystack)) score += 5;
  if (profile.gender !== "male" && /\b(dress|skirt|saree|sari|blouse|jewellery|bag)\b/.test(haystack)) score += 3;
  if (/\b(wearable|easy|simple|polished|everyday|classic|elegant)\b/.test(haystack)) score += 2;

  return score;
}

function formulasForTrend(trend: PredictTrend, profile: StyleBriefProfile) {
  const identity = styleIdentity(profile).toLowerCase();
  const bodyType = bodyAnchor(profile);
  const colour = colourAnchor(profile);
  const piece = trend.trendName.toLowerCase();
  return [
    {
      title: "Everyday formula",
      direction: `One ${piece} cue, a clean base, and a grounded shoe so it reads ${identity}, not trend-heavy.`,
    },
    {
      title: "Polished formula",
      direction: `Use ${piece} as the update, then add tailoring, soft texture, and ${colour} near the face.`,
    },
    {
      title: "Proportion note",
      direction: `For ${bodyType}, keep one defined line and one relaxed piece so the outfit has shape.`,
    },
  ];
}

function recommendationForTrend(trend: PredictTrend, profile: StyleBriefProfile, index = 0) {
  const identity = styleIdentity(profile).toLowerCase();
  const colour = colourAnchor(profile).toLowerCase();
  const body = bodyAnchor(profile).toLowerCase();
  const piece = trend.trendName.toLowerCase();
  const variations = [
    `Because your profile leans ${identity}, make ${piece} feel intentional: one refined piece, ${colour} close to the face, and a silhouette that respects ${body}.`,
    `Treat ${piece} as a styling accent, not the whole outfit. Keep the base ${identity}, then use shape and fabric to make it feel personal.`,
    `Your best version of ${piece} is restrained: clean colour, fewer details, and one proportion decision that flatters ${body}.`,
    `Use ${piece} to refresh what you already wear. It should sharpen your ${identity} mood, not pull you into costume territory.`,
  ];
  return variations[index % variations.length];
}

function identityNoteForTrend(trend: PredictTrend, profile: StyleBriefProfile, index = 0) {
  const lifestyle = clean(profile.lifestyle?.[0]) || "real days";
  const notes = [
    `Keep it only if it makes ${lifestyle.toLowerCase()} easier to dress for.`,
    "The edit works when the rest of the outfit stays calm.",
    "Think wearable first, current second.",
    "Let texture and fit do more than logos or loud styling.",
  ];
  return notes[index % notes.length];
}

function shoppingFocusForTrend(trend: PredictTrend, profile: StyleBriefProfile) {
  const colour = colourAnchor(profile).toLowerCase();
  const piece = trend.keyword.toLowerCase();
  if (/\b(mini|skirt|dress)\b/.test(piece)) return `Look for a refined ${piece} with structure, not cling. Try ${colour} or a grounded neutral.`;
  if (/\b(cargo|utility|denim|trouser|pants)\b/.test(piece)) return `Shop clean lines, good fabric weight, and minimal hardware. Avoid bulky pockets near your widest point.`;
  if (/\b(linen|cotton|silk|fabric)\b/.test(piece)) return `Prioritize fabric feel: breathable, opaque, and softly structured.`;
  return `Search for one wearable ${piece} piece in a calm colour, then style it with pieces you already trust.`;
}

export function buildShopTermsForTrend(trend: Pick<PredictTrend, "keyword" | "trendName" | "shopTerms">, profile: StyleBriefProfile) {
  const value = normalize(`${trend.keyword} ${trend.trendName}`);
  const gender = profile.gender === "male" ? "men" : "women";
  const terms: string[] = [];

  if (/\bmini\b/.test(value)) {
    terms.push(
      gender === "men" ? "minimal short sleeve shirt men" : "mini skirt women",
      gender === "men" ? "tailored shorts men" : "A-line mini skirt women",
      gender === "men" ? "minimal summer shirt men" : "minimalist mini dress women",
    );
  } else if (/\bcargo\b/.test(value)) {
    terms.push(
      gender === "men" ? "cargo pants men" : "cargo pants women",
      gender === "men" ? "utility trousers men" : "cargo skirt women",
      gender === "men" ? "relaxed cargo trousers men" : "utility trousers women",
    );
  } else if (/\butility\b/.test(value)) {
    terms.push(
      gender === "men" ? "utility jacket men" : "utility jacket women",
      gender === "men" ? "utility shirt men" : "utility shirt women",
      gender === "men" ? "cargo trousers men" : "cargo trousers women",
    );
  } else if (/\blinen\b/.test(value)) {
    terms.push(
      gender === "men" ? "linen shirt men" : "linen shirt women",
      gender === "men" ? "linen trousers men" : "linen trousers women",
      gender === "men" ? "linen overshirt men" : "linen co-ord women",
    );
  } else if (/\blayer|layering\b/.test(value)) {
    terms.push(
      gender === "men" ? "lightweight cardigan men" : "lightweight cardigan women",
      gender === "men" ? "linen overshirt men" : "sheer layering top women",
      gender === "men" ? "lightweight overshirt men" : "linen overshirt women",
    );
  }

  if (!terms.length) {
    const base = trend.keyword.toLowerCase();
    terms.push(
      gender === "men" ? `${base} men` : `${base} women`,
      gender === "men" ? `minimal ${base} menswear` : `minimal ${base} women`,
      gender === "men" ? `premium ${base} men` : `elegant ${base} women`,
    );
  }

  for (const term of trend.shopTerms || []) {
    if (term && !terms.includes(term)) terms.push(term);
  }

  return terms.slice(0, 3);
}

function dailyEditFromProfile(profile: StyleBriefProfile, trends: StyleBriefTrend[]) {
  const tone = styleIdentity(profile);
  const colour = colourAnchor(profile);
  const firstTrend = trends[0]?.trendName || "clean tailoring";
  const secondTrend = trends[1]?.trendName || "easy texture";

  return [
    {
      title: "Start here",
      note: `Build from your ${tone.toLowerCase()} identity: simple top, clean bottom, breathable fabric.`,
      searchTerm: `${tone} wardrobe basics`,
    },
    {
      title: "Colour move",
      note: `Put ${colour.toLowerCase()} near your face, then keep the rest of the palette restrained.`,
      searchTerm: `${colour} outfit`,
    },
    {
      title: "Current piece",
      note: `Let ${firstTrend.toLowerCase()} be the update. The rest should feel familiar and easy.`,
      searchTerm: trends[0]?.shopTerms[0] || `${firstTrend} outfit`,
    },
    {
      title: "Finishing note",
      note: `Use ${secondTrend.toLowerCase()} through texture, shoes, or a small layer instead of a full look.`,
      searchTerm: trends[1]?.shopTerms[0] || `${secondTrend} fashion`,
    },
  ];
}

const lookbookTemplates = [
  {
    title: "The Linen Cafe Look",
    category: "Materials",
    aesthetic: "quiet summer polish",
    pieces: ["linen shirt", "relaxed trousers", "flat sandals", "slim watch"],
    tags: ["linen", "easy tailoring", "cafe"],
    swatches: ["#E8D8CF", "#FAF7F4", "#6F655B"],
  },
  {
    title: "Rachel Green Off-Duty",
    category: "Casual",
    aesthetic: "90s clean girl",
    pieces: ["ribbed tank", "straight denim", "small shoulder bag", "simple flats"],
    tags: ["90s", "denim", "off-duty"],
    swatches: ["#F1E8DC", "#7D8A95", "#2C2418"],
  },
  {
    title: "Soft Tailoring Day",
    category: "Work",
    aesthetic: "relaxed authority",
    pieces: ["soft blazer", "clean tee", "tailored trousers", "loafers"],
    tags: ["tailoring", "work", "minimal"],
    swatches: ["#D8CABD", "#F8F4EF", "#3B3025"],
  },
  {
    title: "The Butter Yellow Accent",
    category: "Colours",
    aesthetic: "gentle colour hit",
    pieces: ["butter yellow top", "ivory bottom", "tan bag", "gold earring"],
    tags: ["butter yellow", "colour", "soft"],
    swatches: ["#F3DC8A", "#FAF7F4", "#B58B5B"],
  },
  {
    title: "Minimal Gold Finish",
    category: "Occasion",
    aesthetic: "expensive restraint",
    pieces: ["clean base outfit", "small gold hoops", "sleek belt", "polished shoe"],
    tags: ["gold", "minimal", "finish"],
    swatches: ["#D4AF37", "#F0EBE3", "#2C2418"],
  },
  {
    title: "Airport Linen Layers",
    category: "Layering",
    aesthetic: "travel ease",
    pieces: ["linen overshirt", "soft tank", "drawstring trouser", "clean sneaker"],
    tags: ["airport", "layers", "linen"],
    swatches: ["#DFD3C5", "#F9F6F1", "#998D7F"],
  },
  {
    title: "Clean College Casual",
    category: "Tops",
    aesthetic: "campus polish",
    pieces: ["crisp tee", "straight jeans", "light overshirt", "flat shoe"],
    tags: ["college", "casual", "clean"],
    swatches: ["#FFFFFF", "#8796A3", "#B03A5B"],
  },
  {
    title: "Office Siren Lite",
    category: "Dresses",
    aesthetic: "sharp but wearable",
    pieces: ["simple column dress", "kitten heel", "structured bag", "small hoops"],
    tags: ["office", "dress", "siren", "sleek"],
    swatches: ["#2C2418", "#C9B8AA", "#8C2A40"],
  },
  {
    title: "Old Money Weekend",
    category: "Aesthetics",
    aesthetic: "soft heritage",
    pieces: ["striped shirt", "cream trouser", "loafers", "fine knit"],
    tags: ["old money", "weekend", "classic"],
    swatches: ["#F5EFE5", "#6F7A68", "#2C2418"],
  },
  {
    title: "Monochrome Errand Look",
    category: "Bottoms",
    aesthetic: "pulled-together errands",
    pieces: ["tonal top", "straight trouser", "flat sandal", "sleek tote"],
    tags: ["monochrome", "errands", "tonal"],
    swatches: ["#EDE8DF", "#B8ADA2", "#2C2418"],
  },
];

export function buildLookShopTerms(look: Pick<StyleLookbookEdit, "title" | "pieces" | "tags">) {
  const title = normalize(look.title);
  const pieces = look.pieces.map((piece) => piece.toLowerCase());
  const tags = look.tags.join(" ").toLowerCase();
  const terms: string[] = [];

  if (/\blinen\b/.test(`${title} ${tags}`)) terms.push("linen shirt women", "linen trousers women", "linen overshirt women");
  if (/\bcollege|casual|rachel|90s\b/.test(`${title} ${tags}`)) terms.push("ribbed tank women", "straight leg jeans women", "small shoulder bag women");
  if (/\bdress|dresses\b/.test(`${title} ${tags}`)) terms.push("simple column dress women", "minimal midi dress women", "kitten heels women");
  if (/\bwork|office|tailoring|siren\b/.test(`${title} ${tags}`)) terms.push("soft blazer women", "tailored trousers women", "kitten heels women");
  if (/\byellow|colour|color\b/.test(`${title} ${tags}`)) terms.push("butter yellow top women", "ivory trousers women", "gold earrings minimal");
  if (/\bgold|old money|aesthetic\b/.test(`${title} ${tags}`)) terms.push("minimal gold hoops", "cream trousers women", "striped shirt women");
  if (/\bmonochrome|bottoms\b/.test(`${title} ${tags}`)) terms.push("straight trousers women", "tonal top women", "sleek tote bag women");

  for (const piece of pieces) {
    if (terms.length >= 3) break;
    terms.push(`${piece} women`);
  }

  return [...new Set(terms)].slice(0, 3);
}

export function buildAskLailaPrompt(look: Pick<StyleLookbookEdit, "title"> & Partial<Pick<StyleLookbookEdit, "pieces" | "stylingNote">>) {
  const pieces = look.pieces?.length ? `\n\nPieces:\n${look.pieces.map((piece) => `- ${piece}`).join("\n")}` : "";
  const stylingNote = look.stylingNote ? `\n\nStyling note: ${look.stylingNote}` : "";
  return `Style this look for me: ${look.title}.${pieces}${stylingNote}\n\nUse my profile. Use my colours. Use my body type. Use my lifestyle.`;
}

export function mapTrendToLookFormula(trend: StyleBriefTrend, profile: StyleBriefProfile, index = 0): StyleLookbookEdit {
  const template = lookbookTemplates[index % lookbookTemplates.length];
  const identity = styleIdentity(profile).toLowerCase();
  const colour = colourAnchor(profile).toLowerCase();
  const body = bodyAnchor(profile).toLowerCase();
  const title = template.title;
  const pieces = [...template.pieces];
  const tags = [...new Set([...template.tags, trend.trendName.toLowerCase(), template.category.toLowerCase()])].slice(0, 5);
  const look: StyleLookbookEdit = {
    id: `${normalize(title).replace(/\s+/g, "-")}-${normalize(trend.keyword).replace(/\s+/g, "-")}`,
    title,
    category: template.category,
    aesthetic: template.aesthetic,
    whyTrending: trend.reason || `${trend.trendName} is moving because wardrobes want easy updates with personality.`,
    pieces,
    stylingNote: `Keep it ${identity}: use ${trend.trendName.toLowerCase()} as the current signal, ${colour} near the face, and one clean line for ${body}.`,
    tags,
    shopTerms: [],
    askLailaPrompt: "",
    swatches: template.swatches,
    size: index === 0 ? "hero" : index % 3 === 0 ? "wide" : "compact",
  };

  return {
    ...look,
    shopTerms: buildLookShopTerms(look),
    askLailaPrompt: buildAskLailaPrompt(look),
  };
}

export function buildLookbookEdits(profile: StyleBriefProfile | null, brief: Omit<StyleBrief, "lookbookEdits">): StyleLookbookEdit[] {
  const safeProfile = profile || {};
  const trendPool = brief.trends.length ? brief.trends : [];
  const edits = lookbookTemplates.map((_, index) => {
    const trend =
      trendPool[index % Math.max(1, trendPool.length)] ||
      ({
        keyword: lookbookTemplates[index].title,
        trendName: lookbookTemplates[index].title,
        recommendation: "",
        identityNote: "",
        shoppingFocus: "",
        reason: "It works because it translates current styling into an outfit people can actually wear.",
        styleNote: "",
        confidenceLevel: "WATCH",
        shopTerms: [],
        formulas: [],
      } as StyleBriefTrend);
    return mapTrendToLookFormula(trend, safeProfile, index);
  });

  return edits.slice(0, 10);
}

export function buildStyleBrief(profile: StyleBriefProfile | null, predictData: PredictPageData): StyleBrief {
  const safeProfile = profile || {};
  const pool = safeProfile.gender === "male" && predictData.menswearPredictions.length ? predictData.menswearPredictions : predictData.predictions;
  const scored = [...pool]
    .sort((a, b) => scoreTrendForProfile(b, safeProfile) - scoreTrendForProfile(a, safeProfile))
    .slice(0, 6);

  const trends = scored.map((trend, index) => ({
    keyword: trend.keyword,
    trendName: trend.trendName,
    recommendation: recommendationForTrend(trend, safeProfile, index),
    identityNote: identityNoteForTrend(trend, safeProfile, index),
    shoppingFocus: shoppingFocusForTrend(trend, safeProfile),
    reason: trend.simpleExplanation || trend.whyNow,
    styleNote: trend.styleNote || `Try one ${trend.keyword} piece with quiet basics.`,
    confidenceLevel: trend.confidenceLevel,
    shopTerms: buildShopTermsForTrend(trend, safeProfile),
    formulas: formulasForTrend(trend, safeProfile).slice(0, 3),
  }));

  const fallbackTrends: StyleBriefTrend[] = trends.length
    ? trends
    : ["Clean tailoring", "Soft neutrals", "Textured basics", "Statement flats", "Easy layers"].map((trendName) => ({
        keyword: trendName.toLowerCase(),
        trendName,
        recommendation: `${trendName} should be used as a small wardrobe correction, not a head-to-toe trend.`,
        identityNote: "Keep the look close to your real routine.",
        shoppingFocus: `Look for ${trendName.toLowerCase()} with clean fabric, calm colour, and easy styling potential.`,
        reason: `${trendName} keeps the wardrobe current without making it loud.`,
        styleNote: "Try one piece with quiet basics.",
        confidenceLevel: "WATCH" as const,
        shopTerms: buildShopTermsForTrend({ keyword: trendName, trendName, shopTerms: [] }, safeProfile),
        formulas: [
          { title: "Daily", direction: `${trendName} with a simple top, clean bottom, and grounded shoe.` },
          { title: "Polished", direction: `${trendName} with tailoring and one warm accessory.` },
        ],
      }));

  const finalTrends = trends.length ? trends : fallbackTrends;

  const briefWithoutLookbook: Omit<StyleBrief, "lookbookEdits"> = {
    season: predictData.season,
    year: predictData.year,
    profileSignals: profileWords(safeProfile).slice(0, 6),
    trends: finalTrends,
    dailyEdit: dailyEditFromProfile(safeProfile, finalTrends),
    howToWear: finalTrends.slice(0, 3).map((trend) => ({
      trendName: trend.trendName,
      directions: trend.formulas.slice(0, 3),
    })),
    shopLookTerms: finalTrends.flatMap((trend) => trend.shopTerms).filter(Boolean).slice(0, 6),
  };

  return {
    ...briefWithoutLookbook,
    lookbookEdits: buildLookbookEdits(safeProfile, briefWithoutLookbook),
  };
}
