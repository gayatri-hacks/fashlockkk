import { NextResponse } from 'next/server'
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from '@/lib/supabase'

export const revalidate = 3600 // 1 hour cache
export const dynamic = 'force-dynamic'
const GEMINI_MODEL = 'gemini-2.5-flash'

const CITIES = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'FR', name: 'France' },
  { code: 'KR', name: 'Korea' },
  { code: 'JP', name: 'Japan' },
  { code: 'GB', name: 'United Kingdom' },
]

function fallbackCities(scope: string | null) {
  const cities = scope === 'world' ? CITIES : CITIES.slice(0, 1)
  const moods: Record<string, string> = {
    IN: 'India is refining heat-proof dressing with sharper everyday polish.',
    US: 'The United States is giving utility pieces a cleaner city read.',
    FR: 'France keeps the silhouette spare, sensual, and deliberate.',
    KR: 'Korea is turning layering into a precise visual language.',
    JP: 'Japan makes quiet workwear feel studied rather than practical.',
    GB: 'The United Kingdom returns to heritage pieces with modern restraint.',
  }
  return cities.map((city) => ({
    ...city,
    mood: moods[city.code] || 'Fashion forward and trendsetting',
  }))
}

async function callGemini(prompt: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY || '',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 },
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
    console.error('Gemini call error:', e)
    return ''
  }
}

async function getLatestDate(supabase: any): Promise<string> {
  const { data, error } = await supabase
    .from('historical_trend_data')
    .select('month')
    .order('month', { ascending: false })
    .limit(1)
  if (error) throw error

  return data?.[0]?.month || '2026-04-01'
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope')
    const cityList = scope === 'world' ? CITIES : CITIES.slice(0, 1)
    const supabase = getSupabaseClient()
    if (!supabase) {
      logSupabaseFallback()
      return NextResponse.json({ cities: fallbackCities(scope) })
    }

    const cities = await supabaseCache(`trends-cities-mood:${scope || 'in'}`, supabaseCacheTtl('historical_trend_data'), async () => {
      const latestDate = await getLatestDate(supabase)

      const result = await Promise.all(
        cityList.map(async (city) => {
        // Get top 10 keywords for this market
        const { data: marketTrends, error: marketTrendsError } = await supabase
          .from('historical_trend_data')
          .select('keyword_id, google_score')
          .eq('market', city.code)
          .eq('month', latestDate)
          .order('google_score', { ascending: false })
          .limit(10)
        if (marketTrendsError) throw marketTrendsError

        const keywordIds = marketTrends?.map((t: any) => t.keyword_id) || []
        const { data: keywords, error: keywordsError } = await supabase
          .from('trend_keywords')
          .select('keyword')
          .in('id', keywordIds)
        if (keywordsError) throw keywordsError

        const keywordList = keywords?.map((k: any) => k.keyword).join(', ') || 'fashion trends'

        const prompt = `Given top trending keywords [${keywordList}] in ${city.name} right now, write ONE sentence about the dominant fashion mood. Reference the keywords naturally. Sound like a fashion correspondent. No word 'leaning'. Max 12 words.`

        const mood = await callGemini(prompt)

        return {
          code: city.code,
          name: city.name,
          mood: mood || 'Fashion forward and trendsetting',
        }
        })
      )

      return result.length ? result : fallbackCities(scope)
    })

    return NextResponse.json({ cities })
  } catch (error) {
    console.error('Error fetching city moods:', error)
    logSupabaseFallback(error)
    return NextResponse.json({ cities: fallbackCities(new URL(request.url).searchParams.get('scope')) })
  }
}
