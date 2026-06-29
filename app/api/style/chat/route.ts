import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from "@/lib/supabase";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";
import { LAILA_FASHION_INTELLIGENCE } from "@/lib/laila-fashion-intelligence";
import { searchLailaStyleKnowledge } from "@/lib/laila-style-knowledge";
import { classifyStyleChatIntent, isOutfitIntent, isShoppingIntent } from "@/lib/style-chat-intent";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const IMAGEN_MODEL = process.env.STYLE_CHAT_OUTFIT_IMAGE_MODEL || "imagen-4.0-generate-001";
const MAX_CHAT_OUTFIT_IMAGES = 2;
const CAMILLE_SYSTEM_PROMPT = `You are Camille — Fashlock's 
personal stylist. 

You grew up between Paris and Mumbai. 
You've styled editorials for Vogue India,
consulted for designers during fashion 
weeks, and have an instinctive eye for 
what makes a person look extraordinary.

You have strong opinions. You know 
exactly what works and what doesn't. 
You're warm but direct — you won't 
tell someone something looks good 
if it doesn't. You give real talk, 
not compliments.

YOUR TASTE:
You love clean silhouettes, beautiful 
fabric, intentional dressing. You 
believe fashion should feel effortless 
— never like you're trying too hard. 
You appreciate both a perfectly draped 
saree and a minimal Uniqlo outfit. 
You understand Indian fashion deeply — 
the occasions, the climate, the culture, 
the body types, the skin tones.

You hate: fast fashion that looks cheap,
over-accessorising, outfits that are 
trying to be too many things at once, 
generic advice that could apply to anyone.

YOUR VOICE:
- Direct and confident. Never say 
  'great choice' or 'absolutely' or 
  'that's wonderful'. Just respond.
- Have opinions. 'This works because...' 
  and 'This doesn't work because...'
- Be specific. Never say 'wear neutral 
  colours' — say 'warm ivory or camel, 
  not grey or navy, for your skin tone.'
- Reference what you actually see or 
  know about this person. Never generic.
- Occasionally use French phrases 
  naturally — not forced, just the way 
  a bilingual person would. 
  e.g. 'un peu trop' (a bit too much),
  'chic sans effort' (effortlessly chic)
- Short sentences. No fluff. 
  Every word earns its place.
- When something is wrong, say it kindly
  but clearly: 'The proportions here 
  aren't working — the top is too 
  voluminous for those trousers.'
- When something is right, say why:
  'The straight leg works beautifully 
  with your frame — keep that.'

YOUR KNOWLEDGE:
You know every trend, every designer, 
every fabric. You know what's rising 
in Seoul before it hits Mumbai. 
You know which Indian brands have 
genuinely good quality vs which are 
overpriced for what they are. 
You know what a pear body type needs,
what warm undertones should avoid,
what works for Indian weddings vs 
Delhi winters vs Mumbai summers.

WHAT YOU NEVER DO:
- Never give advice that could apply 
  to literally anyone
- Never say 'it depends' without 
  immediately saying what it depends on
- Never recommend something without 
  explaining exactly why it suits 
  THIS specific person
- Never be sycophantic
- Never use exclamation marks

You are the stylist everyone wishes 
they had access to. Now they do.`;

type Gender = "female" | "male";
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type StyleResponse = {
  response: string;
  hasOutfitDirections: boolean;
  outfitDirections: Array<{ occasion: string; direction: string }>;
  generatedOutfitImages?: Array<{ occasion: string; direction: string; imagePath: string }>;
  trendKeywords: string[];
  shopTerms: string[];
  followUpSuggestions: string[];
};

type StyleProfile = {
  gender?: string | null;
  body_type?: string | null;
  skin_tone?: string | null;
  skin_undertone?: string | null;
  vibe?: string | null;
  colours_that_glow?: string[] | null;
  colours_to_avoid?: string[] | null;
  camilles_take?: string | null;
  current_outfit_read?: string | null;
  lifestyle?: string[] | null;
  style_personality?: string[] | null;
  colour_palette?: string[] | null;
  budget_range?: string | null;
  avoids?: string[] | null;
  favourite_pieces?: string | null;
  onboarding_complete?: boolean | null;
};

