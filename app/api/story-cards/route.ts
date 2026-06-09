import { NextResponse } from 'next/server'

export const revalidate = 3600

const REGIONS = [
  {
    code: 'IN', label: 'India', flag: '🇮🇳',
    context: 'India — Mughal embroidery, Banarasi silk, ikat weaving, block printing, Bollywood glamour, Gen Z saree revival, sustainable khadi, artisan crafts from Rajasthan to Tamil Nadu'
  },
  {
    code: 'JP', label: 'Japan', flag: '🇯🇵',
    context: 'Japan — kimono tradition, boro patching, indigo shibori dyeing, Harajuku subcultures, wabi-sabi aesthetics, Japanese denim obsession, workwear as art, Comme des Garçons philosophy'
  },
  {
    code: 'KR', label: 'Korea', flag: '🇰🇷',
    context: 'Korea — hanbok evolution, K-pop fashion influence, Seoul streetwear scene, pojagi wrapping cloth, natural dyeing traditions, beauty and fashion as culture export'
  },
  {
    code: 'FR', label: 'France', flag: '🇫🇷',
    context: 'France — haute couture history, Chanel and the little black dress, Breton stripe mythology, Parisian effortlessness, the atelier tradition, fashion as French diplomacy'
  },
  {
    code: 'IT', label: 'Italy', flag: '🇮🇹',
    context: 'Italy — Neapolitan tailoring, Florentine leather craft, Milan as fashion capital, Venetian lace, the sprezzatura philosophy, Gucci and Prada origins, artisan shoemaking'
  },
  {
    code: 'WA', label: 'West Africa', flag: '🌍',
    context: 'West Africa — Ankara wax print as identity, kente weaving in Ghana, Lagos as fashion capital, adire indigo dyeing, African designers reshaping global fashion, diaspora fashion'
  },
  {
    code: 'GB', label: 'UK', flag: '🇬🇧',
    context: 'UK — Savile Row bespoke tailoring, punk subculture, Vivienne Westwood rebellion, Tweed and Harris tradition, London as street style capital, mod fashion history'
  },
  {
    code: 'CN', label: 'China', flag: '🇨🇳',
    context: 'China — silk road origins, qipao evolution, Chinese embroidery traditions, Shanghai 1930s fashion golden age, Hanfu revival movement among Gen Z, Chinese designers going global'
  },
  {
    code: 'ME', label: 'Middle East', flag: '🕌',
    context: 'Middle East — modest fashion revolution, abaya as art form, Bedouin textile traditions, Dubai as luxury fashion hub, Arab designers redefining global fashion, gold thread weaving'
  },
  {
    code: 'AN', label: 'Andes', flag: '🏔️',
    context: 'Andes — Peruvian alpaca weaving, Bolivian cholita fashion, Incan textile traditions, natural dyeing with cochineal, weaving as language and memory, andean fashion going global'
  },
  {
    code: 'SC', label: 'Scandinavia', flag: '🧊',
    context: 'Scandinavia — minimalist design philosophy, Swedish lagom in fashion, Norwegian bunad folk costume, Danish hygge dressing, sustainable Nordic fashion, Acne Studios origin story'
  },
  {
    code: 'BR', label: 'Brazil', flag: '🇧🇷',
    context: 'Brazil — carnival costume as high art, São Paulo fashion week, beach culture and swimwear innovation, indigenous textile traditions, Brazilian street style energy'
  },
]

const SPOTLIGHT_ANGLES = [
  'A surprising origin story most people don\'t know',
  'A craft or tradition on the verge of disappearing',
  'How a single garment changed a culture',
  'The unexpected crossover between two fashion worlds',
  'A fashion rebel who changed everything',
  'The hidden meaning behind an everyday garment',
]

async function generateStoriesForRegion(region: typeof REGIONS[0], count: number = 3) {
  const angles = SPOTLIGHT_ANGLES.sort(() => Math.random() - 0.5).slice(0, count)

  const prompt = `You are a fashion editor for a magazine like Vogue or Monocle. Generate ${count} story cards about fashion from ${region.label}.

Context about ${region.label} fashion: ${region.context}

For each story, use one of these angles:
${angles.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Return ONLY a JSON array with exactly ${count} objects. Each object must have:
- "hook": A surprising, specific, counterintuitive headline (max 12 words). NOT generic. Make it feel like a discovery.
- "teaser": 1 compelling sentence that makes you want to read more (max 25 words)
- "type": one of "Artisan", "Modern", "Handcrafted", "Heritage", "Culture"
- "slug": a url-friendly slug based on the hook (lowercase, hyphens, no special chars)
- "angle": the angle used from the list above (just the angle text)

Examples of GOOD hooks:
- "The Japanese farmers who accidentally invented the world's most copied denim"
- "Why Mughal emperors used embroidery as a weapon of political power"
- "The French village that still makes fabric exclusively for Chanel"

Examples of BAD hooks (too generic, never do these):
- "The History of Korean Fashion"
- "Indian Textiles Through the Ages"
- "French Style Explained"

Return ONLY the JSON array, no markdown, no explanation.`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9 }
        }),
      }
    )
    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini error:', res.status, err)
      return []
    }
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
    const clean = text.replace(/```json|```/g, '').trim()
    const stories = JSON.parse(clean)
    return stories.map((s: any) => ({ ...s, region: region.label, flag: region.flag, regionCode: region.code }))
  } catch (e) {
    console.error(`story generation error for ${region.label}:`, e)
    return []
  }
}

async function generateSpotlightStories() {
  const prompt = `You are a fashion editor. Generate 3 surprising fashion story cards from ANY region in the world — pick the most interesting, unexpected angles you can think of right now.

Return ONLY a JSON array with exactly 3 objects. Each must have:
- "hook": A surprising, specific headline (max 12 words). Something that makes you stop scrolling.
- "teaser": 1 sentence that makes you need to read more (max 25 words)  
- "type": one of "Artisan", "Modern", "Handcrafted", "Heritage", "Culture"
- "region": the region or country this story is from
- "flag": the appropriate flag emoji
- "regionCode": 2-letter country/region code
- "slug": url-friendly slug from the hook
- "angle": what makes this story surprising

Make these genuinely surprising. Think: hidden histories, unexpected connections, counterintuitive truths about fashion.

Return ONLY the JSON array, no markdown.`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1.0 }
        }),
      }
    )
    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini error:', res.status, err)
      return []
    }
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch (e) {
    console.error('spotlight story generation error:', e)
    return []
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const regionCode = searchParams.get('region') // if provided, only fetch that region

  try {
    if (regionCode) {
      // Single region fetch
      const region = REGIONS.find(r => r.code === regionCode)
      if (!region) return NextResponse.json({ stories: [] })
      const stories = await generateStoriesForRegion(region, 3)
      return NextResponse.json({ stories })
    }

    // Full fetch — spotlight + all regions in parallel batches
    const [spotlight, ...regionResults] = await Promise.all([
      generateSpotlightStories(),
      ...REGIONS.map(r => generateStoriesForRegion(r, 3))
    ])

    const byRegion = REGIONS.map((r, i) => ({
      code: r.code,
      label: r.label,
      flag: r.flag,
      stories: regionResults[i] ?? []
    }))

    return NextResponse.json({ spotlight, byRegion })
  } catch (e) {
    console.error('story-cards error:', e)
    return NextResponse.json({ spotlight: [], byRegion: [] })
  }
}
