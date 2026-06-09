import { NextResponse } from 'next/server'

export const revalidate = 21600 // cache 6 hours

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const titles = searchParams.get('titles') ?? ''

  if (!titles) return NextResponse.json({ intro: '' })

  const prompt = `You are a fashion editor at Vogue. Based on these article headlines from this week, write ONE sentence (max 25 words) that captures the mood or theme of this week in fashion. Be specific, poetic, surprising — not generic.

Headlines:
${titles}

Examples of GOOD intros:
- "This week, fashion looked east — Seoul dominated runways while Mumbai quietly rewrote everyday dressing."
- "Quiet luxury gave way to loud craft this week, as artisans reclaimed the spotlight from logos."
- "The body was back — and fashion had opinions about every inch of it."

Return ONLY the single sentence, nothing else.`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9 }
        }),
      }
    )
    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini error:', res.status, err)
      return NextResponse.json({ intro: '' })
    }
    const data = await res.json()
    const intro = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    return NextResponse.json({ intro })
  } catch (e) {
    console.error('curated-intro error:', e)
    return NextResponse.json({ intro: '' })
  }
}