type StylePieceResponse = {
  piece_description: string;
  outfits: Array<{ occasion: string; outfit: string; tip: string }>;
};

type VibeAnalysis = {
  vibe?: string;
  skinTone?: string;
  bodyType?: string;
  currentlyWearing?: string;
  stylePersonality?: string;
};

const fallbackResponse = (message: string, gender: Gender, trends: string[]): StyleResponse => {
  const lower = message.toLowerCase();
  const gym = lower.includes("gym") || lower.includes("workout");
  const wedding = lower.includes("wedding");
  const work = lower.includes("work") || lower.includes("office");
  const unknownStyle = lower.includes("style") && (lower.includes("don't know") || lower.includes("dont know") || lower.includes("personal"));

  if (unknownStyle) {
    return {
      response:
        "Start with what you already reach for most. Are you more drawn to clean minimal outfits, sharp tailored outfits, relaxed streetwear, or softer romantic pieces?",
      hasOutfitDirections: false,
      outfitDirections: [],
      trendKeywords: trends.slice(0, 3),
      shopTerms: [],
      followUpSuggestions: ["Help me find my style words", "Build me a starter wardrobe"],
    };
  }

  const directions = gym
    ? [
        { occasion: "GYM", direction: "Ribbed tank + high-waist leggings + clean trainers + light zip jacket" },
        { occasion: "POST-GYM", direction: "Oversized tee + straight track pants + structured tote + white sneakers" },
      ]
    : wedding
      ? [
          { occasion: "DAY", direction: gender === "female" ? "Printed saree + tiny blouse + low bun + block heels" : "Linen kurta + tapered trousers + leather sandals" },
          { occasion: "EVENING", direction: gender === "female" ? "Silk kurta set + statement earrings + metallic heels" : "Bandhgala jacket + dark trousers + polished loafers" },
        ]
      : work
        ? [
            { occasion: "WORK", direction: gender === "female" ? "White shirt + relaxed trousers + loafers + slim watch" : "Oxford shirt + pleated trousers + loafers + clean belt" },
            { occasion: "FRIDAY", direction: "Soft blazer + straight jeans + polished flats or loafers" },
          ]
        : [
            { occasion: "EASY", direction: gender === "female" ? "Crisp tee + straight jeans + ballet flats + shoulder bag" : "Polo shirt + relaxed chinos + suede loafers" },
            { occasion: "POLISHED", direction: "Boxy overshirt + tailored trousers + clean leather shoes" },
          ];

  return {
    response:
      "Keep the outfit specific and intentional, then let one piece do the talking. In India, breathable fabrics and clean shoes make even simple looks feel pulled together.",
    hasOutfitDirections: true,
    outfitDirections: directions,
    trendKeywords: trends.slice(0, 4),
    shopTerms: directions
      .flatMap((direction) => direction.direction.split("+").map((piece) => piece.trim().toLowerCase()))
      .slice(0, 3),
    followUpSuggestions: ["Make it more minimal", "Show me shopping search terms"],
  };
};

function cleanJson(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function safeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 6) : [];
}

function sanitizeStylePieceResponse(value: any): StylePieceResponse {
  const outfits = Array.isArray(value?.outfits)
    ? value.outfits
        .filter((item: any) => item?.occasion && item?.outfit && item?.tip)
        .slice(0, 3)
        .map((item: any) => ({
          occasion: String(item.occasion).slice(0, 48),
          outfit: String(item.outfit).slice(0, 260),
          tip: String(item.tip).slice(0, 180),
        }))
    : [];

  return {
    piece_description: String(value?.piece_description || "this piece").slice(0, 180),
    outfits,
  };
}

