import type { ClosetGapResult } from "@/lib/closet-gaps";

const GEMINI_MODEL = "gemini-2.5-flash";

function lowerCategory(category: string) {
  return category.toLowerCase();
}

function categorySubject(category: string) {
  return category;
}

function colourPhrase(colours: string[]) {
  const picked = colours.slice(0, 2);
  if (picked.length === 0) return "your strongest tones";
  if (picked.length === 1) return `${picked[0]} tones`;
  return `${picked[0]} and ${picked[1]} tones`;
}

export function templateClosetCopy(result: ClosetGapResult): string {
  const category = lowerCategory(result.missingCategory);
  const subject = categorySubject(result.missingCategory);
  const colours = colourPhrase(result.unlockedLookColours);

  if (result.unlockedLookCount >= 6) {
    return `${subject} would unlock ${result.unlockedLookCount} looks in your style, especially around ${colours}.`;
  }

  if (result.unlockedLookCount >= 3) {
    return `Add one strong ${category} piece and ${result.unlockedLookCount} saved outfit formulas start working harder.`;
  }

  return `The clearest gap is ${category}; it would complete ${result.unlockedLookCount} looks without changing your style direction.`;
}

function cleanText(text: string) {
  return text.replace(/```json|```/g, "").replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
}

export async function polishClosetCopy(result: ClosetGapResult): Promise<{ text: string; source: "gemini" | "template" }> {
  const fallback = templateClosetCopy(result);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { text: fallback, source: "template" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const prompt = `Write ONE sentence in Laila's fashion stylist voice.
Tone rules: direct, warm, specific, no fluff, no exclamation marks, no "great choice", no "absolutely".

Closet gap:
- Missing category: ${result.missingCategory}
- Looks unlocked: ${result.unlockedLookCount}
- Useful colours: ${result.unlockedLookColours.join(", ") || "not specified"}

Explain why this item matters. Return only the sentence.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.55,
          maxOutputTokens: 80,
        },
      }),
    });

    if (!response.ok) {
      console.error("Closet copy Gemini error:", response.status, await response.text());
      return { text: fallback, source: "template" };
    }

    const data = await response.json();
    const text = cleanText(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
    if (!text || text.length < 40) return { text: fallback, source: "template" };

    return { text: text.slice(0, 220), source: "gemini" };
  } catch (error) {
    console.error("Closet copy Gemini fallback:", error instanceof Error ? error.message : String(error));
    return { text: fallback, source: "template" };
  } finally {
    clearTimeout(timeout);
  }
}
