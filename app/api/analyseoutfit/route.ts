import { NextResponse } from "next/server";

type StyleGuideRequest = {
  imageBase64?: string;
  mediaType?: string;
  occasion?: string;
  bodyFocus?: string;
  colourSeason?: string;
};

type StyleGuideResponse = {
  aesthetic: string;
  rating: number;
  feedback: string;
  proportionAnalysis: string;
  colourPalette: {
    season: string;
    bestColours: string[];
    avoidColours: string[];
    note: string;
  };
  occasionFit: {
    occasion: string;
    score: number;
    verdict: string;
  };
  bodyTypeAdvice: string;
  gapFinder: {
    missingPiece: string;
    why: string;
    suggestions: string[];
  };
  outfitBuilds: Array<{
    title: string;
    occasion: string;
    pieces: string[];
    stylingNote: string;
  }>;
  keywords: string[];
  suggestions: string[];
  source: "gemini" | "fallback";
};

function cleanJson(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function fallbackAnalysis(body: StyleGuideRequest): StyleGuideResponse {
  const occasion = body.occasion?.trim() || "everyday plans";
  const bodyFocus = body.bodyFocus?.trim() || "balanced proportions";
  const season = body.colourSeason?.trim() || "Soft Autumn";

  return {
    aesthetic: "clean city casual",
    rating: 8,
    feedback:
      "The proportions feel easy and wearable. To make it sharper, add one polished anchor near the face or at the shoe so the outfit reads intentional, not accidental.",
    proportionAnalysis:
      "Keep the waist or front line visible. If the top is loose, use a half tuck or open layer; if the bottom is wide, choose a cleaner shoe to keep the silhouette long.",
    colourPalette: {
      season,
      bestColours: ["ivory", "camel", "deep berry", "charcoal", "soft gold"],
      avoidColours: ["neon pink", "icy grey", "flat beige"],
      note: "The palette works best when one warm neutral supports one deeper accent.",
    },
    occasionFit: {
      occasion,
      score: 8,
      verdict:
        "It works for the occasion with one elevation move: stronger shoes, a cleaner bag, or jewellery that frames the face.",
    },
    bodyTypeAdvice: `For ${bodyFocus}, use contrast at the waist and keep the strongest line vertical. These cuts will elongate the silhouette and make the waist feel deliberate.`,
    gapFinder: {
      missingPiece: "versatile blazer",
      why: "It would make casual pieces work for dinners, interviews, travel days, and polished everyday outfits.",
      suggestions: ["single-breasted black blazer", "camel linen blazer", "soft charcoal oversized blazer"],
    },
    outfitBuilds: [
      {
        title: "Casual but elevated",
        occasion: "Rooftop party",
        pieces: ["clean base layer", "straight denim", "open blazer", "heeled sandal", "small shoulder bag"],
        stylingNote: "Half tuck the base layer, push the blazer sleeves up, and keep jewellery warm.",
      },
      {
        title: "Soft office polish",
        occasion: "Work day",
        pieces: ["ribbed top", "tailored trouser", "loafers", "structured tote", "thin belt"],
        stylingNote: "Keep the palette quiet and let fit do the work.",
      },
      {
        title: "Girls' dinner",
        occasion: "Dinner out",
        pieces: ["satin top", "dark denim", "heeled boot", "gold hoops", "compact bag"],
        stylingNote: "Add shine near the face and keep the bottom half clean.",
      },
      {
        title: "Lazy Sunday that still looks styled",
        occasion: "Weekend",
        pieces: ["soft tee", "loose denim", "slides", "canvas tote", "fine necklace"],
        stylingNote: "Let it breathe, but repeat one colour twice so it feels edited.",
      },
      {
        title: "Glam party night",
        occasion: "Party",
        pieces: ["black base", "statement earring", "metallic clutch", "strappy heel", "glossy lip"],
        stylingNote: "Keep one dramatic detail and make everything else support it.",
      },
    ],
    keywords: ["tailored", "clean", "elevated", "warm neutral"],
    suggestions: [
      "Try camel instead of a clashing bag colour.",
      "Use a half tuck to define the waist.",
      "Add one structured layer for instant polish.",
    ],
    source: "fallback",
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StyleGuideRequest;
    const { imageBase64, mediaType } = body;

    if (!imageBase64 || !mediaType) {
      return NextResponse.json({ error: "Missing imageBase64 or mediaType" }, { status: 400 });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json(fallbackAnalysis(body));
    }

    const prompt = `You are Fashlock's personal fashion coach: warm, direct, editorial, practical.

Analyse the uploaded outfit image for outfit styling, body proportion, colour palette, and occasion fit.

Context:
- Occasion: ${body.occasion || "not specified"}
- Body focus: ${body.bodyFocus || "not specified"}
- Known colour season: ${body.colourSeason || "unknown"}

Return ONLY valid JSON with this exact shape:
{
  "aesthetic": "short aesthetic name",
  "rating": 1-10,
  "feedback": "one beautiful but direct paragraph of outfit feedback",
  "proportionAnalysis": "specific notes on silhouette, waist, length, balance",
  "colourPalette": {
    "season": "Spring/Summer/Autumn/Winter style colour season guess",
    "bestColours": ["3-5 colours"],
    "avoidColours": ["2-3 colours"],
    "note": "specific colour advice"
  },
  "occasionFit": {
    "occasion": "occasion name",
    "score": 1-10,
    "verdict": "specific verdict for the event"
  },
  "bodyTypeAdvice": "specific cut/proportion advice",
  "gapFinder": {
    "missingPiece": "one wardrobe gap",
    "why": "why this piece would help",
    "suggestions": ["3 specific examples"]
  },
  "outfitBuilds": [
    {
      "title": "outfit title",
      "occasion": "occasion",
      "pieces": ["5 specific pieces"],
      "stylingNote": "specific styling instruction"
    }
  ],
  "keywords": ["4 style keywords"],
  "suggestions": ["3 short improvement suggestions"]
}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mediaType,
                    data: imageBase64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini error:", res.status, err);
      if (res.status === 429) {
        return NextResponse.json(fallbackAnalysis(body));
      }
      throw new Error(`Gemini style analysis failed (${res.status})`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json(fallbackAnalysis(body));
    }

    const parsed = JSON.parse(cleanJson(text)) as Omit<StyleGuideResponse, "source">;
    return NextResponse.json({ ...parsed, source: "gemini" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