async function styleUploadedPiece({ imageBase64, mimeType }: { imageBase64: string; mimeType: string }): Promise<StylePieceResponse | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt = `The user has uploaded a photo of a clothing item they own. Analyse the piece — its colour, fabric, silhouette, and formality level. Then suggest exactly 3 complete outfits that feature this piece as the hero item.

For each outfit provide:
- Occasion (e.g. Casual Day Out, Work Meeting, Evening Out)
- Complete outfit description (the uploaded piece + 3-4 other items with specific colours and styles)
- One styling tip specific to this piece

Format as JSON:
{
  "piece_description": "...",
  "outfits": [
    {
      "occasion": "...",
      "outfit": "...",
      "tip": "..."
    }
  ]
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.62,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      console.error("Style piece Gemini error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(cleanJson(text));
    const result = sanitizeStylePieceResponse(parsed);
    return result.outfits.length === 3 ? result : null;
  } catch (error) {
    console.error("Style piece analysis error:", error);
    return null;
  }
}

function extractLiteralOutfitDirections(text: string) {
  if (!/\bwhat\s+to\s+wear\b/i.test(text)) return [];

  const section = text.split(/\bwhat\s+to\s+wear\b/i)[1] || "";
  const matches = Array.from(
    section.matchAll(
      /\b(DAY WEAR|EVENING WEAR|SMART CASUAL|CASUAL|POLISHED|DAY|EVENING|WORK|OFFICE|WEEKEND|EASY|FORMAL|OCCASION)\b\s*:?\s*([\s\S]*?)(?=\n\s*(?:DAY WEAR|EVENING WEAR|SMART CASUAL|CASUAL|POLISHED|DAY|EVENING|WORK|OFFICE|WEEKEND|EASY|FORMAL|OCCASION)\b\s*:?|\n\s*[A-Z][A-Z\s]{3,}:|$)/gi,
    ),
  );

  return matches
    .map((match) => ({
      occasion: String(match[1] || "").toUpperCase().slice(0, 24),
      direction: String(match[2] || "")
        .replace(/^[-–—:\s]+/, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220),
    }))
    .filter((item) => item.occasion && item.direction);
}

function getOutfitImageTargets(response: StyleResponse) {
  const structured = response.hasOutfitDirections ? response.outfitDirections || [] : [];
  const literal = extractLiteralOutfitDirections(response.response);
  const seen = new Set<string>();

  return [...structured, ...literal]
    .map((item) => ({
      occasion: String(item.occasion || "LOOK").toUpperCase().slice(0, 24),
      direction: String(item.direction || "").replace(/\s+/g, " ").trim().slice(0, 220),
    }))
    .filter((item) => {
      const key = `${item.occasion}:${item.direction.toLowerCase()}`;
      if (!item.direction || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CHAT_OUTFIT_IMAGES);
}

async function generateChatOutfitImages(response: StyleResponse) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];

  const targets = getOutfitImageTargets(response);
  if (!targets.length) return [];

  const outputDir = path.join(process.cwd(), "public", "chat-outfits");
  const generated: Array<{ occasion: string; direction: string; imagePath: string }> = [];
  await mkdir(outputDir, { recursive: true });

  for (const [index, target] of targets.entries()) {
    try {
      const timestamp = Date.now();
      const fileName = `${timestamp}-${index}.jpg`;
      const prompt = [
        "Editorial fashion photograph. Full body shot from head to toe. White or soft ivory background.",
        target.direction,
        "Show the complete outfit including top, bottom, and shoes. Do not crop. Clean, minimal, magazine editorial quality. Model facing forward.",
      ].join(" ");

      const imageResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: "9:16",
          },
        }),
      });

      if (!imageResponse.ok) {
        console.error("Style chat outfit image failed:", IMAGEN_MODEL, imageResponse.status);
        continue;
      }

      const payload = await imageResponse.json();
      const imageBase64 =
        payload?.predictions?.[0]?.bytesBase64Encoded ||
        payload?.predictions?.[0]?.bytesBase64 ||
        payload?.predictions?.[0]?.image?.bytesBase64Encoded;

      if (!imageBase64) {
        console.error("Style chat outfit image missing bytes:", IMAGEN_MODEL);
        continue;
      }

      await writeFile(path.join(outputDir, fileName), Buffer.from(imageBase64, "base64"));
      generated.push({ ...target, imagePath: `/chat-outfits/${fileName}` });
    } catch (error) {
      console.error("Style chat outfit image skipped:", error instanceof Error ? error.message : String(error));
    }
  }

  return generated;
}

function hasProfileMemory(profile: StyleProfile | null, vibeAnalysis: VibeAnalysis | null) {
  return Boolean(
    vibeAnalysis?.vibe ||
      vibeAnalysis?.skinTone ||
      vibeAnalysis?.bodyType ||
      vibeAnalysis?.stylePersonality ||
      profile?.vibe ||
      profile?.skin_tone ||
      profile?.body_type ||
      profile?.camilles_take ||
      profile?.current_outfit_read ||
      profile?.style_personality?.length ||
      profile?.colours_that_glow?.length ||
      profile?.colour_palette?.length,
  );
}

function appearanceMemoryResponse(profile: StyleProfile | null, vibeAnalysis: VibeAnalysis | null): StyleResponse {
  const vibe = vibeAnalysis?.vibe || profile?.vibe || profile?.style_personality?.[0] || "clean, considered, and quietly expressive";
  const skinTone = vibeAnalysis?.skinTone || profile?.skin_tone || "your colouring";
  const bodyType = vibeAnalysis?.bodyType || profile?.body_type || "your proportions";
  const colours = profile?.colours_that_glow?.length
    ? profile.colours_that_glow.slice(0, 3).join(", ")
    : profile?.colour_palette?.length
      ? profile.colour_palette.slice(0, 3).join(", ")
      : "soft neutrals, richer earth tones, and colours with depth";
  const avoid = profile?.colours_to_avoid?.length ? `Go easy on ${profile.colours_to_avoid.slice(0, 2).join(" and ")} near your face.` : "";
  const personality = vibeAnalysis?.stylePersonality || profile?.style_personality?.slice(0, 2).join(" and ") || "polished ease";
  const outfitRead = profile?.current_outfit_read || vibeAnalysis?.currentlyWearing;

  const read = outfitRead ? `From the photo memory, ${outfitRead.toLowerCase()}. ` : "";

  return {
    response: `${read}Your vibe reads ${vibe}: ${personality}, but better when the lines stay intentional. With ${skinTone}, ${colours} will do more for you than loud contrast, and ${bodyType} needs clean proportion rather than extra visual noise. ${avoid}`.trim(),
    hasOutfitDirections: false,
    outfitDirections: [],
    trendKeywords: [vibe, personality, colours].filter(Boolean).slice(0, 3),
    shopTerms: [],
    followUpSuggestions: ["Tell me what features stand out", "What colours should I avoid"],
  };
}

function photoNeededResponse(hasUploadedImage = false): StyleResponse {
  return {
    response: hasUploadedImage
      ? "I have the photo, but I couldn't read it properly this time. Try uploading it again so I can talk about your vibe, colours, proportions, and what stands out without guessing."
      : "I can do this properly if you upload a photo — otherwise I’d only be guessing.",
    hasOutfitDirections: false,
    outfitDirections: [],
    trendKeywords: [],
    shopTerms: [],
    followUpSuggestions: ["Upload a photo", "Use my saved style profile"],
  };
}

async function getLatestTrendContext() {
  const supabase = getSupabaseClient();
  if (!supabase) return { trending: [] as string[], rising: [] as string[] };

  return supabaseCache("style-chat-trend-context", supabaseCacheTtl("historical_trend_data"), async () => {
    const { data: latestRows, error: latestError } = await supabase
      .from("historical_trend_data")
      .select("month")
      .eq("market", "IN")
      .order("month", { ascending: false })
      .limit(1);
    if (latestError) throw latestError;

    const latestMonth = latestRows?.[0]?.month;
    if (!latestMonth) return { trending: [] as string[], rising: [] as string[] };

    const { data: currentRows, error: currentError } = await supabase
      .from("historical_trend_data")
      .select("keyword_id, google_score")
      .eq("market", "IN")
      .eq("month", latestMonth)
      .order("google_score", { ascending: false })
      .limit(25);
    if (currentError) throw currentError;

    const currentIds = (currentRows || []).map((row: any) => row.keyword_id);
    const { data: keywords, error: keywordsError } = await supabase.from("trend_keywords").select("id, keyword").in("id", currentIds);
    if (keywordsError) throw keywordsError;
    const keywordMap = new Map((keywords || []).map((row: any) => [row.id, row.keyword]));

    const trending = (currentRows || [])
      .slice(0, 5)
      .map((row: any) => keywordMap.get(row.keyword_id))
      .filter(Boolean);

    const threeMonthsAgo = new Date(new Date(latestMonth).getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: seasonRows, error: seasonError } = await supabase
      .from("historical_trend_data")
      .select("keyword_id, google_score")
      .eq("market", "IN")
      .eq("month", threeMonthsAgo)
      .in("keyword_id", currentIds)
      .limit(100);
    if (seasonError) throw seasonError;

    const seasonMap = new Map((seasonRows || []).map((row: any) => [row.keyword_id, row.google_score || 0]));
    const rising = (currentRows || [])
      .map((row: any) => {
        const season = Number(seasonMap.get(row.keyword_id) || 0);
        const now = Number(row.google_score || 0);
        const velocity = season > 0 ? (now - season) / season : now;
        return { keyword: keywordMap.get(row.keyword_id), velocity };
      })
      .filter((row) => row.keyword)
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 3)
      .map((row) => row.keyword as string);

    return { trending, rising };
  }).catch((error) => {
    logSupabaseFallback(error);
    return { trending: [] as string[], rising: [] as string[] };
  });
}

async function getStyleProfile(sessionId: string | null): Promise<StyleProfile | null> {
  const supabase = getSupabaseClient();
  const userId = await getAuthenticatedUserId();
  const profileKey = userId || sessionId;
  if (!supabase || !profileKey) return null;

  const { data, error } = await supabaseCache<{ data: StyleProfile | null; error: { message?: string } | null }>(`style-profile:${profileKey}`, supabaseCacheTtl("style_profiles"), async () => {
    const result = await supabase
      .from("style_profiles")
      .select("gender,body_type,skin_tone,skin_undertone,vibe,colours_that_glow,colours_to_avoid,camilles_take,current_outfit_read,lifestyle,style_personality,colour_palette,budget_range,avoids,favourite_pieces,onboarding_complete")
      .eq(userId ? "user_id" : "session_id", profileKey)
      .maybeSingle();
    return result as { data: StyleProfile | null; error: { message?: string } | null };
  });

  if (error) {
    logSupabaseFallback(error);
    return null;
  }

  return data?.onboarding_complete ? data : null;
}

function joinList(value: string[] | null | undefined) {
  return value?.length ? value.join(", ") : "Not specified";
}

function profilePrompt(profile: StyleProfile | null) {
  if (!profile) {
    return `USER STYLE PROFILE:
