import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 3600

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Static stories cache 24hrs, dynamic ones cache 1hr
const SLUG_CONTENT: Record<string, { topic: string; region: string; angle: string }> = {
  'pochampally-weavers':  { topic: 'Pochampally ikat weaving', region: 'Telangana, India', angle: 'The ancient ikat tradition of Pochampally and the weavers keeping it alive today' },
  'zardozi-gold-threads': { topic: 'Zardozi embroidery', region: 'Lucknow, India', angle: 'How Mughal-era gold thread embroidery survived centuries and still defines Indian luxury fashion' },
  'gen-z-saree':          { topic: 'Gen Z and the modern saree', region: 'Mumbai, India', angle: 'How young Indians are rewearing and reimagining the saree as a contemporary fashion statement' },
  'boro-patching':        { topic: 'Boro Japanese textile art', region: 'Tokyo, Japan', angle: 'How the Japanese art of boro — patching worn cloth — became a philosophy and a global aesthetic' },
  'harajuku-today':       { topic: 'Harajuku street fashion 2025', region: 'Tokyo, Japan', angle: 'Harajuku street style in 2025 — still rebellious, still weird, still completely itself' },
  'hanbok-modern':        { topic: 'Hanbok in global fashion', region: 'Seoul, Korea', angle: 'How the hanbok travelled from Korean heritage to global runways and K-drama wardrobes' },
  'seoul-streetwear':     { topic: 'Seoul streetwear scene', region: 'Seoul, Korea', angle: "Why Seoul's streetwear culture — from Hongdae to Ader Error — is setting the global agenda" },
  'italian-tailoring':    { topic: 'Neapolitan bespoke tailoring', region: 'Naples, Italy', angle: 'The Naples suit — soft shoulders, unlined jackets, a living craft passed down through families' },
  'french-effortless':    { topic: 'French Parisian style', region: 'Paris, France', angle: "The myth and the reality of effortless French style — what it actually takes to look like you're not trying" },
  'ankara-global':        { topic: 'Ankara wax print fashion', region: 'Lagos, Nigeria', angle: "Ankara isn't a trend. It's a language — how West African wax print fabric carries identity across the world" },
  'brazil-beach-fashion': { topic: 'Brazilian fashion evolution', region: 'São Paulo, Brazil', angle: 'From Copacabana to couture — how Brazil built a fashion identity that is bold, colourful, and entirely its own' },
  'savile-row-future':    { topic: 'Savile Row bespoke tailoring', region: 'London, UK', angle: 'Savile Row at a crossroads — can the home of British bespoke survive fast fashion, casualisation, and changing tastes?' },
}

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8 }
      }),
    }
  )
  if (!res.ok) {
    const err = await res.text()
    console.error('Gemini error:', res.status, err)
    return ''
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const slug    = searchParams.get('slug') ?? ''
  const dynamic = searchParams.get('dynamic') === '1'
  const title   = searchParams.get('title') ?? ''
  const region  = searchParams.get('region') ?? ''
  const type    = searchParams.get('type') ?? ''

  try {
    // For static slugs, check Supabase cache first
    if (!dynamic && slug) {
      try {
        const { data } = await supabase
          .from('story_editorials')
          .select('content')
          .eq('slug', slug)
          .limit(1)
          .single()
        
        if (data && data.content) {
          return NextResponse.json({ editorial: data.content })
        }
      } catch {
        // Not cached yet, will generate
      }
    }

    let prompt = ''

    if (dynamic && title) {
      // Dynamic story generated from hook title
      prompt = `You are a senior fashion editor writing for Vogue or Monocle.

Write a compelling editorial about this fashion story: "${title}"
Region: ${region}
Type: ${type}

The story was pitched with this hook headline — your editorial should deliver on the promise of that hook. Open with a specific scene, detail or moment that brings it to life. Then weave history, culture, and contemporary relevance. End with why this matters today.

Write 4-5 paragraphs of flowing prose. No bullet points, no headers. Warm, authoritative, surprising.
Under 450 words.`
    } else {
      const content = SLUG_CONTENT[slug]
      if (!content) return NextResponse.json({ editorial: '' })

      prompt = `You are a senior fashion editor writing for Vogue or Monocle.

Write a compelling editorial piece about: ${content.angle}
Region: ${content.region}
Topic: ${content.topic}

Open with a strong hook — a scene, a detail, a striking observation. Weave history, culture, and contemporary relevance. Write with warmth and authority. No bullet points, no headers, just flowing prose.
Under 450 words.`
    }

    const editorial = await callGemini(prompt)
    
    // Save static stories to cache
    if (!dynamic && slug && editorial) {
      try {
        await supabase
          .from('story_editorials')
          .upsert({ slug, content: editorial, generated_at: new Date().toISOString() })
      } catch {
        // Cache save failed, but we'll return the content anyway
      }
    }
    
    return NextResponse.json({ editorial })
  } catch (e) {
    console.error('story-editorial error:', e)
    return NextResponse.json({ editorial: '' })
  }
}
