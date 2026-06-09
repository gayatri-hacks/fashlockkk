import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'
export const revalidate = 21600

const GEMINI_MODEL = 'gemini-2.5-flash'

type Gender = 'women' | 'men'

type Formula = {
  occasion: string
  formula: string
  why: string
}

function cleanJson(text: string) {
  return text.replace(/```json|```/g, '').trim()
}

async function callGeminiText(prompt: string) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return ''

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.72 },
        }),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini error:', response.status, err)
      return ''
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  } catch (error) {
    console.error('Gemini style text error:', error)
    return ''
  }
}

async function callGeminiJson<T>(prompt: string, fallback: T) {
  const text = await callGeminiText(prompt)
  if (!text) return fallback

  try {
    return JSON.parse(cleanJson(text)) as T
  } catch (error) {
    console.error('Gemini style JSON parse error:', error)
    return fallback
  }
}

function fallbackFormulas(keyword: string, gender: Gender): Formula[] {
  const base = gender === 'men' ? 'tailored trousers' : 'straight-leg jeans'
  return [
    {
      occasion: 'WORK',
      formula: `${keyword} shirt + ${base} + loafers`,
      why: 'It keeps the trend polished without making the whole outfit feel like a costume.',
    },
    {
      occasion: 'WEEKEND',
      formula: `${keyword} piece + white tee + clean sneakers`,
      why: 'The simple basics let the trend be the thing people notice first.',
    },
    {
      occasion: 'EVENING',
      formula: `${keyword} layer + dark trousers + slim boots`,
      why: 'The darker base makes it feel sharper and more intentional.',
    },
  ]
}

async function styleData(keyword: string, editorialName: string) {
  const welcomePrompt = `The user is curious about fashion and wants to understand the '${editorialName}' trend. Write 3 sentences in warm, plain, friendly language. 

Sentence 1: What this trend actually is, explained simply. No jargon.
Sentence 2: Why it's having a moment right now — cultural context, who's wearing it.
Sentence 3: The simplest way to try it this weekend — one specific outfit idea.

Sound like a stylish friend texting you, not a fashion editor writing a column. No words like 'silhouette', 'sartorial', 'iteration'. Keep it real.`

  const formulaPrompt = (gender: Gender) => `For the '${keyword}' trend, write 3 specific outfit formulas for ${gender}.
Each formula:
- Occasion: one of (Work / Weekend / Evening)
- The formula: exactly what to wear, written as '[item] + [item] + [item]' like a recipe. Specific. No vague words.
- One sentence why it works.

Example format:
WEEKEND
Loose linen shirt + wide leg trousers + white sneakers
The proportions do the work — relaxed on top, relaxed on bottom, clean shoe keeps it sharp.

Return JSON array of 3 objects:
[{occasion, formula, why}]`

  const avoidPrompt = `What is the single most common mistake people make when trying the '${keyword}' trend for the first time? One sentence, brutally honest, friendly tone.
Example: 'Going too oversized everywhere at once — pick one loose piece and keep everything else fitted.'`

  const starterPrompt = `For someone new to the '${keyword}' trend, what is the single best search term to type into Myntra right now to find the perfect starter piece? One search term only. Max 4 words.`

  const [welcome, womenFormulas, menFormulas, avoidThis, starterSearchTerm] = await Promise.all([
    callGeminiText(welcomePrompt),
    callGeminiJson<Formula[]>(formulaPrompt('women'), fallbackFormulas(keyword, 'women')),
    callGeminiJson<Formula[]>(formulaPrompt('men'), fallbackFormulas(keyword, 'men')),
    callGeminiText(avoidPrompt),
    callGeminiText(starterPrompt),
  ])

  return {
    welcome:
      welcome ||
      `${editorialName} is an easy way to make a familiar outfit feel current. It is showing up because people want pieces that feel personal, wearable, and a little more intentional. Try it this weekend with one strong ${keyword} piece, simple basics, and a clean shoe.`,
    formulas: {
      women: womenFormulas.slice(0, 3),
      men: menFormulas.slice(0, 3),
    },
    avoidThis:
      avoidThis ||
      `Doing too much at once — start with one ${keyword} piece and keep the rest of the outfit simple.`,
    starterSearchTerm: (starterSearchTerm || `${keyword} outfit`).replace(/^["']|["']$/g, '').trim(),
  }
}

const cachedStyleData = unstable_cache(styleData, ['trends-style-mode'], {
  revalidate: 21600,
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get('keyword')?.trim()
  const editorialName = searchParams.get('editorialName')?.trim() || keyword

  if (!keyword) {
    return NextResponse.json({ error: 'Missing keyword' }, { status: 400 })
  }

  try {
    return NextResponse.json(await cachedStyleData(keyword.toLowerCase(), editorialName || keyword))
  } catch (error) {
    console.error('Trend style route error:', error)
    return NextResponse.json({ error: 'Failed to load style mode' }, { status: 500 })
  }
}