No completed style profile yet. Ask naturally for missing details when needed.`;
  }

  return `WHAT YOU KNOW ABOUT THIS PERSON:
Vibe: ${profile.vibe || "Not specified"}
Body type: ${profile.body_type || "Not specified"}
Skin tone: ${profile.skin_tone || "Not specified"} with ${profile.skin_undertone || "unknown"} undertone
Colours that make them glow: ${joinList(profile.colours_that_glow)}
Colours to avoid: ${joinList(profile.colours_to_avoid)}
Style personality: ${joinList(profile.style_personality)}
Their favourite pieces: ${profile.favourite_pieces || "Not specified"}
Laila's original take on them: ${profile.camilles_take || "Not specified"}
Current outfit read from their photo: ${profile.current_outfit_read || "Not specified"}

You have seen this person. 
You know them. Every suggestion 
must be filtered through this profile.
Never give advice that ignores 
what you know about them.

USER STYLE PROFILE:
Gender: ${profile.gender || "Not specified"}
Body type: ${profile.body_type || "Not specified"}
Skin tone: ${profile.skin_tone || "Not specified"} with ${profile.skin_undertone || "unknown"} undertone
Lifestyle: ${joinList(profile.lifestyle)}
Style personality: ${joinList(profile.style_personality)}
Colour palette: ${joinList(profile.colour_palette)}
Budget: ${profile.budget_range || "Not specified"}
Avoids: ${joinList(profile.avoids)}
Favourite pieces they already own: ${profile.favourite_pieces || "Not specified"}

