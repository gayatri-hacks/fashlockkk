import { NextResponse } from 'next/server'
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from '@/lib/supabase'

export const revalidate = 3600

function fallbackRegions() {
  return {
    IN: [
      { keyword: 'linen', category: 'fabric', correlation: 0.74 },
      { keyword: 'cargo', category: 'utility', correlation: 0.68 },
      { keyword: 'ballet flats', category: 'shoes', correlation: 0.61 },
    ],
    FR: [{ keyword: 'tonal dressing', category: 'styling', correlation: 0.66 }],
    KR: [{ keyword: 'layering', category: 'styling', correlation: 0.7 }],
  }
}

export async function GET() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    logSupabaseFallback()
    return NextResponse.json({ regions: fallbackRegions() })
  }

  try {
    const regions = await supabaseCache('region-trends', supabaseCacheTtl('historical_trend_data'), async () => {
      // All other markets — from market_lag_analysis
      const { data: lagData, error: lagError } = await supabase
        .from('market_lag_analysis')
        .select('market, keyword, category, correlation, confidence')
        .eq('confidence', 'high')
        .order('correlation', { ascending: false })
        .limit(100)
      if (lagError) throw lagError

      // India — top trending keywords right now from historical_trend_data
      const { data: indiaData, error: indiaError } = await supabase
        .from('historical_trend_data')
        .select('keyword_id, google_score')
        .eq('market', 'IN')
        .eq('month', '2026-04-01')
        .order('google_score', { ascending: false })
        .limit(12)
      if (indiaError) throw indiaError

      // Get keyword names for India data
      const indiaKeywordIds = (indiaData ?? []).map(r => r.keyword_id)
      const { data: kwData, error: kwError } = await supabase
        .from('trend_keywords')
        .select('id, keyword, category')
        .in('id', indiaKeywordIds)
        .limit(12)
      if (kwError) throw kwError

      const kwMap = Object.fromEntries((kwData ?? []).map(k => [k.id, k]))

      // Build India keywords array
      const indiaKeywords = (indiaData ?? [])
        .map(r => ({
          keyword: kwMap[r.keyword_id]?.keyword ?? '',
          category: kwMap[r.keyword_id]?.category ?? '',
          correlation: r.google_score / 100,
        }))
        .filter(r => r.keyword)
        .slice(0, 6)

      // Group other markets
      const regions: Record<string, any[]> = {}
      for (const row of lagData ?? []) {
        if (!regions[row.market]) regions[row.market] = []
        if (regions[row.market].length < 6) {
          regions[row.market].push({
            keyword: row.keyword,
            category: row.category,
            correlation: row.correlation,
          })
        }
      }

      // Add India
      regions.IN = indiaKeywords

      return Object.keys(regions).length ? regions : fallbackRegions()
    })

    return NextResponse.json({ regions })
  } catch (error) {
    logSupabaseFallback(error)
    return NextResponse.json({ regions: fallbackRegions() })
  }
}
