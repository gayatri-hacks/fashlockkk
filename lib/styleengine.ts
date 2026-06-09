
/*
APP: Fashniq — AI-powered Indian fashion trend platform for Gen Z
STACK: Next.js 14 App Router, TypeScript, Tailwind CSS, Framer Motion, Supabase

SUPABASE SCHEMA:
- products: { id, title, brand, price, original_price, discount_percentage, image_url, product_url, source_id, category_id, scraped_at }
- trend_snapshots: { id, keyword_id, source_id, category_id, growth_percentage, status, product_count, previous_count, snapshot_date }
- trend_keywords: { id, keyword }
- sources: { id, name, base_url }
- categories: { id, name }

SEASONAL THEMES:
- Summer (March-June): bg=#FFF8F0, accent=#FF6B35, secondary=#FFD166
- Monsoon (July-September): bg=#0D1B2A, accent=#00B4D8, secondary=#90E0EF  
- Festive (October-November): bg=#1A0A2E, accent=#FFD700, secondary=#C77DFF
- Winter (December-February): bg=#F0F4F8, accent=#2D3A8C, secondary=#7B9EA6

BODY TYPES: hourglass, pear, apple, rectangle, inverted-triangle
VIBES: minimal, streetwear, cottagecore, y2k, quiet-luxury, indo-fusion, coastal, quirky
AESTHETICS: each vibe maps to specific keywords from our trend_keywords table

DESIGN RULES:
- Mobile first, all components responsive
- Use Framer Motion for all animations
- Seasonal theme applied via CSS variables on :root
- Cards have rounded-3xl, soft shadows
- Typography: large bold headings, small caps labels
- Never use plain blue links — always use accent color
*/


// This is the style recommendation engine (rule-based for prototype, ML later)

// Export BODY_TYPE_RULES as a Record<string, string[]>
// Maps each body type to compatible style keywords:
// hourglass: ['floral', 'embroidered', 'relaxed fit', 'linen', 'checks']
// pear: ['wide leg', 'flared', 'loose', 'embroidered', 'linen']
// apple: ['relaxed fit', 'linen', 'loose', 'floral', 'straight fit']
// rectangle: ['baggy', 'cargo', 'checks', 'graphic', 'oversized']
// inverted-triangle: ['wide leg', 'flared', 'relaxed fit', 'linen', 'floral']

// Export VIBE_KEYWORDS as a Record<string, string[]>
// minimal: ['linen', 'checks', 'relaxed fit', 'pleated', 'chinos']
// streetwear: ['cargo', 'baggy', 'oversized', 'graphic', 'loose']
// cottagecore: ['floral', 'linen', 'embroidered', 'seersucker']
// y2k: ['flared', 'cropped', 'graphic', 'wide leg', 'baggy']
// quiet-luxury: ['linen', 'checks', 'pleated', 'chinos', 'relaxed fit']
// indo-fusion: ['embroidered', 'floral', 'seersucker', 'knit']
// coastal: ['linen', 'floral', 'seersucker', 'relaxed fit', 'loose']
// quirky: ['graphic', 'checks', 'embroidered', 'baggy', 'floral']

// Export VIBE_EMOJIS as a Record<string, string>
// minimal: '🤍', streetwear: '🔥', cottagecore: '🌸', y2k: '⚡'
// quiet-luxury: '💎', indo-fusion: '🪔', coastal: '🌊', quirky: '🎨'

// Export function getRecommendedKeywords(bodyType: string, vibes: string[]): string[]
// Returns union of keywords from all selected vibes that also appear in body type rules
// If intersection is empty, return all vibe keywords
// Remove duplicates, return max 8 keywords