import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 3600

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function callGemini(prompt: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 }
        }),
      }
    )
    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini error:', res.status, err)
      return ''
    }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  } catch (e) {
    console.error('Gemini article expansion error:', e)
    return ''
  }
}

function buildFallbackArticle(title: string, summary: string, source: string): string {
  const cleanSummary = summary?.trim()
  const sourceName = source || 'the source'

  if (cleanSummary) {
    return [
      `${cleanSummary}`,
      `The story matters because fashion news rarely moves in isolation. A headline like "${title}" usually sits at the crossing point of brand positioning, consumer appetite, cultural timing, and the visual signals that travel from runway images to social feeds to retail floors.`,
      `For shoppers and market watchers, the useful question is not only what happened, but what it changes next. Watch whether this becomes a short-lived media moment or starts appearing in styling choices, product drops, collaborations, and search behavior over the next few weeks.`,
      `This brief is expanded from ${sourceName}. Open the original report for the complete reporting, quotes, and publication context.`
    ].join('\n\n')
  }

  return [
    `${sourceName} is tracking "${title}" as a fashion story worth watching.`,
    `Even without a longer source summary, the headline points to a useful market signal: fashion audiences are paying attention to identity, taste, visibility, and the people or brands shaping the current conversation.`,
    `The retention value here is in the follow-through. If the story keeps appearing across other outlets, social platforms, and retail edits, it may be more than a one-day headline. If it disappears quickly, it was probably a short editorial spike rather than a durable trend.`,
    `Open the original report for the complete reporting, quotes, and publication context.`
  ].join('\n\n')
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id      = searchParams.get('id')
  const title   = searchParams.get('title') ?? ''
  const summary = searchParams.get('summary') ?? ''
  const source  = searchParams.get('source') ?? ''

  if (!title) return NextResponse.json({ content: '' })

  try {
    // If we have an ID, check the database first
    if (id) {
      try {
        const { data } = await supabase
          .from('news_articles')
          .select('expanded_content')
          .eq('id', id)
          .limit(1)
          .single()
        
        if (data?.expanded_content) {
          return NextResponse.json({ content: data.expanded_content })
        }
      } catch {
        // Not cached, will generate
      }
    }

    const prompt = `You are a fashion journalist. Based on this news headline and summary, write a full news article.

Headline: "${title}"
Summary: "${summary}"
Source: ${source}

Write a proper magazine-style news article in 4 paragraphs, factual but engaging.
- First paragraph: the clearest news hook, with who, what, and why it matters
- Second paragraph: context and background
- Third paragraph: significance for fashion culture, consumers, brands, or retail
- Fourth paragraph: what to watch next

Keep it under 350 words. No headers, no bullet points — just clean journalism prose.
Do NOT start with "In a..." or "Recently..." — start with the most interesting fact or detail.
Do not invent quotes, prices, dates, or named reactions that were not provided.`

    const generated = await callGemini(prompt)
    const content = generated || buildFallbackArticle(title, summary, source)

    // Save to database if we have an ID
    if (id && content) {
      try {
        await supabase
          .from('news_articles')
          .update({ expanded_content: content })
          .eq('id', id)
      } catch (e) {
        // Save failed, but we'll return the content anyway
        console.error('Failed to cache expanded content:', e)
      }
    }

    return NextResponse.json({ content })
  } catch (e) {
    console.error('article-expand error:', e)
    return NextResponse.json({ content: '' })
  }
}
