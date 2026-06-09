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
'use client'

// Reusable product card component
// Props interface:
// { id: number, title: string, brand: string, price: number, 
//   original_price?: number, discount_percentage?: number,
//   image_url: string, product_url: string, trendStatus?: string }

// Layout:
// - Framer Motion div: whileHover scale 1.02, transition spring
// - Rounded-3xl, overflow-hidden, bg-white, shadow-md cursor-pointer
// - onClick: window.open(product_url, '_blank')
// - Image section: relative aspect-square
//   Next.js Image component, object-cover
//   If trendStatus === 'Rising': absolute top-2 right-2 badge
//   Badge: rounded-full bg-green-500 text-white text-xs px-2 py-1 "🔥 Trending"
// - Content section: p-3
//   Brand: text-xs uppercase tracking-widest text-gray-400 mb-1
//   Title: text-sm font-medium text-gray-800 line-clamp-2 mb-2
//   Price row: flex items-center gap-2
//     Current price: font-bold text-gray-900 "₹{price}"
//     If original_price: strikethrough text-gray-400 text-xs "₹{original_price}"
//     If discount_percentage: text-xs font-medium in accent color "{discount}% off"
// - Skeleton state: when image_url is empty show gray animated pulse skeleton
// Export as default