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

DESIGN RULES:
- Mobile first, all components responsive
- Use Framer Motion for all animations
- Seasonal theme applied via CSS variables on :root
- Cards have rounded-3xl, soft shadows
- Typography: large bold headings, small caps labels
- Never use plain blue links — always use accent color
*/

// Export a function getCurrentSeason() that returns 'summer' | 'monsoon' | 'festive' | 'winter'
// based on current month:
// summer: March(3) - June(6)
// monsoon: July(7) - September(9)
// festive: October(10) - November(11)
// winter: December(12) - February(2)

// Export a function getSeasonTheme(season) that returns object with bg, accent, secondary hex colors

// Export a function getSeasonEmoji(season) that returns the emoji for that season
// summer: ☀️, monsoon: 🌧️, festive: ✨, winter: 🌨️

// Export a React hook useSeasonTheme() that:
// - Gets current season on mount
// - Applies CSS variables --bg, --accent, --secondary to document.documentElement style
// - Returns { season, theme, emoji }
// - Mark as 'use client'