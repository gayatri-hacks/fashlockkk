import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 3600

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// Keywords to search in Supabase for each story
const SLUG_KEYWORDS: Record<string, string[]> = {
  'pochampally-weavers':  ['pochampally', 'ikat', 'handloom', 'weaving', 'telangana'],
  'zardozi-gold-threads': ['zardozi', 'embroidery', 'lucknow', 'mughal', 'craft'],
  'gen-z-saree':          ['saree', 'sari', 'india', 'youth', 'modern'],
  'boro-patching':        ['boro', 'japanese', 'textile', 'sashiko', 'japan'],
  'harajuku-today':       ['harajuku', 'tokyo', 'japan', 'streetwear', 'street'],
  'hanbok-modern':        ['hanbok', 'korean', 'korea', 'heritage', 'traditional'],
  'seoul-streetwear':     ['seoul', 'korea', 'streetwear', 'kfashion', 'kpop'],
  'italian-tailoring':    ['naples', 'italy', 'italian', 'tailoring', 'bespoke'],
  'french-effortless':    ['paris', 'france', 'french', 'parisian', 'chic'],
  'ankara-global':        ['ankara', 'african', 'nigeria', 'lagos', 'wax'],
  'brazil-beach-fashion': ['brazil', 'sao paulo', 'brazilian', 'beach', 'carnival'],
  'savile-row-future':    ['savile', 'london', 'british', 'bespoke', 'tailoring'],
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('slug') ?? ''
  const keywords = SLUG_KEYWORDS[slug]

  if (!keywords) return NextResponse.json({ articles: [] })

  try {
    const supabase = getSupabase()
    if (!supabase) return NextResponse.json({ articles: [] })

    // Search Supabase for articles matching any keyword in title or summary
    // Use ilike for case-insensitive matching on the first keyword as primary filter
    const orConditions = keywords
      .map(k => `title.ilike.%${k}%,summary.ilike.%${k}%`)
      .join(',')

    const { data, error } = await supabase
      .from('news_articles')
      .select('source, title, link, date, image, summary')
      .or(orConditions)
      .order('fetched_at', { ascending: false })
      .limit(5)

    if (error) throw error

    return NextResponse.json({ articles: data ?? [] })
  } catch (e) {
    console.error('story-articles error:', e)
    return NextResponse.json({ articles: [] })
  }
}
