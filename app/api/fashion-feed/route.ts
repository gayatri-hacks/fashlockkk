import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const country = searchParams.get('country') ?? 'WORLD'
  const cursorParam = searchParams.get('page')
  const cursor  = cursorParam && cursorParam !== 'null' ? cursorParam : null
  const limit   = Math.min(Number(searchParams.get('limit') ?? 20), 20)

  try {
    // Build query — always include WORLD articles, plus country-specific if not WORLD
    let query = supabase
      .from('news_articles')
      .select('id, source, title, link, date, image, summary, type, country, fetched_at')
      .order('fetched_at', { ascending: false })

    if (country !== 'WORLD') {
      query = query.in('country', [country, 'WORLD'])
    }

    // Cursor-based pagination: if we have a cursor, fetch items BEFORE that timestamp
    if (cursor) {
      query = query.lt('fetched_at', cursor)
    }

    query = query.limit(limit + 1) // fetch one extra to determine if there are more

    const { data, error } = await query

    if (error) throw error

    if (!data || data.length === 0) {
      return NextResponse.json({ articles: [], nextPage: null })
    }

    // Determine if there are more items
    let articles = data
    let nextPage: string | null = null
    
    if (data.length > limit) {
      articles = data.slice(0, limit)
      // Next cursor is the fetched_at of the last item
      nextPage = articles[articles.length - 1].fetched_at
    }

    return NextResponse.json({
      articles,
      nextPage,
    })
  } catch (e) {
    console.error('fashion-feed error:', e)
    return NextResponse.json({ articles: [], nextPage: null })
  }
}
