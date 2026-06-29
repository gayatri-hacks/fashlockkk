import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";
import { LAILA_FASHION_INTELLIGENCE } from "@/lib/laila-fashion-intelligence";
import { searchLailaStyleKnowledge } from "@/lib/laila-style-knowledge";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";

type Gender = "female" | "male";

type Analysis = {
  vibe: string;
  skinTone: string;
  bodyType: string;
  coloursThatWillGlow: string[];
  coloursToAvoid: string[];
  currentlyWearing: string;
  currentOutfitRead: string;
  whatIsWorking: string;
  theUpgrade: string;
  outfitDirections: Array<{ occasion: string; direction: string; why?: string }>;
  shopTerms: string[];
  stylePersonality: string;
  camillesTake: string;
};

type SerperShoppingItem = {
  title?: string;
  price?: string;
  imageUrl?: string;
  link?: string;
  source?: string;
};

function cleanJson(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function safeAnalysis(value: any): Analysis {
  return {
    vibe: String(value?.vibe || "Quietly considered"),
    skinTone: String(value?.skinTone || "Not clear"),
    bodyType: String(value?.bodyType || "Not clear"),
    coloursThatWillGlow: Array.isArray(value?.coloursThatWillGlow)
      ? value.coloursThatWillGlow.filter((item: any) => typeof item === "string").slice(0, 4)
      : [],
    coloursToAvoid: Array.isArray(value?.coloursToAvoid)
      ? value.coloursToAvoid.filter((item: any) => typeof item === "string").slice(0, 2)
      : [],
    currentlyWearing: String(value?.currentlyWearing || value?.currentOutfitRead || "A personal everyday look."),
    currentOutfitRead: String(value?.currentOutfitRead || value?.currentlyWearing || "A personal everyday look."),
    whatIsWorking: String(value?.whatIsWorking || "The look has a clear point of view. Keeping the styling intentional will make it stronger."),
    theUpgrade: String(value?.theUpgrade || "Sharpen one detail: cleaner shoes, a better drape, or a stronger outer layer."),
    outfitDirections: Array.isArray(value?.outfitDirections)
      ? value.outfitDirections
          .filter((item: any) => item?.occasion && item?.direction)
          .slice(0, 3)
          .map((item: any) => ({
            occasion: String(item.occasion).toUpperCase().slice(0, 24),
            direction: String(item.direction).slice(0, 220),
            why: item.why ? String(item.why).slice(0, 180) : undefined,
          }))
      : [],
    shopTerms: Array.isArray(value?.shopTerms)
      ? value.shopTerms.filter((item: any) => typeof item === "string").slice(0, 3)
      : [],
    stylePersonality: String(value?.stylePersonality || "Personal minimalism"),
    camillesTake: String(value?.camillesTake || ""),
  };
}

async function analyseImage(imageBase64: string, mimeType: string, gender: Gender) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const knowledgeResult = await searchLailaStyleKnowledge(
    "premium outfit analysis expensive colours skin tone proportion silhouette fabric quality",
    gender,
    8,
    "style-analyse",
  );
  const knowledgeText = knowledgeResult.chunks
    .map((item, index) => `${index + 1}. ${item.title}\nSource: ${item.source}\nCategory: ${item.category}\nTags: ${(item.category_tags || []).join(", ") || "none"}\n${String(item.content || "").slice(0, 700)}`)
    .join("\n\n");

  const prompt = `You are Camille, a world-class stylist
with an instinctive eye for personal 
style. You can read a person's entire 
aesthetic in seconds.

FOCUS ONLY ON:
- The person's face and features
- Their skin tone and undertone
- Their body shape and proportions
- What they are wearing — every piece,
  every detail, how it fits, how it sits
- How the pieces work together
- The overall energy they give off

COMPLETELY IGNORE:
- The background
- The setting or location
- Lighting or photo quality
- Anything that is not the person
  and what they are wearing

READ THEM LIKE A STYLIST WOULD:

Look at their face first — skin tone,
features, colouring. This tells you 
what colours will make them glow.

Look at their body — not to judge, 
but to understand their proportions.
What silhouettes will work? What will 
elongate, balance, define?

Look at what they're wearing — is it
working for their body? Their colouring?
Their energy? What does it say about 
their taste level right now?

Then feel their vibe — some people 
give off quiet luxury without trying.
Some give off chaotic maximalism. 
Some are clearly minimalist at heart 
but don't know it yet. 
What does this person's soul say 
about how they want to dress?

BE CAMILLE:
- Direct, warm, opinionated
- Reference specific things you see
  on the PERSON only
- Never mention the background
- Never say anything generic
- If their current outfit has issues,
  name them kindly but clearly
- If something is working, say exactly
  why it works for THEIR specific body
  and colouring
- Have a point of view

BRAND KNOWLEDGE — WESTERN:
- Entry luxury: COS, Arket, Sandro, Maje, & Other Stories.
- Mid premium: Zara tailored and linen lines, Mango Committed, Massimo Dutti, Uniqlo linen, basics, cashmere.
- Investment pieces: Toteme, A.P.C., Isabel Marant, Acne Studios, Jacquemus, Ganni.
- Menswear specific: Oliver Spencer, NN07, Sunspel, Reiss, Tiger of Sweden.

BRAND KNOWLEDGE — INDIAN PREMIUM:
- Contemporary: Anita Dongre, Raw Mango, Anavila, Lovebirds, Bodice.
- Occasion: Tarun Tahiliani, Manish Malhotra for heavy occasions, Rimzim Dadu, Gaurav Gupta.
- Accessible premium: Indya, Libas basics, Kalki, Pernia's Pop-Up Shop.
- Men ethnic: Manyavar, Sahil Beggarani, Raghavendra Rathore.
- Avoid suggesting Meesho, Snapdeal, or unbranded Amazon listings.

${LAILA_FASHION_INTELLIGENCE}

YOUR KNOWLEDGE BASE:
Here are relevant premium fashion intelligence chunks to use when judging fabric, colour, proportion and taste:
${knowledgeText || "No matching premium style guide found. Use Laila's built-in fashion intelligence."}

Respond in JSON only — no markdown:
{
  vibe: 'their style vibe in 5-7 words.
    Poetic and specific. 
    e.g. Quiet confidence, 
    understated warmth or
    Bold spirit held back by safe 
    choices or Effortless Parisian 
    meets Mumbai energy',
    
  skinTone: 'specific skin tone you 
    see e.g. warm wheatish with 
    golden undertone or deep dusky 
    with cool undertone',
    
  bodyType: 'their body type based 
    on what you see in the photo',
    
  coloursThatWillGlow: [
    '3-4 specific colours that will 
    make THIS person look incredible
    based on their skin tone.
    Be specific — not just red but
    deep burgundy or warm terracotta'
  ],
  
  coloursToAvoid: [
    '2 colours that will wash them out
    or clash with their skin tone'
  ],
    
  currentOutfitRead: '2-3 sentences.
    What are they wearing? How does 
    it fit? What is working and what 
    is not? Reference their specific 
    body and colouring. Be real.',
    
  whatIsWorking: '1-2 sentences.
    Something specific you see that 
    is genuinely good about their 
    current look. Only say this if 
    something IS actually working.',
    
  theUpgrade: '2-3 very specific,
    actionable suggestions to 
    immediately elevate this look.
    Name exact pieces, exact fits,
    exact swaps. Reference what you 
    see on their body specifically.
    e.g. The top is fighting your 
    shoulders — try a V-neck or 
    scoop neck in the same colour 
    instead. or Those trousers need 
    to be hemmed 2 inches — right 
    now they are breaking on the 
    shoe and losing the line.',
    
  outfitDirections: [
    {
      occasion: 'OCCASION NAME',
      direction: 'Complete outfit 
        built specifically for this 
        person based on their body 
        type skin tone and vibe.
        Name every piece. Explain 
        why each one works for them.',
      why: 'One sentence on why this 
        direction works specifically 
        for their body and colouring'
    }
  ],
  
  stylePersonality: 'detected style 
    personality in 3 words',
    
  shopTerms: [
    '3 specific product search terms 
    for the outfit directions. 
    Premium and editorial descriptors.
    e.g. wide leg linen trousers minimal
    or silk slip dress jewel tone elegant.
    For western pieces include premium
    brand anchors when relevant:
    COS, Toteme, Arket, Sandro, Mango,
    Massimo Dutti, Zara Studio, Uniqlo.
    For Indian pieces include premium
    brand anchors: Raw Mango, Anita
    Dongre, Anavila, Kalki, Indya,
    Pernia's Pop-Up Shop, Sahil Beggarani.
    For menswear western include NN07,
    Oliver Spencer, Reiss, or Sunspel.
    Never include cheap, budget,
    affordable, Meesho, Snapdeal,
    or unbranded Amazon.'
  ],
  
  camillesTake: 'Camilles personal 
    one-line opinion on this person 
    style potential. Honest, warm, 
    direct. Like something a great 
    stylist would say that makes you 
    feel seen. 
    e.g. You have great instincts — 
    you just need to trust them more 
    and stop playing it safe with colour
    or The bones of your style are 
    excellent. We just need to refine 
    the fit and you will look incredible'
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
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
          temperature: 0.45,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    console.error("Gemini style analyse error:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return safeAnalysis(JSON.parse(cleanJson(text)));
}

async function saveDetectedProfile(userId: string | null, sessionId: string | null, gender: Gender, analysis: Analysis) {
  const supabase = getSupabaseClient();
  const profileKey = userId || sessionId;
  if (!supabase || !profileKey) return;

  const { error } = await supabase.from("style_profiles").upsert(
    {
      session_id: profileKey,
      user_id: userId,
      gender,
      skin_tone: analysis.skinTone,
      body_type: analysis.bodyType,
      style_personality: [analysis.stylePersonality],
      vibe: analysis.vibe,
      colours_that_glow: analysis.coloursThatWillGlow,
      colours_to_avoid: analysis.coloursToAvoid,
      camilles_take: analysis.camillesTake,
      current_outfit_read: analysis.currentOutfitRead,
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );

  if (error) {
    console.error("style analyse profile save failed:", error.message);
  }
}

async function searchProducts(term: string, gender: Gender) {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const response = await fetch("https://google.serper.dev/shopping", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    body: JSON.stringify({
      q: `${term} ${gender === "male" ? "men" : "women"} India fashion`,
      gl: "in",
      hl: "en",
      num: 10,
    }),
  });

  if (!response.ok) {
    console.error("Serper analyse products failed:", response.status, await response.text());
    return [];
  }

  const data = (await response.json()) as { shopping?: SerperShoppingItem[] };
  return (data.shopping || [])
    .filter((item) => item.imageUrl && item.price && item.link)
    .filter((item) => !/\b(wholesale|bulk)\b/i.test(item.title || ""))
    .slice(0, 4)
    .map((item) => ({
      title: item.title || "Product",
      price: item.price || "",
      imageUrl: item.imageUrl || "",
      link: item.link || "",
      source: item.source || "Retailer",
    }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    const gender: Gender = body.gender === "male" ? "male" : "female";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const userId = await getAuthenticatedUserId();

    if (!userId && !sessionId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!imageBase64 || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return NextResponse.json({ error: "Missing or unsupported image" }, { status: 400 });
    }

    const analysis = await analyseImage(imageBase64, mimeType, gender);
    if (!analysis) {
      return NextResponse.json({ error: "Failed to analyse style photo" }, { status: 500 });
    }

    await saveDetectedProfile(userId, sessionId, gender, analysis);

    const productGroups: Array<{ term: string; products: Awaited<ReturnType<typeof searchProducts>> }> = [];

    return NextResponse.json({ analysis, productGroups });
  } catch (error) {
    console.error("Style analyse route error:", error);
    return NextResponse.json({ error: "Failed to analyse style photo" }, { status: 500 });
  }
}
