import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from '@/lib/supabase'
import { enqueueTrendImageJob, getGeneratedFashionImage } from '@/lib/images/generated-fashion-images'
import { syntheticTrendIdForKeyword } from '@/lib/images/build-fashion-image-prompt'

export const dynamic = 'force-dynamic'
export const revalidate = 7200

const GEMINI_MODEL = 'gemini-2.5-flash'

const MARKET_META: Record<string, { market: string }> = {
  IT: { market: 'Italy' },
  FR: { market: 'France' },
  US: { market: 'United States' },
  KR: { market: 'Korea' },
  JP: { market: 'Japan' },
  GB: { market: 'United Kingdom' },
  DE: { market: 'Germany' },
  AU: { market: 'Australia' },
  BR: { market: 'Brazil' },
  IN: { market: 'India' },
  SG: { market: 'Singapore' },
  AE: { market: 'UAE' },
}

const FALLBACK_PEXELS_QUERIES = (keyword: string) => [
  `${keyword} fashion outfit editorial`,
  `${keyword} street style fashion`,
  `${keyword} outfit lookbook`,
]

type SearchTrend = {
  id: number
  keyword: string
  editorialName?: string
  oneLiner?: string
  howToWear?: string[]
  conceptImageUrl?: string | null
  generatedImageUrl?: string | null
}

function cleanJson(text: string) {
  return text.replace(/```json|```/g, '').trim()
}

function normalizeStatus(status: string) {
  const value = status?.toUpperCase()
  if (value === 'RISING' || value === 'PEAKING' || value === 'FADING') return value
  return 'RISING'
}

function buildStyleDirections(directions: string[] = []) {
  const occasions = ['FOR THE OFFICE', 'WEEKEND EDIT', 'EVENING OUT']
  return directions.slice(0, 3).map((text, index) => ({
    occasion: occasions[index] || 'STYLE NOTE',
    text,
  }))
}

function colorBrightness(color?: string) {
  const hex = color?.replace('#', '')
  if (!hex || hex.length !== 6) return 0
  const red = parseInt(hex.slice(0, 2), 16)
  const green = parseInt(hex.slice(2, 4), 16)
  const blue = parseInt(hex.slice(4, 6), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114
}

async function callGemini(prompt: string): Promise<any | null> {
  try {
    const key = process.env.GEMINI_API_KEY
    if (!key) return null

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
          generationConfig: { temperature: 0.75, responseMimeType: 'application/json' },
        }),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini error:', response.status, err)
      return null
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? JSON.parse(cleanJson(text)) : null
  } catch (error) {
    console.error('Gemini trend search error:', error)
    return null
  }
}

