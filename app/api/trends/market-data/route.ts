import { NextResponse } from 'next/server'
import { getSupabaseClient, logSupabaseFallback, supabaseCache, supabaseCacheTtl } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 21600 // 6 hour cache

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

function fallbackMarkets() {
  return [
    { market: 'India', code: 'IN', value: 72 },
    { market: 'France', code: 'FR', value: 61 },
    { market: 'Korea', code: 'KR', value: 58 },
  ]
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')

    if (!keyword) {
      return NextResponse.json({ markets: [] })
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      logSupabaseFallback()
      return NextResponse.json({ markets: fallbackMarkets() })
    }

    const markets = await supabaseCache(`trends-market-data:${keyword}`, supabaseCacheTtl('historical_trend_data'), async () => {
      const latestDate = await getLatestDate(supabase)

      // Get keyword ID
      const { data: keywordData, error: keywordError } = await supabase.from('trend_keywords').select('id').eq('keyword', keyword).single()
      if (keywordError) throw keywordError

      if (!keywordData) return fallbackMarkets()

      // Get current values across markets. One row per market, capped defensively.
      const { data: marketData, error: marketError } = await supabase
        .from('historical_trend_data')
        .select('market, google_score')
        .eq('keyword_id', keywordData.id)
        .eq('month', latestDate)
        .order('google_score', { ascending: false })
        .limit(100)
      if (marketError) throw marketError

      const rows = (marketData || []).map((m: any) => ({
        market: MARKET_META[m.market]?.market || m.market,
        code: m.market,
        value: m.google_score,
      }))

      return rows.length ? rows : fallbackMarkets()
    })

    return NextResponse.json({ markets })
  } catch (error) {
    console.error('Error fetching market data:', error)
    logSupabaseFallback(error)
    return NextResponse.json({ markets: fallbackMarkets() })
  }
}
