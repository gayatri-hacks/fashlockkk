import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const KEY = process.env.NEWSDATA_API_KEY

const HISTORY_SIGNALS = [
  'history', 'heritage', 'vintage', 'archive', 'decade', 'century', 'traditional',
  'artisan', 'craft', 'roots', 'origin', 'legacy', 'iconic', 'classic',
]

const FASHION_KEYWORDS = [
  'fashion', 'style', 'runway', 'vogue', 'elle', 'cannes', 'gala', 'designer', 'collection',
  'outfit', 'wear', 'dress', 'couture', 'trend', 'saree', 'lehenga', 'luxury', 'boutique',
  'streetwear', 'accessory', 'styling', 'lookbook', 'capsule', 'wardrobe', 'textile', 'artisan',
  'sustainable', 'heritage', 'tailoring', 'embroidery', 'fabric', 'brand', 'apparel',
  'model', 'campaign', 'fashion week', 'vintage', 'kimono', 'ethnic', 'cultural',
]

const BLOCK_KEYWORDS = [
  'stock', 'earnings', 'investing', 'crypto', 'bitcoin', 'nft', 'sports', 'cricket',
  'football', 'real estate', 'property', 'coupon', 'discount code', 'share price',
]

// One query per country — 1 API credit each, runs every 6 hours
const FETCH_PLAN: { country: string; query: string }[] = [
  { country: 'WORLD', query: 'fashion week runway collection 2026' },
  { country: 'WORLD', query: 'vogue elle fashion style trend 2026' },
  { country: 'WORLD', query: 'fashion history heritage vintage artisan textile' },
  { country: 'IN',    query: 'india fashion designer saree lehenga style 2026' },
  { country: 'US',    query: 'american fashion new york style streetwear 2026' },
  { country: 'GB',    query: 'london fashion week british style 2026' },
  { country: 'FR',    query: 'paris fashion week haute couture 2026' },
  { country: 'IT',    query: 'milan fashion week italian designer 2026' },
  { country: 'JP',    query: 'tokyo fashion week japanese style 2026' },
  { country: 'KR',    query: 'seoul fashion week kfashion streetwear 2026' },
]

function detectType(title: string, summary: string): 'news' | 'history' {
  const text = (title + ' ' + summary).toLowerCase()
  return HISTORY_SIGNALS.some(k => text.includes(k)) ? 'history' : 'news'
}

async function fetchAndStore(country: string, query: string) {
  try {
    const res = await fetch(
      `https://newsdata.io/api/1/news?apikey=${KEY}&q=${encodeURIComponent(query)}&language=en`,
      { cache: 'no-store' }
    )
    const data = await res.json()

    if (data.status === 'error') {
      console.error(`newsdata error for ${country}:`, data.results?.message)
      return 0
    }

    const articles = (data.results ?? [])
      .filter((item: any) => {
        if (!item.title || !item.image_url) return false
        const text = (item.title + ' ' + (item.description ?? '')).toLowerCase()
        const hasFashion = FASHION_KEYWORDS.some(k => text.includes(k))
        const isBlocked = BLOCK_KEYWORDS.some(k => text.includes(k))
        return hasFashion && !isBlocked
      })
      .map((item: any) => ({
        source:     item.source_id ?? 'Fashion',
        title:      item.title,
        link:       item.link,
        date:       item.pubDate ?? new Date().toISOString(),
        image:      item.image_url,
        summary:    item.description?.slice(0, 160) ?? '',
        type:       detectType(item.title, item.description ?? ''),
        country,
        fetched_at: new Date().toISOString(),
      }))

    if (articles.length === 0) return 0

    // Upsert — skip duplicates by link
    const { error } = await supabase
      .from('news_articles')
      .upsert(articles, { onConflict: 'link', ignoreDuplicates: true })

    if (error) console.error(`supabase upsert error for ${country}:`, error.message)
    return articles.length
  } catch (e) {
    console.error(`fetch error for ${country} "${query}":`, e)
    return 0
  }
}

async function pruneOldArticles() {
  // Keep only last 7 days of articles so table stays lean
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  await supabase
    .from('news_articles')
    .delete()
    .lt('fetched_at', cutoff.toISOString())
}

export async function GET(req: Request) {
  // Optional: protect with a secret so only you can trigger it manually
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('Starting news refresh cron...')
  const results: Record<string, number> = {}

  // Run sequentially to avoid rate limiting newsdata.io
  for (const { country, query } of FETCH_PLAN) {
    const count = await fetchAndStore(country, query)
    results[`${country}:${query.slice(0, 30)}`] = count
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500))
  }

  await pruneOldArticles()

  console.log('News refresh complete:', results)
  return NextResponse.json({ ok: true, results, fetchedAt: new Date().toISOString() })
}