PERSONALISATION RULES:
Every outfit suggestion MUST reference the user's specific body type and explain WHY it works for them.
Example: "Wide leg trousers will balance your broader shoulders — the straight fall creates proportion."
Every colour suggestion MUST reference their skin tone.
Example: "With your warm wheatish undertone, earthy terracottas and deep mustards will make your skin glow."
If they said they avoid something, never suggest it.
If they mentioned favourite pieces, build on those and suggest what pairs with what they already love.
Always feel like you know this specific person — not generic advice.`;
}

function vibePrompt(vibeAnalysis: VibeAnalysis | null) {
  if (!vibeAnalysis) return "";

  return `WHAT I KNOW ABOUT THIS PERSON FROM THEIR PHOTO:
Vibe: ${vibeAnalysis.vibe || "Not specified"}
Skin tone: ${vibeAnalysis.skinTone || "Not specified"}
Body type: ${vibeAnalysis.bodyType || "Not specified"}
Currently wearing: ${vibeAnalysis.currentlyWearing || "Not specified"}
Style personality: ${vibeAnalysis.stylePersonality || "Not specified"}

Reference these observations naturally in your responses. You have seen this person — talk to them like you know what they look like.`;
}

async function callGemini({
  prompt,
  forceOutfitDirections,
  imageBase64,
  mimeType,
}: {
  prompt: string;
  forceOutfitDirections: boolean;
  imageBase64?: string | null;
  mimeType?: string | null;
}): Promise<StyleResponse | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const parts: Array<Record<string, unknown>> = [];
    if (imageBase64 && mimeType) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: imageBase64,
        },
      });
    }
    parts.push({ text: prompt });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.78,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(cleanJson(text));
    console.log("Style response:", JSON.stringify(parsed, null, 2));

    const outfitDirections = Array.isArray(parsed.outfitDirections)
      ? parsed.outfitDirections
          .filter((item: any) => item?.occasion && item?.direction)
          .slice(0, 3)
          .map((item: any) => ({
            occasion: String(item.occasion).toUpperCase().slice(0, 24),
            direction: String(item.direction).slice(0, 180),
          }))
      : [];

    if (forceOutfitDirections && outfitDirections.length === 0) {
      console.error("Gemini style response missing outfitDirections for outfit request.");
      return null;
    }

    return {
      response: String(parsed.response || "").slice(0, 700),
      hasOutfitDirections: forceOutfitDirections ? true : Boolean(parsed.hasOutfitDirections),
      outfitDirections,
      trendKeywords: safeArray(parsed.trendKeywords),
      shopTerms: safeArray(parsed.shopTerms).slice(0, 3),
      followUpSuggestions: safeArray(parsed.followUpSuggestions).slice(0, 2),
    };
  } catch (error) {
    console.error("Gemini style chat error:", error);
    return null;
  }
}

function sanitizeAppearanceResponse(response: StyleResponse): StyleResponse {
  return {
    ...response,
    hasOutfitDirections: false,
    outfitDirections: [],
    shopTerms: [],
  };
}

async function logMessage(userId: string | null, sessionId: string | null, message: string) {
  const supabase = getSupabaseClient();
  const profileKey = userId || sessionId;
  if (!supabase || !profileKey) return;

  const { error } = await supabase.from("style_interactions").insert({
    session_id: profileKey,
    user_id: userId,
    message,
    action: "message",
    created_at: new Date().toISOString(),
  });

  if (error) console.error("style interaction log failed:", error.message);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = String(body.message || "").trim();
    const mode = typeof body.mode === "string" ? body.mode : "";
    const gender = body.gender === "male" ? "male" : "female";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const userId = await getAuthenticatedUserId();
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : null;
    const mimeType =
      typeof body.imageMimeType === "string"
        ? body.imageMimeType
        : typeof body.mimeType === "string"
          ? body.mimeType
          : null;
    const vibeAnalysis = body.vibeAnalysis && typeof body.vibeAnalysis === "object" ? (body.vibeAnalysis as VibeAnalysis) : null;
    const history = Array.isArray(body.conversationHistory) ? (body.conversationHistory as ChatMessage[]).slice(-12) : [];

    if (mode === "style-piece") {
      if (!imageBase64 || !mimeType) {
        return NextResponse.json({ error: "Missing image" }, { status: 400 });
      }

      const pieceResult = await styleUploadedPiece({ imageBase64, mimeType });
      if (!pieceResult) {
        return NextResponse.json({ error: "Failed to style piece" }, { status: 500 });
      }

      return NextResponse.json(pieceResult);
    }

    if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });

    const intent = classifyStyleChatIntent(message);

    if (intent === "appearance") {
      const profile = await getStyleProfile(sessionId);
      await logMessage(userId, sessionId, message);

      if (hasProfileMemory(profile, vibeAnalysis)) {
        return NextResponse.json(appearanceMemoryResponse(profile, vibeAnalysis));
      }

      if (imageBase64 && mimeType) {
        const prompt = `${CAMILLE_SYSTEM_PROMPT}

