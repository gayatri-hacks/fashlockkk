import { NextResponse } from 'next/server'
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from '@/lib/supabase'

export const revalidate = 3600

const MARKET_META: Record<string, { flag: string; name: string }> = {
  US: { flag: '🇺🇸', name: 'USA' },
  GB: { flag: '🇬🇧', name: 'UK' },
  FR: { flag: '🇫🇷', name: 'France' },
  IT: { flag: '🇮🇹', name: 'Italy' },
  JP: { flag: '🇯🇵', name: 'Japan' },
  KR: { flag: '🇰🇷', name: 'Korea' },
  SG: { flag: '🇸🇬', name: 'Singapore' },
  AU: { flag: '🇦🇺', name: 'Australia' },
  DE: { flag: '🇩🇪', name: 'Germany' },
  AE: { flag: '🇦🇪', name: 'UAE' },
  BR: { flag: '🇧🇷', name: 'Brazil' },
  IN: { flag: '🇮🇳', name: 'India' },
}

function fallbackTrends() {
  return [
    {
      key: 'linen',
      label: 'linen',
      category: 'fabric',
      indiaScore: 74,
      insight: 'linen is mainstream in India right now — score 74.',
      markets: [
        { code: 'IN', flag: '🇮🇳', name: 'India', score: 74, lagMonths: null, isIndia: true, isOrigin: false },
        { code: 'FR', flag: '🇫🇷', name: 'France', score: 62, lagMonths: 2, isIndia: false, isOrigin: true },
      ],
    },
    {
      key: 'cargo',
      label: 'cargo',
      category: 'utility',
      indiaScore: 68,
      insight: 'cargo is building in India, led by cleaner utility dressing.',
      markets: [
        { code: 'IN', flag: '🇮🇳', name: 'India', score: 68, lagMonths: null, isIndia: true, isOrigin: false },
        { code: 'KR', flag: '🇰🇷', name: 'Korea', score: 71, lagMonths: 1, isIndia: false, isOrigin: true },
      ],
    },
  ]
}

export async function GET() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    logSupabaseFallback()
    return NextResponse.json({ trends: fallbackTrends() })
  }

  try {
    const trends = await supabaseCache('trend-wave', supabaseCacheTtl('historical_trend_data'), async () => {
      // Step 1 — get the top trending keywords for India right now
      const { data: indiaKeywords, error: indiaError } = await supabase
        .from('historical_trend_data')
        .select('keyword_id, google_score')
        .eq('market', 'IN')
        .eq('month', '2026-04-01')
        .order('google_score', { ascending: false })
        .limit(6)
      if (indiaError) throw indiaError

      if (!indiaKeywords?.length) return fallbackTrends()

      const kwIds = indiaKeywords.map(r => r.keyword_id)

      // Step 2 — get keyword names
      const { data: kwNames, error: kwError } = await supabase
        .from('trend_keywords')
        .select('id, keyword, category')
        .in('id', kwIds)
        .limit(6)
      if (kwError) throw kwError

      const kwMap = Object.fromEntries((kwNames ?? []).map(k => [k.id, k]))

      // Step 3 — for each keyword, get scores across all markets (latest month)
      const { data: allScores, error: scoresError } = await supabase
        .from('historical_trend_data')
        .select('keyword_id, market, google_score, month')
        .in('keyword_id', kwIds)
        .eq('month', '2026-04-01')
        .limit(100)
      if (scoresError) throw scoresError

      // Step 4 — get lag data for these keywords
      const kwStrings = kwIds.map(id => kwMap[id]?.keyword).filter(Boolean)
      const { data: lagData, error: lagError } = await supabase
        .from('market_lag_analysis')
        .select('keyword, market, lag_months, correlation, confidence')
        .in('keyword', kwStrings)
        .eq('confidence', 'high')
        .limit(100)
      if (lagError) throw lagError

      // Build a lag lookup: keyword -> market -> lag_months
      const lagLookup: Record<string, Record<string, number>> = {}
      for (const row of lagData ?? []) {
        if (!lagLookup[row.keyword]) lagLookup[row.keyword] = {}
        lagLookup[row.keyword][row.market] = row.lag_months
      }

      // Build scores lookup: keyword_id -> market -> score
      const scoreLookup: Record<number, Record<string, number>> = {}
      for (const row of allScores ?? []) {
        if (!scoreLookup[row.keyword_id]) scoreLookup[row.keyword_id] = {}
        scoreLookup[row.keyword_id][row.market] = row.google_score
      }

      // Assemble trends
      const result = kwIds.map(kwId => {
    const kw = kwMap[kwId]
    if (!kw) return null

    const scores = scoreLookup[kwId] ?? {}
    const lags = lagLookup[kw.keyword] ?? {}

    // Build market list — all markets that have a score for this keyword
    const markets = Object.entries(scores)
      .filter(([code]) => MARKET_META[code])
      .map(([code, score]) => ({
        code,
        flag: MARKET_META[code].flag,
        name: MARKET_META[code].name,
        score: Math.round(score * 10) / 10,
        lagMonths: lags[code] ?? null,
        isIndia: code === 'IN',
        isOrigin: false,
      }))
      .sort((a, b) => b.score - a.score)

    // Mark origin — highest scoring non-India market
    const nonIndia = markets.filter(m => !m.isIndia)
    if (nonIndia[0]) nonIndia[0].isOrigin = true

    const indiaScore = scores['IN'] ?? 0
    const topScore = nonIndia[0]?.score ?? 100

    // Insight
    let insight = ''
    if (indiaScore >= 70) insight = `${kw.keyword} is mainstream in India right now — score ${Math.round(indiaScore)}.`
    else if (indiaScore >= 40) insight = `${kw.keyword} is building in India (score ${Math.round(indiaScore)}), leading in ${nonIndia[0]?.name ?? 'global markets'} at ${Math.round(topScore)}.`
    else insight = `${kw.keyword} peaked at ${Math.round(topScore)} in ${nonIndia[0]?.name ?? 'global markets'}. India is at ${Math.round(indiaScore)} — still early stage.`

    return {
      key: kw.keyword,
      label: kw.keyword,
      category: kw.category,
      indiaScore: Math.round(indiaScore * 10) / 10,
      insight,
      markets,
    }
      }).filter(Boolean)

      return result.length ? result : fallbackTrends()
    })

    return NextResponse.json({ trends })
  } catch (error) {
    logSupabaseFallback(error)
    return NextResponse.json({ trends: fallbackTrends() })
  }
}
