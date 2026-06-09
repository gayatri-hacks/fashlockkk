import { NextResponse } from "next/server";
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from "@/lib/supabase";
import { createAuthServerClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";

function joinList(value: string[] | null | undefined) {
  return value?.length ? value.join(", ") : "Not specified";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authClient = await createAuthServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    const sessionId = user?.id || (typeof body.sessionId === "string" ? body.sessionId.trim() : "");

    if (!sessionId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ greeting: "I remember the shape of your style. What are we dressing for today?" });
    }

    const { data: profile, error } = await supabaseCache<{
      data: {
        vibe?: string | null;
        body_type?: string | null;
        skin_tone?: string | null;
        style_personality?: string[] | null;
        colours_that_glow?: string[] | null;
        camilles_take?: string | null;
        onboarding_complete?: boolean | null;
      } | null;
      error: { message?: string } | null;
    }>(`style-greeting-profile:${sessionId}`, supabaseCacheTtl("style_profiles"), async () => {
      const result = await supabase
        .from("style_profiles")
        .select("vibe,body_type,skin_tone,style_personality,colours_that_glow,camilles_take,onboarding_complete")
        .eq(user?.id ? "user_id" : "session_id", sessionId)
        .maybeSingle();
      return result as {
        data: {
          vibe?: string | null;
          body_type?: string | null;
          skin_tone?: string | null;
          style_personality?: string[] | null;
          colours_that_glow?: string[] | null;
          camilles_take?: string | null;
          onboarding_complete?: boolean | null;
        } | null;
        error: { message?: string } | null;
      };
    });

    if (error || !profile?.onboarding_complete) {
      if (error) logSupabaseFallback(error);
      return NextResponse.json({ greeting: "What are we dressing for today?" });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json({ greeting: `Still thinking about ${joinList(profile.colours_that_glow)} for you. What are we dressing for today?` });
    }

    const prompt = `The user is back. Their profile:
Vibe: ${profile.vibe || "Not specified"}
Body type: ${profile.body_type || "Not specified"}
Skin tone: ${profile.skin_tone || "Not specified"}
Style personality: ${joinList(profile.style_personality)}
Colours that suit them: ${joinList(profile.colours_that_glow)}
Last time Laila's take was: 
${profile.camilles_take || "Not specified"}

Write a short warm greeting as Laila.
2 sentences max. Reference something 
specific from their profile — their 
vibe or a colour that suits them.
Make them feel remembered.
Don't say 'welcome back'.
No exclamation marks.

Example:
'Still thinking about those warm 
terracottas for you. What are we 
dressing for today?'

Or:
'Your quiet confidence energy is very 
much on my mind. What do you need?'`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      console.error("Gemini greeting error:", response.status, await response.text());
      return NextResponse.json({ greeting: `Still thinking about ${profile.vibe || "your style"} for you. What are we dressing for today?` });
    }

    const data = await response.json();
    const greeting = String(data.candidates?.[0]?.content?.parts?.[0]?.text || "").replace(/^["']|["']$/g, "").trim();
    return NextResponse.json({ greeting: greeting || "What are we dressing for today?" });
  } catch (error) {
    console.error("Style greeting route error:", error);
    return NextResponse.json({ greeting: "What are we dressing for today?" });
  }
}
