import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

const USER_ID = "fashlock_user_1";
const BUCKET = "wardrobe";
const CATEGORIES = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories"];

type WardrobeMeta = {
  name?: string;
  category?: string;
  color?: string;
  tags?: string[];
};

function cleanJson(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function safeMeta(meta: WardrobeMeta): Required<WardrobeMeta> {
  const category = CATEGORIES.includes(meta.category ?? "") ? meta.category ?? "Accessories" : "Accessories";

  return {
    name: String(meta.name ?? "Wardrobe piece").slice(0, 48),
    category,
    color: String(meta.color ?? "neutral").slice(0, 24),
    tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 5).map((tag) => String(tag).slice(0, 24)) : [],
  };
}

async function categoriseItem(imageBase64: string, mediaType: string): Promise<Required<WardrobeMeta>> {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error("Missing GEMINI_API_KEY");
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
                inline_data: {
                  mime_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              {
                text: `Analyse this clothing item and return ONLY a JSON object with these fields:
{
  "name": "short descriptive name, max 4 words",
  "category": "one of: Tops, Bottoms, Dresses, Outerwear, Shoes, Bags, Accessories",
  "color": "primary colour in one word",
  "tags": ["array", "of", "3", "style", "tags"]
}
No markdown, no explanation. Only valid JSON.`,
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
    throw new Error(`Gemini categorisation failed (${res.status})`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned no categorisation text");
  }

  return safeMeta(JSON.parse(cleanJson(text)) as WardrobeMeta);
}

export async function GET() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ success: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const pageSize = 20;
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("id, image_url, category, color, name, tags, created_at")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .range(0, pageSize - 1);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, items: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: "Supabase is not configured" }, { status: 500 });
    }

    const body = (await req.json()) as {
      imageBase64?: string;
      mediaType?: string;
      fileName?: string;
    };

    if (!body.imageBase64) {
      return NextResponse.json({ success: false, error: "Missing imageBase64" }, { status: 400 });
    }

    const mediaType = body.mediaType || "image/jpeg";
    const meta = await categoriseItem(body.imageBase64, mediaType);
    const extension = mediaType.includes("png") ? "png" : mediaType.includes("webp") ? "webp" : "jpg";
    const path = `${USER_ID}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => null);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(body.imageBase64, "base64"), {
        contentType: mediaType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const { data, error } = await supabase
      .from("wardrobe_items")
      .insert({
        user_id: USER_ID,
        image_url: publicUrl,
        category: meta.category,
        color: meta.color,
        name: meta.name,
        tags: meta.tags,
      })
      .select("id, image_url, category, color, name, tags, created_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ success: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase.from("wardrobe_items").delete().eq("user_id", USER_ID).eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
