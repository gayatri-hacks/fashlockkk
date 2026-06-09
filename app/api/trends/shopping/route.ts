import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'
export const revalidate = 10800

const GEMINI_MODEL = 'gemini-2.5-flash'

type Gender = 'women' | 'men'

type GeminiPiece = {
  piece: string
  searchQuery: string
  forGender: 'both' | 'women' | 'men'
}

function cleanJson(text: string) {
  return text.replace(/```json|```/g, '').trim()
}

function fallbackPieces(keyword: string, gender: Gender): GeminiPiece[] {
  if (gender === 'men') {
    return [
      { piece: `${keyword} shirt`, searchQuery: `${keyword} shirt men`, forGender: 'men' },
      { piece: 'Relaxed trousers', searchQuery: 'relaxed trousers men', forGender: 'men' },
      { piece: 'Minimal sneakers', searchQuery: 'minimal sneakers men', forGender: 'men' },
    ]
  }

  return [
    { piece: `${keyword} top`, searchQuery: `${keyword} top women`, forGender: 'women' },
    { piece: 'Tailored trousers', searchQuery: 'tailored trousers women', forGender: 'women' },
    { piece: 'Shoulder bag', searchQuery: 'small shoulder bag', forGender: 'both' },
  ]
}

async function callGeminiPieces(keyword: string, gender: Gender): Promise<GeminiPiece[]> {
  const prompt =
    gender === 'men'
      ? `For the fashion trend '${keyword}', list 3-4 specific clothing pieces for men that reflect this trend right now.
IMPORTANT: Interpret this trend for men in a fashion-forward, stylish way.
Do not suggest sportswear, activewear, or literal interpretations.

For 'mini/micro mini' for men: think above-the-knee tailored shorts, not swim shorts.
For 'cargo' for men: think slim cargo trousers, not tactical/military gear.
For 'linen' for men: think linen shirts and trousers, relaxed elegant.
For 'maxi' for men: think wide leg trousers, longline coats.

Always suggest pieces a stylish fashion-conscious man would actually wear in 2026. Think GQ, not Decathlon.

Return JSON array of objects:
[{
  "piece": "specific garment name",
  "searchQuery": "exact search term to find this on a shopping site",
  "forGender": "men"
}]
Return only valid JSON.`
      : `For the fashion trend '${keyword}', list 3-4 specific clothing/accessory pieces that make up the core look right now.
Return JSON array of objects:
[{
  piece: 'specific garment name',
  searchQuery: 'exact search term to find this on a shopping site',
  forGender: 'both' or 'women' or 'men'
}]
Example for 'mini':
[
  {piece: 'Mini skirt', 
   searchQuery: 'mini skirt', 
   forGender: 'women'},
  {piece: 'Fitted tank top', 
   searchQuery: 'fitted tank top women', 
   forGender: 'women'},
  {piece: 'Strappy sandals', 
   searchQuery: 'strappy sandals', 
   forGender: 'both'},
  {piece: 'Shoulder bag', 
   searchQuery: 'small shoulder bag', 
   forGender: 'both'}
]`

  try {
    const key = process.env.GEMINI_API_KEY
    if (!key) return fallbackPieces(keyword, gender)

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
          generationConfig: { temperature: 0.65, responseMimeType: 'application/json' },
        }),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini error:', response.status, err)
      return fallbackPieces(keyword, gender)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    const parsed = text ? JSON.parse(cleanJson(text)) : null

    if (!Array.isArray(parsed)) return fallbackPieces(keyword, gender)

    return parsed
      .filter((piece: any) => piece?.piece && piece?.searchQuery)
      .slice(0, 4)
      .map((piece: any) => ({
        piece: String(piece.piece),
        searchQuery: String(piece.searchQuery),
        forGender: piece.forGender === 'men' || piece.forGender === 'women' || piece.forGender === 'both' ? piece.forGender : gender,
      }))
  } catch (error) {
    console.error('Gemini shopping pieces error:', error)
    return fallbackPieces(keyword, gender)
  }
}

async function serperShopping(searchQuery: string) {
  const key = process.env.SERPER_API_KEY
  if (!key) return null

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': key,
      },
      body: JSON.stringify({
        q: searchQuery,
        gl: 'in',
        hl: 'en',
        tbm: 'shop',
      }),
      next: { revalidate: 10800 },
    })

    if (!response.ok) {
      console.error('Serper failed:', response.status, await response.text())
      return null
    }

    const data = await response.json()
    const results = data.shopping || data.shoppingResults || data.organic || []
    let product = results.find((result: any) => result.imageUrl || result.image || result.thumbnail)

    if (!product) {
      const shoppingResponse = await fetch('https://google.serper.dev/shopping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': key,
        },
        body: JSON.stringify({
          q: searchQuery,
          gl: 'in',
          hl: 'en',
        }),
        next: { revalidate: 10800 },
      })

      if (!shoppingResponse.ok) {
        console.error('Serper failed:', shoppingResponse.status, await shoppingResponse.text())
        return null
      }

      const shoppingData = await shoppingResponse.json()
      product = (shoppingData.shopping || shoppingData.shoppingResults || []).find(
        (result: any) => result.imageUrl || result.image || result.thumbnail
      )
    }

    if (!product) return null

    return {
      imageUrl: product.imageUrl || product.image || product.thumbnail,
      price: String(product.price || product.extracted_price || ''),
      retailer: product.source || product.seller || product.merchant || product.title?.split('-')?.pop()?.trim() || 'Shop',
      url: product.link || product.productLink || product.url,
    }
  } catch (error) {
    console.error('Serper shopping error:', error)
    return null
  }
}

async function getShoppingPieces(keyword: string, gender: Gender) {
  const pieces = await callGeminiPieces(keyword, gender)
  const results = await Promise.all(
    pieces.map(async (piece) => {
      const product = await serperShopping(piece.searchQuery)
      if (!product?.imageUrl || !product.url) return null

      return {
        piece: piece.piece,
        searchQuery: piece.searchQuery,
        forGender: piece.forGender,
        imageUrl: product.imageUrl,
        price: product.price,
        retailer: product.retailer,
        url: product.url,
      }
    })
  )

  return results.filter(Boolean)
}

const cachedShoppingPieces = unstable_cache(getShoppingPieces, ['trends-shopping-v3'], {
  revalidate: 10800,
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get('keyword')?.trim()
  const gender = searchParams.get('gender') === 'men' ? 'men' : 'women'

  if (!keyword) {
    return NextResponse.json({ pieces: [] }, { status: 400 })
  }

  try {
    const pieces = await cachedShoppingPieces(keyword.toLowerCase(), gender)
    return NextResponse.json({ pieces, gender })
  } catch (error) {
    console.error('Trend shopping route error:', error)
    return NextResponse.json({ pieces: [] }, { status: 500 })
  }
}
