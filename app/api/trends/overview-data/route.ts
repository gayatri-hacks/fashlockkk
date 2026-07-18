import { NextResponse } from 'next/server'
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from '@/lib/supabase'
import { getAuthenticatedUserId } from '@/lib/supabase-auth'
import { getLatestTrendMonth, getTopTrendingKeywords, trendVelocityLabel } from '@/lib/trend-velocity'
import { enqueueTrendImageJob, getGeneratedFashionImagesForTrends } from '@/lib/images/generated-fashion-images'
import { syntheticTrendIdForKeyword } from '@/lib/images/build-fashion-image-prompt'
import { getMultiRegionTrendOverview } from '@/lib/trends/multi-region-pipeline'
import { isTrendImageAutoEnqueueEnabled } from '@/lib/trends/config'

export const dynamic = 'force-dynamic'
const GEMINI_MODEL = 'gemini-2.5-flash'

const MARKET_META: Record<string, { market: string; flag: string }> = {
  IT: { market: 'Italy', flag: '🇮🇹' },
  FR: { market: 'France', flag: '🇫🇷' },
  US: { market: 'United States', flag: '🇺🇸' },
  KR: { market: 'Korea', flag: '🇰🇷' },
  JP: { market: 'Japan', flag: '🇯🇵' },
  GB: { market: 'United Kingdom', flag: '🇬🇧' },
  DE: { market: 'Germany', flag: '🇩🇪' },
  AU: { market: 'Australia', flag: '🇦🇺' },
  BR: { market: 'Brazil', flag: '🇧🇷' },
  IN: { market: 'India', flag: '🇮🇳' },
  SG: { market: 'Singapore', flag: '🇸🇬' },
  AE: { market: 'UAE', flag: '🇦🇪' },
}

function buildFallbackHistory(seed: number) {
  return Array.from({ length: 24 }, (_, index) => ({
    month: `M${index + 1}`,
    value: Math.max(8, Math.min(100, Math.round(seed + Math.sin(index / 3) * 9 + index * 1.2))),
  }))
}

function fallbackTrend(id: number, keyword: string, editorialName: string, velocity: 'RISING' | 'PEAKING' | 'FADING', seed: number) {
  return {
    id,
    keyword,
    editorialName,
    oneLiner: `${editorialName} is carrying the season's cleaner, more intentional mood.`,
    howToWear: ['Keep the silhouette clean', 'Balance it with quiet basics', 'Let one piece lead'],
    shopSearchTerms: [`${keyword} minimal`, `${keyword} editorial`, `${keyword} premium`],
    pexelsImageUrl: null,
    velocity,
    topMarkets: [{ code: 'IN', market: 'India' }],
    trendData: buildFallbackHistory(seed),
  }
}

function fallbackOverviewData() {
  const trendingTrends = [
    fallbackTrend(1, 'linen', 'Effortless Linen', 'RISING', 34),
    fallbackTrend(2, 'cargo', 'Modern Utility', 'PEAKING', 46),
    fallbackTrend(3, 'mini', 'Mini Mania', 'RISING', 40),
  ]
  const cycleTrends = [
    ...trendingTrends,
    fallbackTrend(4, 'oversized blazer', 'Soft Tailoring', 'PEAKING', 52),
    fallbackTrend(5, 'tonal dressing', 'Tonal Dressing', 'FADING', 48),
    fallbackTrend(6, 'ballet flats', 'Flat Out', 'RISING', 44),
  ]

  return { trendingTrends, cycleTrends }
}

function cycleVelocityLabel(index: number, total: number): 'RISING' | 'PEAKING' | 'FADING' {
  const third = Math.max(1, Math.ceil(total / 3))
  if (index < third) return 'RISING'
  if (index < third * 2) return 'PEAKING'
  return 'FADING'
}

