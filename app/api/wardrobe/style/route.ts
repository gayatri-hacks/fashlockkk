import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase-auth";

type WardrobePiece = {
  name?: string | null;
  color?: string | null;
  category?: string | null;
};

type CompleteLook = {
  name: string;
  uses: string[];
  missing: string[];
  why: string;
};

function cleanJson(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function pieceLabel(piece: WardrobePiece) {
  const color = piece.color?.trim();
  const name = piece.name?.trim();
  const category = piece.category?.trim();

  if (name && color && !name.toLowerCase().includes(color.toLowerCase())) return `${color} ${name}`;
  return name || category || "wardrobe piece";
}

function sanitizeOutfits(value: unknown): CompleteLook[] {
  const raw = Array.isArray((value as { outfits?: unknown[] })?.outfits) ? (value as { outfits: unknown[] }).outfits : [];

  return raw.slice(0, 3).map((item, index) => {
    const outfit = item as Partial<CompleteLook>;
    return {
      name: String(outfit.name || `Outfit ${index + 1}`).slice(0, 60),
      uses: Array.isArray(outfit.uses) ? outfit.uses.slice(0, 4).map((entry) => String(entry).slice(0, 60)) : [],
      missing: Array.isArray(outfit.missing) ? outfit.missing.slice(0, 2).map((entry) => String(entry).slice(0, 80)) : [],
      why: String(outfit.why || "This works because the proportions feel intentional.").slice(0, 180),
    };
  });
}

function fallbackOutfits(labels: string[]): CompleteLook[] {
  const first = labels[0] || "your hero piece";
  const second = labels[1] || "your easiest basic";
  const third = labels[2] || "your third piece";

  return [
    {
      name: "Clean Day Uniform",
      uses: [first, second].filter(Boolean),
      missing: ["white leather sneakers", "structured everyday tote"],
      why: "The clean accessories make your existing pieces feel deliberate instead of casual.",
    },
    {
      name: "Soft Polished Evening",
      uses: [first, third].filter(Boolean),
      missing: ["low block heels in black or nude", "small gold earrings"],
      why: "A little shine and height turns familiar pieces into a proper evening look.",
    },
    {
      name: "Easy Work Edit",
      uses: [second, third].filter(Boolean),
      missing: ["relaxed tailored blazer", "slim leather belt"],
      why: "Tailoring gives the outfit structure while still letting your own pieces lead.",
    },
  ];
}

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return NextResponse.json({ success: false, error: "Sign in to complete your wardrobe" }, { status: 401 });
    }

    const key = process.env.GEMINI_API_KEY;
    const body = (await req.json()) as { items?: WardrobePiece[]; labels?: string[] };
    const labels = (body.labels?.length ? body.labels : body.items?.map(pieceLabel) ?? [])
      .map((label) => String(label).trim())
      .filter(Boolean)
      .slice(0, 20);

    if (labels.length < 3) {
      return NextResponse.json({ success: false, error: "Upload at least 3 pieces first" }, { status: 400 });
    }

    if (!key) {
      return NextResponse.json({ success: true, source: "fallback", outfits: fallbackOutfits(labels) });
    }

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
                  text: `The user owns these clothing pieces: ${labels.join(", ")}

Suggest 3 complete outfits they can build using pieces they already own, and for each outfit identify 1-2 missing pieces they should buy to complete it. Be specific about colours and styles.

Return JSON:
{
  "outfits": [
    {
      "name": "...",
      "uses": ["piece1", "piece2"],
      "missing": ["specific missing item description"],
      "why": "one sentence on why this outfit works"
    }
  ]
}

Return only valid JSON. No markdown, no explanation.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.65,
          },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini wardrobe completion error:", res.status, err);
      if (res.status === 429) {
        return NextResponse.json({ success: true, source: "fallback", outfits: fallbackOutfits(labels) });
      }

      throw new Error(`Wardrobe completion failed (${res.status})`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned no wardrobe completion text");
    }

    const outfits = sanitizeOutfits(JSON.parse(cleanJson(text)));
    return NextResponse.json({ success: true, source: "gemini", outfits: outfits.length ? outfits : fallbackOutfits(labels) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