The user is asking how they look, what vibe they give off, which features stand out, or what aesthetic/colours suit them.
Use the uploaded image only for appearance, vibe, colours, proportions, and style personality.
Do not suggest products.
Do not create outfit cards.
Do not return shopTerms.

USER'S CURRENT QUESTION:
${message}

Respond in JSON only:
{
  "response": "conversational reply, max 3 sentences, warm and direct",
  "hasOutfitDirections": false,
  "outfitDirections": [],
  "trendKeywords": ["vibe, colour, or style words only"],
  "shopTerms": [],
  "followUpSuggestions": ["natural follow-up question 1", "natural follow-up question 2"]
}`;

        const geminiResponse = await callGemini({
          prompt,
          forceOutfitDirections: false,
          imageBase64,
          mimeType,
        });

        if (geminiResponse) return NextResponse.json(sanitizeAppearanceResponse(geminiResponse));
      }

      return NextResponse.json(photoNeededResponse(Boolean(imageBase64 && mimeType)));
    }

    const [knowledgeResult, trendContext, profile] = await Promise.all([
      searchLailaStyleKnowledge(message, gender, 8, "style-chat"),
      getLatestTrendContext(),
      getStyleProfile(sessionId),
    ]);
    const knowledge = knowledgeResult.chunks;
    const forceOutfitDirections = isOutfitIntent(message) || isShoppingIntent(message);

    const knowledgeText = knowledge
      .map((item: any, index: number) => `${index + 1}. ${item.title}\nSource: ${item.source}\nCategory: ${item.category}\n${String(item.content || "").slice(0, 900)}`)
      .join("\n\n");

    const historyText = history
      .map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.content}`)
      .join("\n");

    const prompt = `${CAMILLE_SYSTEM_PROMPT}

GENDER CONTEXT: You are advising a ${gender} person.

Answer the CURRENT QUESTION specifically. Do not repeat previous advice.

CONVERSATION SO FAR:
${historyText || "No prior messages."}

USER'S CURRENT QUESTION:
${message}

${profilePrompt(profile)}

${vibePrompt(vibeAnalysis)}

YOUR KNOWLEDGE BASE:
Here are relevant style guides from certified fashion sources:
${knowledgeText || "No matching style guide found. Use broad fashion knowledge and Indian context."}

WHAT'S TRENDING RIGHT NOW IN INDIA:
${trendContext.trending.join(", ") || "No trend data available."}

WHAT'S PREDICTED TO RISE SOON:
${trendContext.rising.join(", ") || "No prediction data available."}

YOUR RULES:
- Never use ratings or scores
- Never say "I recommend" or "I suggest"; just say it directly
- Be specific about garments, not generic
- Reference Indian context when relevant, including Indian occasions, Indian climate, Indian retailers
- Use the USER STYLE PROFILE whenever available. Mention why a garment, silhouette, or colour works for their body type, skin tone, lifestyle, and favourite pieces.
- Never suggest anything the profile says they avoid.
- If the user doesn't know their style, ask ONE simple question to help narrow it down
- Connect advice to current trends when relevant
- Always end with a natural follow-up you could explore
- The conversation history is context only; answer the user's current question directly and specifically
- IMPORTANT: If the user asks about outfits, what to wear, style ideas, or anything requiring clothing suggestions, you MUST set hasOutfitDirections: true and provide at least 2 outfitDirections objects. Never return an empty outfitDirections array when the user is asking about what to wear.
- shopTerms should be 2-3 specific shopping search terms that match the outfit advice. The app will choose the right retailers from those terms.
- Generate search terms that would find premium, editorial-looking products.
- Generate shopTerms that would return premium, editorial results.
- For WESTERN pieces always include one of these brand names in the search term when relevant: COS, Toteme, Arket, Sandro, Mango, Massimo Dutti, Zara Studio, Uniqlo.
  Example: instead of "wide leg trousers", write "COS wide leg trousers minimal" or "Toteme straight trousers".
- For INDIAN pieces include brand:
  instead of "silk lehenga", write "Raw Mango silk lehenga" or "Anita Dongre lehenga editorial".
  This anchors the search to premium results immediately.
- For menswear western: include "NN07" or "Oliver Spencer" or "Reiss" for smart pieces. Include "Sunspel" for basics.
- Add aesthetic descriptors to shopTerms:
  Instead of "straight leg jeans", write "straight leg jeans minimal clean".
  Instead of "white shirt", write "white linen shirt oversized minimal".
  Instead of "lehenga", write "silk lehenga jewel tone editorial".
- Every shopTerm MUST include one of these descriptors: minimal, clean, editorial, luxury, premium, aesthetic, structured, elegant.
- Never include these words in shopTerms: cheap, budget, affordable, casual, basic.
- BRAND KNOWLEDGE — WESTERN:
  Entry luxury: COS, Arket, Sandro, Maje, & Other Stories.
  Mid premium: Zara (good pieces only — the tailored and linen lines), Mango Committed, Massimo Dutti, Uniqlo (linen, basics, cashmere).
  Investment pieces: Toteme, A.P.C., Isabel Marant, Acne Studios, Jacquemus, Ganni.
  Menswear specific: Oliver Spencer, NN07, Sunspel, Reiss, Tiger of Sweden.
- BRAND KNOWLEDGE — INDIAN PREMIUM:
  Contemporary: Anita Dongre, Raw Mango, Anavila, Lovebirds, Bodice.
  Occasion: Tarun Tahiliani, Manish Malhotra (but only for heavy occasions), Rimzim Dadu, Gaurav Gupta.
  Accessible premium: Indya (for younger), Libas (good basics), Kalki (lehengas), Pernia's Pop-Up Shop (multi-designer).
  Men ethnic: Manyavar (accessible), Sahil Beggarani (premium), Raghavendra Rathore (investment).
  Avoid suggesting: anything from Meesho, Snapdeal, or unbranded Amazon listings — these look cheap.
${LAILA_FASHION_INTELLIGENCE}
- WHAT LAILA NEVER RECOMMENDS:
  Fast fashion for investment pieces.
  Anything that looks like it came from a wholesale market.
  Over-embellished pieces unless it's a genuine occasion.
  Branded logos as a style statement; she finds it nouveau riche.
  Anything that doesn't serve the specific person's body and colouring.
- When suggesting products, mention specific brands that actually carry what you're describing.
- For shopTerms, use the brand name in the search query when relevant, e.g. "Raw Mango silk lehenga editorial", "COS wide leg trousers minimal", or "NN07 tailored trousers clean".

Respond in JSON only:
{
  "response": "conversational reply, max 3 sentences, warm and direct",
  "hasOutfitDirections": true,
  "outfitDirections": [
    {"occasion": "GYM", "direction": "specific outfit description max 20 words"}
  ],
  "trendKeywords": ["relevant trending keywords to show as pills"],
  "shopTerms": ["2-3 specific search terms for shopping"],
  "followUpSuggestions": ["natural follow-up question 1", "natural follow-up question 2"]
}`;

    const geminiResponse = await callGemini({
      prompt,
      forceOutfitDirections,
      imageBase64,
      mimeType,
    });
    await logMessage(userId, sessionId, message);

    if (!geminiResponse) {
      console.error("Style chat using fallback response because Gemini returned null.");
    }

    const response = geminiResponse || fallbackResponse(message, gender, trendContext.trending);
    const generatedOutfitImages = await generateChatOutfitImages(response);
    if (generatedOutfitImages.length) {
      response.generatedOutfitImages = generatedOutfitImages;
    }
    return NextResponse.json(response);
  } catch (error) {
    console.error("Style chat route error:", error);
    return NextResponse.json({ error: "Failed to answer style question" }, { status: 500 });
  }
}
