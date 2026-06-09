import { NextResponse } from "next/server";

type SelectedItem = {
  name?: string;
  color?: string;
};

const OCCASIONS = [
  "Casual day out",
  "Girls' lunch",
  "Office or work",
  "Evening out",
  "Glam party night",
  "Lazy Sunday",
];

function cleanJson(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function pieceNames(selectedItems: SelectedItem[]) {
  return selectedItems.map((item) => item.name || "your piece").join(", ");
}

function fallbackDirections(selectedItems: SelectedItem[]) {
  const pieces = pieceNames(selectedItems);

  return [
    {
      occasion: OCCASIONS[0],
      vibe: ["easy", "clean", "confident"],
      howToWear: `Use ${pieces} in the simplest line: keep the lightest piece closest to the face, roll sleeves or cuffs once, and leave one layer open so the outfit has movement.`,
      addThese: ["white leather sneakers", "small crossbody bag", "fine gold hoops"],
      avoid: "Avoid adding too many loud colors; let the pieces look intentional.",
      editorialLine: "The look says she got ready in ten minutes and still understood the assignment.",
    },
    {
      occasion: OCCASIONS[1],
      vibe: ["pretty", "polished", "warm"],
      howToWear: `Soften ${pieces} with a neat tuck, a visible waist, and one romantic detail like jewellery, gloss, or a softer bag.`,
      addThese: ["ballet flats", "structured mini bag", "pearl studs"],
      avoid: "Avoid oversized everything; give the outfit one shaped moment.",
      editorialLine: "It is relaxed, but it still knows there will be photos.",
    },
    {
      occasion: OCCASIONS[2],
      vibe: ["sharp", "quiet", "capable"],
      howToWear: `Make ${pieces} feel more deliberate by buttoning or layering cleanly, keeping hems tidy, and choosing one tailored proportion.`,
      addThese: ["loafers", "sleek tote", "thin belt"],
      avoid: "Avoid distressed details or messy styling if the setting is formal.",
      editorialLine: "This is competence without costume.",
    },
    {
      occasion: OCCASIONS[3],
      vibe: ["sleek", "city", "edited"],
      howToWear: `Take ${pieces} into evening by sharpening the contrast: tuck cleaner, expose a little wrist or neckline, and keep the silhouette long.`,
      addThese: ["heeled boots", "black shoulder bag", "smoky liner"],
      avoid: "Avoid casual sneakers here unless the whole look is intentionally street.",
      editorialLine: "A city-night version of the same pieces, calmer and more magnetic.",
    },
    {
      occasion: OCCASIONS[4],
      vibe: ["glossy", "bold", "expensive"],
      howToWear: `Dress up ${pieces} with shine and height: make one item the base, layer the rest with confidence, and add a polished accessory near the face.`,
      addThese: ["strappy heels", "metallic clutch", "statement earrings"],
      avoid: "Avoid flat, daytime styling; the party version needs light, shine, or height.",
      editorialLine: "The basic pieces stop being basic when the styling gets cinematic.",
    },
    {
      occasion: OCCASIONS[5],
      vibe: ["soft", "undone", "comfortable"],
      howToWear: `Wear ${pieces} with the least effort: loosen the tuck, keep layers open, and choose comfort pieces that still look considered.`,
      addThese: ["soft slides", "canvas tote", "clean ribbed socks"],
      avoid: "Avoid over-accessorising; Sunday should breathe.",
      editorialLine: "The outfit is quiet, but not careless.",
    },
  ];
}

export async function POST(req: Request) {
  try {
    const key = process.env.GEMINI_API_KEY;
    const body = (await req.json()) as { selectedItems?: SelectedItem[] };
    const selectedItems = body.selectedItems ?? [];

    if (selectedItems.length < 1 || selectedItems.length > 5) {
      return NextResponse.json({ success: false, error: "Select 1 to 5 pieces" }, { status: 400 });
    }

    if (!key) {
      return NextResponse.json({ success: true, source: "fallback", directions: fallbackDirections(selectedItems) });
    }

    const pieces = selectedItems.map((item) => `${item.name ?? "piece"} (${item.color ?? "neutral"})`).join(", ");

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
                  text: `You are Fashlock's head stylist - French, brilliant, warm. You see outfit possibilities nobody else does.

The user owns these pieces: ${pieces}

Create 6 completely different outfit directions using some or all of these pieces. Each direction is for a different occasion and has a completely different energy.

Use these 6 occasions exactly:
1. Casual day out
2. Girls' lunch
3. Office or work
4. Evening out
5. Glam party night
6. Lazy Sunday

For each occasion return:
- "occasion": the occasion name
- "vibe": 3 words that capture the energy (e.g. "effortless, clean, confident")
- "howToWear": exactly how to style the selected pieces for this occasion - be specific about tucking, layering, rolling sleeves, etc.
- "addThese": 2 to 3 specific items to add that she likely already owns or can easily get - be specific (e.g. "white leather sneakers" not just "shoes")
- "avoid": one thing to avoid for this occasion with these pieces
- "editorialLine": one Fashlock-voice sentence that captures the whole look - make it beautiful

Return ONLY a valid JSON array of 6 objects. No markdown, no explanation.`,
                },
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
        return NextResponse.json({ success: true, source: "fallback", directions: fallbackDirections(selectedItems) });
      }

      throw new Error(`Gemini styling failed (${res.status})`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned no styling text");
    }

    return NextResponse.json({ success: true, source: "gemini", directions: JSON.parse(cleanJson(text)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
