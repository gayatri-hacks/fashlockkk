import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 10800 // 3 hour cache
const GEMINI_MODEL = 'gemini-2.5-flash'

function colorBrightness(color?: string) {
  const hex = color?.replace('#', '')
  if (!hex || hex.length !== 6) return 0
  const red = parseInt(hex.slice(0, 2), 16)
  const green = parseInt(hex.slice(2, 4), 16)
  const blue = parseInt(hex.slice(4, 6), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114
}

async function generateHeroPexelsQuery(keyword: string, editorialName: string): Promise<string> {
  try {
    const prompt = `For the fashion trend '${keyword}' with editorial name '${editorialName}', write ONE Pexels search query.

Rules:
- Must show a FULL BODY outfit photo
- Must clearly show the ${keyword} garment as the main focus
- Person must be wearing the trend visibly
- Clean, well-lit, editorial feel
- Background: simple, uncluttered

Specific examples:
mini → 'woman wearing mini skirt full body outfit street style'
cargo → 'woman cargo pants wide leg full outfit lookbook'
linen → 'woman linen outfit full body summer minimal'
maxi → 'woman maxi dress full length outfit elegant'
oversized → 'woman oversized blazer outfit full body street style'

Return only the query string.`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY || '',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini error:', response.status, err)
      return `woman wearing ${keyword} full body outfit street style`
    }

    const data = await response.json()
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text
        ?.replace(/^["']|["']$/g, '')
        ?.trim() || `woman wearing ${keyword} full body outfit street style`
    )
  } catch (error) {
    console.error('Gemini hero query error:', error)
    return `woman wearing ${keyword} full body outfit street style`
  }
}

async function generatePexelsQueries(keyword: string): Promise<string[]> {
  try {
    const prompt = `For the fashion trend '${keyword}', write 3 Pexels search queries that return clean, minimal, premium outfit photos.

CRITICAL: ALWAYS include ONE of these in every query:
'clean background' OR 'studio' OR 'minimal' OR 'white background' OR 'neutral background'

Style guide:
- Person should be well-dressed, focused on the outfit
- Background must be simple and undistracting
- Think premium lookbook or H&M campaign, NOT street photography
- Show full or half body with outfit as clear focus
- Light, airy, professional aesthetic

NEVER use these words:
- street, grunge, urban, city, graffiti, dark, alley, gritty, bohemian, vintage

GOOD EXAMPLES:
'${keyword} outfit woman studio white background elegant'
'woman wearing ${keyword} lookbook minimal background fashion'
'${keyword} style woman clean background professional lookbook'

Return ONLY a JSON array of 3 query strings. Example:
["${keyword} outfit woman studio white background", "woman ${keyword} style minimal background lookbook", "elegant ${keyword} outfit clean background professional"]

Now generate 3 queries for '${keyword}':`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY || '',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini error:', response.status, err)
      // Fallback queries with clean, minimal style
      return [
        `${keyword} outfit woman studio white background elegant`,
        `woman wearing ${keyword} minimal background lookbook fashion`,
        `${keyword} style clean background professional fashion lookbook`,
      ]
    }

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      try {
        const queries = JSON.parse(jsonMatch[0])
        return Array.isArray(queries) && queries.length >= 3 ? queries.slice(0, 3) : [
          `${keyword} outfit woman studio white background elegant`,
          `woman wearing ${keyword} minimal background lookbook fashion`,
          `${keyword} style clean background professional fashion lookbook`,
        ]
      } catch (e) {
        console.error('Failed to parse Gemini JSON:', e)
        return [
          `${keyword} outfit woman studio white background elegant`,
          `woman wearing ${keyword} minimal background lookbook fashion`,
          `${keyword} style clean background professional fashion lookbook`,
        ]
      }
    }

    // Fallback if no JSON found
    return [
      `${keyword} outfit woman studio white background elegant`,
      `woman wearing ${keyword} minimal background lookbook fashion`,
      `${keyword} style clean background professional fashion lookbook`,
    ]
  } catch (e) {
    console.error('Gemini query generation fetch error:', e)
    // Return fallback queries
    return [
      `${keyword} outfit woman studio white background elegant`,
      `woman wearing ${keyword} minimal background lookbook fashion`,
      `${keyword} style clean background professional fashion lookbook`,
    ]
  }
}

function sortFashionFirst(a: any, b: any) {
  return colorBrightness(b.avg_color) - colorBrightness(a.avg_color)
}

async function fetchPexelsImages(query: string, perPage: number = 2): Promise<string[]> {
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=15`, {
      headers: {
        Authorization: process.env.PEXELS_API_KEY || '',
      },
      next: { revalidate: 10800 },
    })

    if (!res.ok) {
      console.error('Pexels error:', res.status)
      return []
    }

    const data = await res.json()
    return (
      data.photos
        ?.filter((photo: any) => {
          const isNotSquare = photo.width !== photo.height
          const isLargeEnough = photo.width >= 800
          const isNotScreenshot = !photo.photographer?.toLowerCase().includes('screenshot')
          return isNotSquare && isLargeEnough && isNotScreenshot
        })
        .sort(sortFashionFirst)
        .slice(0, perPage)
        .map((photo: any) => photo.src.large2x || photo.src.large) || []
    )
  } catch (e) {
    console.error('Pexels fetch error:', e)
    return []
  }
}

async function fetchHeroPexelsImage(query: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=15`, {
      headers: {
        Authorization: process.env.PEXELS_API_KEY || '',
      },
      next: { revalidate: 10800 },
    })

    if (!res.ok) {
      console.error('Pexels error:', res.status)
      return []
    }

    const data = await res.json()
    const photos =
      data.photos
        ?.filter((photo: any) => photo.width >= 800)
        ?.filter((photo: any) => !photo.photographer?.toLowerCase().includes('screenshot'))
        ?.filter((photo: any) => {
          const alt = String(photo.alt || '').toLowerCase()
          return !/portrait|headshot|face|beauty|makeup|close up|close-up/.test(alt)
        })
        ?.sort((a: any, b: any) => colorBrightness(b.avg_color) - colorBrightness(a.avg_color)) || []

    const photo = photos[0] || data.photos?.[0]
    return photo ? [photo.src.large2x || photo.src.large] : []
  } catch (error) {
    console.error('Pexels hero fetch error:', error)
    return []
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')
    const queryParam = searchParams.get('queries')
    const mode = searchParams.get('mode')

    if (!keyword) {
      return NextResponse.json({ images: [] })
    }

    const editorialName = searchParams.get('editorialName') || keyword

    if (mode === 'hero') {
      const query = await generateHeroPexelsQuery(keyword, editorialName)
      const images = await fetchHeroPexelsImage(query)
      return NextResponse.json({ images, queries: [query] })
    }

    let queries: string[] = []
    if (queryParam) {
      try {
        const parsed = JSON.parse(queryParam)
        if (Array.isArray(parsed)) queries = parsed.filter((query) => typeof query === 'string').slice(0, 3)
      } catch (error) {
        console.error('Failed to parse Pexels queries:', error)
      }
    }

    if (!queries.length) {
      queries = await generatePexelsQueries(keyword)
    }

    // Fetch 2 images for each query (6 total)
    const allImages: string[] = []
    for (const query of queries) {
      const images = await fetchPexelsImages(query, 2)
      allImages.push(...images)
    }

    return NextResponse.json({ images: allImages.slice(0, 6), queries })
  } catch (error) {
    console.error('Error fetching outfit images:', error)
    return NextResponse.json({ images: [] })
  }
}