async function fetchPexelsImages(queries: string[]) {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []

  const images: string[] = []
  for (const query of queries.slice(0, 3)) {
    try {
      const response = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=15`,
        {
          headers: { Authorization: key },
          next: { revalidate: 10800 },
        }
      )
      if (!response.ok) continue

      const data = await response.json()
      const selected =
        data.photos
          ?.filter((photo: any) => photo.width >= 800)
          ?.filter((photo: any) => photo.width !== photo.height)
          ?.filter((photo: any) => !photo.photographer?.toLowerCase().includes('screenshot'))
          ?.sort((a: any, b: any) => {
            return colorBrightness(b.avg_color) - colorBrightness(a.avg_color)
          })
          ?.slice(0, 2)
          ?.map((photo: any) => photo.src?.large2x || photo.src?.large)
          ?.filter(Boolean) || []

      images.push(...selected)
    } catch (error) {
      console.error('Pexels trend search error:', error)
    }
  }

  return images.slice(0, 6)
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

async function buildDatabaseTrend(keyword: string, gemini: any) {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  return supabaseCache(`trends-search-db:${keyword}`, supabaseCacheTtl('historical_trend_data'), async () => {
    const { data: keywordData, error: keywordError } = await supabase
      .from('trend_keywords')
      .select('id, keyword')
      .ilike('keyword', `%${keyword}%`)
      .limit(1)
      .maybeSingle()
    if (keywordError) throw keywordError

    if (!keywordData) return null

    const latestDate = await getLatestDate(supabase)

    const { data: trendHistory, error: historyError } = await supabase
      .from('historical_trend_data')
      .select('month, google_score')
      .eq('keyword_id', keywordData.id)
      .eq('market', 'IN')
      .order('month', { ascending: true })
      .limit(24)
    if (historyError) throw historyError

    const current = trendHistory?.[trendHistory.length - 1]?.google_score || 0
    const older = trendHistory?.[Math.max(0, trendHistory.length - 4)]?.google_score || 0
    let velocity: 'RISING' | 'PEAKING' | 'FADING' = 'PEAKING'
    if (current > older * 1.1) velocity = 'RISING'
    if (current < older * 0.9) velocity = 'FADING'

    const { data: marketData, error: marketError } = await supabase
      .from('historical_trend_data')
      .select('market, google_score')
      .eq('keyword_id', keywordData.id)
      .eq('month', latestDate)
      .order('google_score', { ascending: false })
      .limit(2)
    if (marketError) throw marketError

    const pexelsQueries = gemini?.pexelsQueries || FALLBACK_PEXELS_QUERIES(keywordData.keyword)
    const pexelsImages = await fetchPexelsImages(pexelsQueries)
    const generatedImage = await getGeneratedFashionImage({
      entityType: 'trend',
      entityId: Number(keywordData.id),
      variant: 'trend_hero',
    })

    return {
      id: keywordData.id,
      keyword: keywordData.keyword,
      editorialName: gemini?.editorialName || keywordData.keyword,
      oneLiner: gemini?.story || `${keywordData.keyword} is moving through the fashion conversation right now.`,
      story: gemini?.story,
      whoIsWearingIt: gemini?.whoIsWearingIt,
      avoidThis: gemini?.avoidThis,
      howToWear: gemini?.howToWear || ['Let it lead a polished weekday look', 'Relax it with lived-in basics', 'Sharpen it for evening'],
      styleDirections: buildStyleDirections(gemini?.howToWear || []),
      shopSearchTerms: gemini?.shopSearchTerms || [keywordData.keyword],
      pexelsQueries,
      pexelsImages,
      pexelsImageUrl: pexelsImages[0] || null,
      generatedImageUrl: generatedImage?.image_url || null,
      velocity,
      topMarkets: (marketData || []).map((market: any) => ({
        code: market.market,
        market: MARKET_META[market.market]?.market || market.market,
      })),
      trendData: trendHistory?.map((point: any) => ({ month: point.month, value: point.google_score })) || [],
    }
  })
}

async function buildGeminiTrend(keyword: string, gemini: any) {
  const pexelsQueries = gemini?.pexelsQueries || FALLBACK_PEXELS_QUERIES(keyword)
  const pexelsImages = await fetchPexelsImages(pexelsQueries)
  const base = normalizeStatus(gemini?.status)
  const seed = base === 'RISING' ? 42 : base === 'PEAKING' ? 70 : 58
  const trendData = Array.from({ length: 24 }, (_, index) => ({
    month: `M${index + 1}`,
    value: Math.min(100, Math.max(8, Math.round(seed + Math.sin(index / 3) * 10 + index * (base === 'RISING' ? 1.4 : -0.3)))),
  }))

  const syntheticId = syntheticTrendIdForKeyword(keyword)
  const generatedImage = await getGeneratedFashionImage({
    entityType: 'trend',
    entityId: syntheticId,
    variant: 'trend_hero',
  })

  return {
    id: syntheticId,
    keyword,
    editorialName: gemini?.editorialName || keyword,
    oneLiner: gemini?.story || `${keyword} is building a new kind of wardrobe energy.`,
    story: gemini?.story,
    whoIsWearingIt: gemini?.whoIsWearingIt,
    avoidThis: gemini?.avoidThis,
    howToWear: gemini?.howToWear || ['Anchor it with tailoring', 'Wear it casually off duty', 'Make it sharper after dark'],
    styleDirections: buildStyleDirections(gemini?.howToWear || []),
    shopSearchTerms: gemini?.shopSearchTerms || [keyword, `${keyword} outfit`, `${keyword} style`, `${keyword} fashion`],
    pexelsQueries,
    pexelsImages,
    pexelsImageUrl: pexelsImages[0] || null,
    generatedImageUrl: generatedImage?.image_url || null,
    velocity: base,
    topMarkets: [
      { code: 'FR', market: 'France' },
      { code: 'KR', market: 'Korea' },
    ],
    trendData,
  }
}

async function attachCardCoverImages<T extends SearchTrend>(trend: T): Promise<T> {
  const candidateTrendIds = Array.from(
    new Set([
      Number.isFinite(trend.id) && trend.id !== 0 ? trend.id : null,
      trend.keyword ? syntheticTrendIdForKeyword(trend.keyword) : null,
    ].filter((id): id is number => typeof id === 'number'))
  )

  let conceptImageUrl: string | null = null
  let generatedImageUrl: string | null = trend.generatedImageUrl || null

  for (const entityId of candidateTrendIds) {
    if (!conceptImageUrl) {
      const conceptImage = await getGeneratedFashionImage({
        entityType: 'trend',
        entityId,
        variant: 'trend_concept',
      })
      conceptImageUrl = conceptImage?.image_url || null
    }

    if (!generatedImageUrl) {
      const heroImage = await getGeneratedFashionImage({
        entityType: 'trend',
        entityId,
        variant: 'trend_hero',
      })
      generatedImageUrl = heroImage?.image_url || null
    }

    if (conceptImageUrl && generatedImageUrl) break
  }

  if (!conceptImageUrl && candidateTrendIds[0]) {
    try {
      await enqueueTrendImageJob({
        trend: {
          id: candidateTrendIds[0],
          keyword: trend.keyword,
          editorialName: trend.editorialName || trend.keyword,
          oneLiner: trend.oneLiner,
          howToWear: trend.howToWear,
        },
        variant: 'trend_concept',
        priority: 5,
      })
    } catch (error) {
      console.warn('Search trend concept image enqueue skipped:', error instanceof Error ? error.message : error)
    }
  }

  return {
    ...trend,
    conceptImageUrl,
    generatedImageUrl,
  }
}

async function searchTrend(keyword: string) {
  const prompt = `You are Fashlock's trend intelligence engine.
The user searched for: ${keyword}
Generate trend intelligence as JSON:
{
  "editorialName": "punchy 2-3 word editorial trend name",
  "story": "2 sentences giving this trend a personality and cultural context. Warm, specific, like a Vogue editor.",
  "status": "RISING or PEAKING or FADING",
  "howToWear": [
    "3 specific styling directions, each max 15 words, occasion-specific"
  ],
  "whoIsWearingIt": "one sentence about the kind of person wearing this trend right now",
  "avoidThis": "one sentence about the most common mistake people make with this trend",
  "pexelsQueries": [
    "3 specific Pexels search queries for editorial outfit photos"
  ],
  "shopSearchTerms": [
    "4 specific shopping search terms"
  ]
}
Return only valid JSON.`

  const gemini = await callGemini(prompt)
  let databaseTrend = null
  try {
    databaseTrend = await buildDatabaseTrend(keyword, gemini)
  } catch (error) {
    logSupabaseFallback(error)
  }

  if (databaseTrend) {
    return { source: 'database', trend: databaseTrend }
  }

  return { source: 'gemini', trend: await buildGeminiTrend(keyword, gemini) }
}

const cachedSearchTrend = unstable_cache(searchTrend, ['trends-search'], {
  revalidate: 7200,
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get('keyword')?.trim()

  if (!keyword) {
    return NextResponse.json({ error: 'Missing keyword' }, { status: 400 })
  }

  try {
    const result = await cachedSearchTrend(keyword.toLowerCase())
    return NextResponse.json({
      ...result,
      trend: result.trend ? await attachCardCoverImages(result.trend) : result.trend,
    })
  } catch (error) {
    console.error('Trend search route error:', error)
    logSupabaseFallback(error)
    const trend = await buildGeminiTrend(keyword.toLowerCase(), null)
    return NextResponse.json({ source: 'fallback', trend: await attachCardCoverImages(trend) })
  }
}
