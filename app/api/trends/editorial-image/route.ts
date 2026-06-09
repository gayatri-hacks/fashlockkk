import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'
export const revalidate = 21600

type EditorialImage = {
  imageUrl: string
  sourceUrl: string
  title: string
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function fetchEditorialImage(keyword: string, editorialName: string): Promise<EditorialImage | null> {
  const key = process.env.SERPER_API_KEY
  if (!key) return fetchPexelsFallback(keyword)

  const query = `${editorialName} outfit 2026 site:vogue.com OR site:harpersbazaar.com OR site:elle.com OR site:instyle.com OR site:vogue.in OR site:elle.in OR site:harpersbazaar.in OR site:glamour.com OR site:refinery29.com`

  try {
    const response = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': key,
      },
      body: JSON.stringify({ q: query, num: 10 }),
      next: { revalidate: 21600 },
    })

    if (!response.ok) {
      console.error('Serper failed:', response.status, await response.text())
      return null
    }

    const data = await response.json()
    const images = data.images || []
    const picked = images
      .filter((image: any) => {
      const imageUrl = String(image.imageUrl || '')
      const sourceUrl = String(image.link || image.sourceUrl || '')
      const searchableUrl = `${imageUrl} ${sourceUrl}`.toLowerCase()
      const width = Number(image.imageWidth || image.width || 0)
      const height = Number(image.imageHeight || image.height || 0)

      return (
        imageUrl &&
        width >= 400 &&
        height >= 400 &&
        width <= height * 1.3 &&
        !searchableUrl.includes('whowhatwear.com') &&
        !searchableUrl.includes('logo') &&
        !searchableUrl.includes('icon')
      )
      })
      .sort((a: any, b: any) => {
        const aWidth = Number(a.imageWidth || a.width || 0)
        const aHeight = Number(a.imageHeight || a.height || 0)
        const bWidth = Number(b.imageWidth || b.width || 0)
        const bHeight = Number(b.imageHeight || b.height || 0)
        const portraitScore = (width: number, height: number) => (height > width && width >= 400 && width <= 1200 ? 1 : 0)
        return portraitScore(bWidth, bHeight) - portraitScore(aWidth, aHeight)
      })[0]

    if (!picked) return fetchPexelsFallback(keyword)

    return {
      imageUrl: picked.imageUrl,
      sourceUrl: picked.link || picked.sourceUrl || '',
      title: picked.title || `${editorialName || keyword} outfit`,
    }
  } catch (error) {
    console.error('Serper editorial image error:', error)
    return fetchPexelsFallback(keyword)
  }
}

async function fetchPexelsFallback(keyword: string): Promise<EditorialImage | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return null

  try {
    const query = `${keyword} fashion outfit woman white background lookbook`
    const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=15`, {
      headers: { Authorization: key },
      next: { revalidate: 21600 },
    })

    if (!response.ok) {
      console.error('Pexels error:', response.status)
      return null
    }

    const data = await response.json()
    const picked = data.photos?.find((photo: any) => photo.width >= 400 && photo.height >= 400)
    if (!picked) return null

    return {
      imageUrl: picked.src?.large2x || picked.src?.large,
      sourceUrl: picked.url || 'https://www.pexels.com',
      title: picked.alt || `${keyword} fashion outfit`,
    }
  } catch (error) {
    console.error('Pexels editorial fallback error:', error)
    return null
  }
}

const cachedEditorialImage = unstable_cache(fetchEditorialImage, ['trends-editorial-image-v2'], {
  revalidate: 21600,
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get('keyword')?.trim()
  const editorialName = searchParams.get('editorialName')?.trim() || keyword

  if (!keyword) {
    return NextResponse.json({ imageUrl: null }, { status: 400 })
  }

  try {
    const image = await cachedEditorialImage(keyword.toLowerCase(), editorialName || keyword)

    return NextResponse.json({
      imageUrl: image?.imageUrl || null,
      sourceUrl: image?.sourceUrl || null,
      sourceDomain: image?.sourceUrl ? domainFromUrl(image.sourceUrl) : null,
      title: image?.title || null,
    })
  } catch (error) {
    console.error('Editorial image route error:', error)
    return NextResponse.json({ imageUrl: null }, { status: 500 })
  }
}
