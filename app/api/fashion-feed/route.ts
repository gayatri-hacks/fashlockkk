import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 21600

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 12
const CACHE_SECONDS = 21600 // Matches the 6-hour news refresh cadence.
const STALE_SECONDS = 86400
const VALID_COUNTRIES = new Set(['WORLD', 'IN', 'US', 'GB', 'FR', 'IT', 'JP', 'KR'])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function normalizeCountry(country: string | null) {
  const normalized = (country ?? 'WORLD').trim().toUpperCase()
  return VALID_COUNTRIES.has(normalized) ? normalized : 'WORLD'
}

function normalizeLimit(limit: string | null) {
  const parsed = Number(limit ?? DEFAULT_LIMIT)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(Math.floor(parsed), MAX_LIMIT)
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return value
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value
}

function feedResponse(body: unknown) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
    },
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const country = normalizeCountry(searchParams.get('country'))
  const cursorParam = searchParams.get('page')
  const cursor  = cursorParam && cursorParam !== 'null' ? cursorParam : null
  const limit   = normalizeLimit(searchParams.get('limit'))

  try {
    // Build query — always include WORLD articles, plus country-specific if not WORLD
    let query = supabase
      .from('news_articles')
      .select('id, source, title, link, date, image, summary, type, country, fetched_at')
      .order('fetched_at', { ascending: false })

    if (country !== 'WORLD') {
      query = query.in('country', [country, 'WORLD'])
    } else {
      query = query.eq('country', 'WORLD')
    }

    // Cursor-based pagination: if we have a cursor, fetch items BEFORE that timestamp
    if (cursor) {
      query = query.lt('fetched_at', cursor)
    }

    query = query.limit(limit + 1) // fetch one extra to determine if there are more

    const { data, error } = await query

    if (error) throw error

    if (!data || data.length === 0) {
      return feedResponse({ articles: [], nextPage: null })
    }

    // Determine if there are more items
    let articles = data
    let nextPage: string | null = null
    
    if (data.length > limit) {
      articles = data.slice(0, limit)
      // Next cursor is the fetched_at of the last item
      nextPage = articles[articles.length - 1].fetched_at
    }

    const compactArticles = articles.map((article) => ({
      ...article,
      source: trimText(article.source, 80),
      title: trimText(article.title, 180),
      summary: trimText(article.summary, 240),
    }))

    return feedResponse({
      articles: compactArticles,
      nextPage,
    })
  } catch (e) {
    console.error('fashion-feed error:', e)
    return feedResponse({ articles: [], nextPage: null })
  }
}