async function attachGeneratedTrendImages<T extends { id: number; keyword?: string; editorialName?: string; oneLiner?: string; howToWear?: string[] }>(trends: T[]) {
  if (!trends.length) return trends

  const syntheticIdsByTrendId = new Map<number, number>()
  const ids = trends.flatMap((trend) => {
    const entityIds = [trend.id]
    if (trend.keyword) {
      const syntheticId = syntheticTrendIdForKeyword(trend.keyword)
      syntheticIdsByTrendId.set(trend.id, syntheticId)
      entityIds.push(syntheticId)
    }
    return entityIds
  })

  const generatedImages = await getGeneratedFashionImagesForTrends(
    ids,
    ['trend_concept', 'trend_hero']
  )

  return Promise.all(
    trends.map(async (trend) => {
      const syntheticId = syntheticIdsByTrendId.get(trend.id)
      const conceptImageUrl =
        generatedImages.get(`${trend.id}:trend_concept`)?.image_url ||
        generatedImages.get(`${syntheticId}:trend_concept`)?.image_url ||
        null
      const generatedImageUrl =
        generatedImages.get(`${trend.id}:trend_hero`)?.image_url ||
        generatedImages.get(`${syntheticId}:trend_hero`)?.image_url ||
        null

      if (!conceptImageUrl && trend.keyword && isTrendImageAutoEnqueueEnabled()) {
        try {
          await enqueueTrendImageJob({
            trend: {
              id: trend.id,
              keyword: trend.keyword,
              editorialName: trend.editorialName || trend.keyword,
              oneLiner: trend.oneLiner,
              howToWear: trend.howToWear,
            },
            variant: 'trend_concept',
            priority: 1,
          })
        } catch (error) {
          console.warn('Trend concept image enqueue skipped:', error instanceof Error ? error.message : error)
        }
      }

      return {
        ...trend,
        conceptImageUrl,
        generatedImageUrl,
      }
    })
  )
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

function cleanGeminiJson(text: string) {
  return text.replace(/```json|```/g, '').trim()
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasList(value: unknown) {
  return Array.isArray(value) && value.some((item) => hasText(item))
}

function hasSavedUserStyleProfile(profile: any) {
  if (!profile) return false

  return Boolean(
    hasText(profile.primary_archetype) ||
      hasText(profile.secondary_archetype) ||
      hasList(profile.preferred_colors) ||
      hasList(profile.preferred_eras) ||
      hasList(profile.preferred_moods)
  )
}

function formatList(value: unknown) {
  return Array.isArray(value) ? value.filter(hasText).join(', ') : ''
}

function styleProfilePrompt(profile: any) {
  return `- Primary style archetype: ${profile?.primary_archetype || 'Unknown'}
- Secondary archetype: ${profile?.secondary_archetype || 'None'}
- Preferred colours: ${formatList(profile?.preferred_colors) || 'Unknown'}
- Preferred eras: ${formatList(profile?.preferred_eras) || 'Unknown'}
- Preferred moods: ${formatList(profile?.preferred_moods) || 'Unknown'}`
}

async function getSavedUserStyleProfile(supabase: any) {
  const userId = await getAuthenticatedUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from('user_style_profiles')
    .select('primary_archetype,secondary_archetype,preferred_colors,preferred_eras,preferred_moods')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Trending for You user style profile fetch failed:', error.message)
    return null
  }

  return hasSavedUserStyleProfile(data) ? data : null
}

async function generatePersonalizedTrendNotes(profile: any, trends: any[]) {
  const topTrends = trends.slice(0, 5)
  if (!profile || !topTrends.length) return []

  const trendNames = topTrends.map((trend) => trend.editorialName || trend.keyword).filter(Boolean)
  const prompt = `Given this user's style profile:
${styleProfilePrompt(profile)}

And these current trending items:
${trendNames.join(', ')}

For each trend, write ONE short sentence (max 12 words) explaining specifically why it suits this user's archetype, colour preferences, or aesthetic. Be specific and personal.

Return JSON only:
{ "notes": [{ "trend": "...", "note": "..." }] }`

  const response = await callGemini(prompt)
  try {
    const parsed = JSON.parse(cleanGeminiJson(response))
    const rawNotes = Array.isArray(parsed.notes) ? parsed.notes : []
    return topTrends
      .map((trend) => {
        const trendName = trend.editorialName || trend.keyword
        const match = rawNotes.find((item: any) => String(item?.trend || '').toLowerCase() === String(trendName).toLowerCase())
        const looseMatch = match || rawNotes.find((item: any) => String(item?.trend || '').toLowerCase().includes(String(trend.keyword || '').toLowerCase()))
        const indexFallback = rawNotes[topTrends.indexOf(trend)]
        const note = String(looseMatch?.note || indexFallback?.note || '').trim()
        return note
          ? {
              id: trend.id,
              keyword: trend.keyword,
              editorialName: trendName,
              note: note.slice(0, 140),
            }
          : null
      })
      .filter(Boolean)
  } catch (error) {
    console.error('Trending for You note parse failed:', error)
    return []
  }
}

async function fetchPexelsImage(query: string): Promise<string | null> {
  try {
    const polishedQuery = `${query} full body outfit shoes visible minimal editorial lookbook`
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(polishedQuery)}&orientation=portrait&per_page=30`, {
      headers: {
        Authorization: process.env.PEXELS_API_KEY || '',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    const lightest = pickLightestPhoto(data.photos || [])
    return lightest?.src?.large2x || lightest?.src?.large || null
  } catch (e) {
    console.error('Pexels error:', e)
    return null
  }
}

function colorBrightness(color?: string) {
  const hex = color?.replace('#', '')
  if (!hex || hex.length !== 6) return 0
  const red = parseInt(hex.slice(0, 2), 16)
  const green = parseInt(hex.slice(2, 4), 16)
  const blue = parseInt(hex.slice(4, 6), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114
}

function pickLightestPhoto(photos: any[]) {
  const positiveWords = ['fashion', 'outfit', 'style', 'clothing', 'model', 'lookbook', 'street']
  const rejectWords = ['close up', 'close-up', 'portrait', 'face', 'headshot', 'makeup', 'hand', 'logo']

  return photos
    .filter((photo) => photo?.width >= 800 && photo?.height >= 1000)
    .filter((photo) => photo.height > photo.width * 1.1)
    .filter((photo) => !photo.photographer?.toLowerCase().includes('screenshot'))
    .filter((photo) => {
      const alt = String(photo.alt || '').toLowerCase()
      return !rejectWords.some((word) => alt.includes(word))
    })
    .sort((a, b) => {
      const score = (photo: any) => {
        const alt = String(photo.alt || '').toLowerCase()
        const brightness = colorBrightness(photo.avg_color)
        const positive = positiveWords.filter((word) => alt.includes(word)).length * 35
        const portraitRatio = Math.min(80, (photo.height / Math.max(photo.width, 1)) * 28)
        return brightness + positive + portraitRatio
      }

      return score(b) - score(a)
    })[0]
}

async function generatePexelsHeroQuery(keyword: string, editorialName: string) {
  const prompt = `For the fashion trend '${keyword}' with editorial name '${editorialName}', write ONE Pexels search query.

Rules:
- Must show a FULL BODY outfit photo, head to toe
- Must clearly show the ${keyword} garment as the main focus
- Person must be wearing the trend visibly
- Shoes/footwear must be visible
- Clean, well-lit, minimal editorial feel
- Background: simple, uncluttered
- No close-ups, no cropped torso, no face-only portraits
- Use words like full body, outfit, lookbook, street style, shoes visible

Specific examples:
mini → 'woman wearing mini skirt full body outfit shoes visible street style'
cargo → 'woman cargo pants wide leg full body outfit shoes visible lookbook'
linen → 'woman linen outfit full body shoes visible summer minimal'
maxi → 'woman maxi dress full length outfit shoes visible elegant'
oversized → 'woman oversized blazer outfit full body shoes visible street style'

Return only the search query string.`

  const response = await callGemini(prompt)
  return response.replace(/^["']|["']$/g, '').trim() || `woman wearing ${keyword} full body outfit shoes visible minimal lookbook`
}

async function generateTrendData(keyword: string) {
  const prompt = `For the fashion trend keyword "${keyword}", generate a JSON response with this exact structure:
{
  "editorialName": "punchy editorial trend name, max 3 words, e.g. 'Sheer Layering', 'Soft Tailoring', 'Utility Mood'",
  "oneLiner": "one sentence describing this trend as it looks right now on real people. Warm, specific, not generic.",
  "howToWear": ["3 specific styling directions, each max 12 words"],
  "shopSearchTerms": ["4 specific search terms to find this trend on shopping sites"]
}

Return ONLY the JSON, no markdown, no explanation.`

  const response = await callGemini(prompt)
  try {
    return JSON.parse(response)
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) {
      logSupabaseFallback()
      return NextResponse.json(fallbackOverviewData())
    }

    const data = await supabaseCache('trends-overview-data:in', supabaseCacheTtl('historical_trend_data'), async () => {
      const multiRegionData = await getMultiRegionTrendOverview()
      if (multiRegionData?.trendingTrends?.length || multiRegionData?.cycleTrends?.length) {
        return multiRegionData
      }

      const latestDate = (await getLatestTrendMonth(supabase, 'IN')) || '2026-04-01'
      const trendingData = await getTopTrendingKeywords('IN', 6)

      // Generate trend data with Gemini
      const trendingTrends = await Promise.all(
        (trendingData || []).map(async (trend) => {
        const keyword = trend.keyword
        const velocity = trendVelocityLabel(trend.score, trend.comparisonScore)

        const geminiData = await generateTrendData(keyword)

        // Fetch Pexels image - use Gemini query if available, otherwise use keyword
        let pexelsImage = null
        const editorialName = geminiData?.editorialName || keyword
        const pexelsQuery = await generatePexelsHeroQuery(keyword, editorialName)
        pexelsImage = await fetchPexelsImage(pexelsQuery)

        // Get top 2 markets for this keyword
        const { data: marketData, error: marketError } = await supabase
          .from('historical_trend_data')
          .select('market, google_score')
          .eq('keyword_id', trend.keywordId)
          .eq('month', latestDate)
          .order('google_score', { ascending: false })
          .limit(2)
        if (marketError) throw marketError

        const topMarkets = (marketData || []).map((m: any) => ({
          code: m.market,
          market: MARKET_META[m.market]?.market || m.market,
        }))

        // Get 24 month trend data
        const { data: trendHistory, error: trendHistoryError } = await supabase
          .from('historical_trend_data')
          .select('month, google_score')
          .eq('keyword_id', trend.keywordId)
          .eq('market', 'IN')
          .order('month', { ascending: true })
          .limit(24)
        if (trendHistoryError) throw trendHistoryError

        return {
          id: trend.keywordId,
          keyword,
          editorialName,
          oneLiner: geminiData?.oneLiner || 'A trend worth watching',
          howToWear: geminiData?.howToWear || ['Style it casually', 'Mix with basics', 'Add accessories'],
          shopSearchTerms: geminiData?.shopSearchTerms || [keyword],
          pexelsImageUrl: pexelsImage,
          velocity,
          topMarkets,
          trendData: trendHistory?.map((t: any) => ({ month: t.month, value: t.google_score })) || [],
        }
        })
      )

      // Fetch top 50 IN trends for The Cycle. This is capped and cached for egress control.
      const allTrendsData = await getTopTrendingKeywords('IN', 50)
      const cycleRankedTrends = [...(allTrendsData || [])].sort((a, b) => b.velocity - a.velocity || b.score - a.score)

      const cycleTrends = cycleRankedTrends.map((trend, index) => {
      const keyword = trend.keyword
      const velocity = cycleVelocityLabel(index, cycleRankedTrends.length)

      return {
        id: trend.keywordId,
        keyword,
        editorialName: keyword,
        oneLiner: '',
        howToWear: [],
        shopSearchTerms: [],
        pexelsImageUrl: null,
        velocity,
        topMarkets: [],
        trendData: [],
      }
    })

      return {
        trendingTrends: trendingTrends.length ? trendingTrends : fallbackOverviewData().trendingTrends,
        cycleTrends: cycleTrends.length ? cycleTrends : fallbackOverviewData().cycleTrends,
      }
    })

    const enrichedData = {
      ...data,
      trendingTrends: await attachGeneratedTrendImages(data.trendingTrends || []),
      cycleTrends: await attachGeneratedTrendImages(data.cycleTrends || []),
    }

    const profile = await getSavedUserStyleProfile(supabase)
    const trendingForYou = profile ? await generatePersonalizedTrendNotes(profile, enrichedData.trendingTrends || []) : []

    return NextResponse.json({
      ...enrichedData,
      trendingForYou,
    })
  } catch (error) {
    console.error('Error fetching overview data:', error)
    logSupabaseFallback(error)
    return NextResponse.json(fallbackOverviewData())
  }
}
