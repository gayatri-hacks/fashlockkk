import { NextResponse } from "next/server";

export const revalidate = 21600;
const GEMINI_MODEL = "gemini-2.5-flash";

type EventItem = {
  name: string;
  city: string;
  date: string;
  description: string;
  imageUrl: string | null;
};

const fallbackEvents: EventItem[] = [
  { name: "Paris Couture Week", city: "Paris", date: "2026-06", description: "Couture houses sharpen fantasy into silhouette.", imageUrl: null },
  { name: "Milan Menswear", city: "Milan", date: "2026-06", description: "Tailoring, leather, and new Italian ease move forward.", imageUrl: null },
  { name: "New York Resort Presentations", city: "New York", date: "2026-06", description: "American polish turns lighter and more cinematic.", imageUrl: null },
  { name: "London Graduate Shows", city: "London", date: "2026-06", description: "Young designers test fashion's next emotional language.", imageUrl: null },
];

function cleanJson(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

async function pexelsImage(query: string) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const params = new URLSearchParams({ query: `${query} fashion runway`, per_page: "1", orientation: "landscape" });
    const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: key },
      next: { revalidate },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { photos?: Array<{ src?: { landscape?: string; large?: string; medium?: string } }> };
    return data.photos?.[0]?.src?.landscape ?? data.photos?.[0]?.src?.large ?? data.photos?.[0]?.src?.medium ?? null;
  } catch {
    return null;
  }
}

async function fetchSearchSignals() {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: "fashion week June 2026 OR couture week 2026 OR fashion show 2026 OR met gala 2026 OR runway show June 2026",
        num: 10,
      }),
      next: { revalidate },
    });
    if (!response.ok) {
      console.error("Serper failed:", response.status, await response.text());
      return [];
    }
    const data = (await response.json()) as { organic?: Array<{ title?: string; snippet?: string }> };
    return (data.organic ?? []).map((item) => `${item.title ?? ""} — ${item.snippet ?? ""}`).filter(Boolean);
  } catch {
    return [];
  }
}

async function parseEvents(signals: string[]) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || signals.length === 0) return fallbackEvents;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Parse these fashion event search results into up to 6 clean event objects with fields name, city, date, description. Description max 14 words. Return ONLY valid JSON array.\n${signals.join("\n")}` }] }],
        }),
        next: { revalidate },
      },
    );
    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini error:", response.status, err);
      return fallbackEvents;
    }
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallbackEvents;
    const parsed = JSON.parse(cleanJson(text)) as Array<Partial<EventItem>>;
    return parsed
      .filter((item) => item.name && item.city)
      .slice(0, 6)
      .map((item) => ({
        name: item.name ?? "Fashion Event",
        city: item.city ?? "Global",
        date: item.date ?? "2026",
        description: item.description ?? "A fashion moment taking shape now.",
        imageUrl: null,
      }));
  } catch (error) {
    console.error("Gemini discover events error:", error instanceof Error ? error.message : error);
    return fallbackEvents;
  }
}

export async function GET() {
  const signals = await fetchSearchSignals();
  const parsed = await parseEvents(signals);
  const events = await Promise.all(parsed.slice(0, 6).map(async (event) => ({ ...event, imageUrl: await pexelsImage(event.name) })));
  return NextResponse.json({ events });
}
