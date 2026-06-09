import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'
export const revalidate = 86400

const IMAGEN_MODEL = 'imagen-4.0-generate-001'
const VALIDATION_MODEL = 'gemini-2.5-flash'

type Gender = 'women' | 'men'

function cleanJson(text: string) {
  return text.replace(/```json|```/g, '').trim()
}

async function validateOutfitImage(base64Image: string, mimeType: string, formula: string, gender: Gender) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return false

  const expectedModel = gender === 'women' ? 'woman' : 'man'
  const prompt = `You are validating an AI-generated fashion lookbook image before it appears in a fashion app.

Expected image:
- One adult ${expectedModel}
- Photorealistic modern ecommerce/lookbook photo
- Full body visible head-to-toe, including shoes/feet
- Clean studio or simple background
- Outfit visibly matches this formula: "${formula}"

Reject if:
- Wrong gender
- Headshot, portrait, cropped body, missing shoes/feet
- Illustration, drawing, poster, costume, cosplay, fantasy, historical outfit
- Extra props, text, URLs, labels, borders, watermarks
- Outfit does not clearly match the formula

Return JSON only:
{"pass": true/false, "reason": "short reason"}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${VALIDATION_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      }
    )

    if (!response.ok) {
      console.error('Outfit validation error:', response.status, await response.text())
      return false
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const result = JSON.parse(cleanJson(text)) as { pass?: boolean; reason?: string }
    if (!result.pass) console.log('Rejected generated outfit:', result.reason || 'No reason')
    return result.pass === true
  } catch (error) {
    console.error('Outfit validation failed:', error)
    return false
  }
}

async function generateOutfitImage(formula: string, occasion: string, gender: Gender) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const modelDescription = gender === 'women' ? 'adult woman fashion model' : 'adult man fashion model'
  const imagePrompt = `Photorealistic fashion ecommerce lookbook photograph.
Modern 2026 minimal studio styling, like COS, Zara, Mango, or Massimo Dutti.
Clean cream or white seamless studio background.
One ${modelDescription} only, standing naturally.
The model is wearing exactly this outfit: ${formula}.
Occasion styling: ${occasion}.
Full length full body shot, head to toe visible.
Shoes and feet must be completely visible.
Leave clear space above the head and below the shoes.
Camera is far enough away to include the entire outfit.
Do not crop the body, legs, ankles, shoes, or feet.
No illustration, no drawing, no cartoon, no painting, no fantasy costume.
No historical costume, no medieval clothing, no cosplay, no props, no flowers.
No text, no URLs, no labels, no borders, no frames, no watermarks.
Single person, contemporary fashion, soft natural lighting, minimal aesthetic.`

  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify({
            instances: [
              {
                prompt:
                  attempt === 1
                    ? imagePrompt
                    : `${imagePrompt}
Second attempt: the previous image failed validation. Be literal. Match the exact garments and footwear in the outfit formula. No headshots.`,
              },
            ],
            parameters: {
              sampleCount: 1,
              aspectRatio: '3:4',
              personGeneration: 'allow_adult',
            },
          }),
        }
      )

      if (!response.ok) {
        console.error('Imagen outfit error:', response.status, await response.text())
        return null
      }

      const data = await response.json()
      const base64Image = data.predictions?.[0]?.bytesBase64Encoded
      if (!base64Image) continue

      const mimeType = data.predictions?.[0]?.mimeType || 'image/png'
      const isValid = await validateOutfitImage(base64Image, mimeType, formula, gender)
      if (isValid) return `data:${mimeType};base64,${base64Image}`
    }

    return null
  } catch (error) {
    console.error('Imagen outfit generation failed:', error)
    return null
  }
}

const cachedGenerateOutfitImage = unstable_cache(generateOutfitImage, ['trends-generated-outfit-v8-validated-retry'], {
  revalidate: 86400,
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const formula = typeof body.formula === 'string' ? body.formula.trim() : ''
    const occasion = typeof body.occasion === 'string' ? body.occasion.trim() : ''
    const gender = body.gender === 'men' ? 'men' : 'women'

    if (!formula || !occasion) {
      return NextResponse.json({ imageUrl: null }, { status: 400 })
    }

    const imageUrl = await cachedGenerateOutfitImage(formula, occasion, gender)
    return NextResponse.json({ imageUrl })
  } catch (error) {
    console.error('Generate outfit route error:', error)
    return NextResponse.json({ imageUrl: null })
  }
}
