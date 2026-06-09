'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const STORY_META: Record<string, { title: string; region: string; type: string; icon: string; meta: string; image: string; accent: string }> = {
  'pochampally-weavers':  { title: 'The Last Weavers of Pochampally',             region: 'India',       type: 'Artisan',     icon: 'Thread', meta: 'Telangana · Ikat · 3 min read', image: 'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?auto=format&fit=crop&w=1600&q=80', accent: '#7b1f24' },
  'zardozi-gold-threads': { title: 'Zardozi: Gold Threads, Mughal Roots',         region: 'India',       type: 'Handcrafted', icon: 'Gold',   meta: 'Lucknow · Embroidery · 4 min read', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1600&q=80', accent: '#b7832f' },
  'gen-z-saree':          { title: 'How Gen Z Is Reinventing the Saree',          region: 'India',       type: 'Modern',      icon: 'Now',    meta: 'Mumbai · Contemporary · 2 min read', image: 'https://images.unsplash.com/photo-1617019114583-affb34d1b3cd?auto=format&fit=crop&w=1600&q=80', accent: '#d34f73' },
  'boro-patching':        { title: 'Boro: The Art of Patching as Beauty',         region: 'Japan',       type: 'Artisan',     icon: 'Patch',  meta: 'Tokyo · Textile · 4 min read', image: 'https://images.unsplash.com/photo-1552288092-76e7d732366c?auto=format&fit=crop&w=1600&q=80', accent: '#315f72' },
  'harajuku-today':       { title: 'Harajuku in 2025: Still Weird, Still Free',   region: 'Japan',       type: 'Modern',      icon: 'Street', meta: 'Tokyo · Streetwear · 3 min read', image: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=1600&q=80', accent: '#e24b4b' },
  'hanbok-modern':        { title: 'The Hanbok Goes Global On Its Own Terms',     region: 'Korea',       type: 'Modern',      icon: 'Form',   meta: 'Seoul · Heritage · 3 min read', image: 'https://images.unsplash.com/photo-1534274867514-d5b47ef89ed7?auto=format&fit=crop&w=1600&q=80', accent: '#b24a66' },
  'seoul-streetwear':     { title: 'Why Seoul Streetwear Is Leading the World',   region: 'Korea',       type: 'Modern',      icon: 'Seoul',  meta: 'Seoul · Street · 2 min read', image: 'https://images.unsplash.com/photo-1534274867514-d5b47ef89ed7?auto=format&fit=crop&w=1600&q=80', accent: '#2e5f8a' },
  'italian-tailoring':    { title: 'The Naples Suit: A Living Craft',             region: 'Italy',       type: 'Handcrafted', icon: 'Cut',    meta: 'Naples · Tailoring · 5 min read', image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1600&q=80', accent: '#475f42' },
  'french-effortless':    { title: 'The Myth of Effortless French Style',         region: 'France',      type: 'Modern',      icon: 'Paris',  meta: 'Paris · Culture · 3 min read', image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1600&q=80', accent: '#6b5b95' },
  'ankara-global':        { title: 'Ankara Is Not a Trend. It Is a Language',     region: 'West Africa', type: 'Artisan',     icon: 'Print',  meta: 'Lagos · Fabric · 4 min read', image: 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=1600&q=80', accent: '#c35a2c' },
  'brazil-beach-fashion': { title: "Copacabana to Couture: Brazil's Fashion Rise", region: 'Brazil',      type: 'Modern',      icon: 'Body',   meta: 'São Paulo · Beach · 3 min read', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80', accent: '#138a72' },
  'savile-row-future':    { title: 'Savile Row at a Crossroads',                  region: 'UK',          type: 'Handcrafted', icon: 'Suit',   meta: 'London · Tailoring · 4 min read', image: 'https://images.unsplash.com/photo-1593032465175-481ac7f401a0?auto=format&fit=crop&w=1600&q=80', accent: '#34383f' },
}

const TYPE_ICONS: Record<string, string> = {
  'Artisan': 'Thread', 'Handcrafted': 'Craft', 'Modern': 'Now',
  'Heritage': 'Roots', 'Culture': 'Culture',
}

export default function StoryPage() {
  const params = useParams()
  const slug = params?.slug as string
  const staticStory = STORY_META[slug]

  const [editorial, setEditorial]           = useState('')
  const [editorialLoading, setEditorialLoading] = useState(true)
  const [articles, setArticles]             = useState<any[]>([])
  const [articlesLoading, setArticlesLoading] = useState(true)
  const [dynamicMeta, setDynamicMeta]       = useState<{ title: string; region: string; type: string; teaser: string } | null>(null)

  // For dynamic slugs, fetch meta from sessionStorage (set by discover page when generating)
  useEffect(() => {
    if (!staticStory) {
      const stored = sessionStorage.getItem(`story:${slug}`)
      if (stored) {
        try { setDynamicMeta(JSON.parse(stored)) } catch {}
      }
    }
  }, [slug, staticStory])

  // Fetch editorial — works for both static and dynamic slugs
  useEffect(() => {
    if (!slug) return
    const isStatic = !!staticStory
    const endpoint = isStatic
      ? `/api/story-editorial?slug=${slug}`
      : `/api/story-editorial?slug=${slug}&dynamic=1&title=${encodeURIComponent(dynamicMeta?.title ?? slug)}&region=${encodeURIComponent(dynamicMeta?.region ?? '')}&type=${encodeURIComponent(dynamicMeta?.type ?? '')}`

    fetch(endpoint)
      .then(r => r.json())
      .then(d => { setEditorial(d.editorial ?? ''); setEditorialLoading(false) })
      .catch(() => setEditorialLoading(false))
  }, [slug, staticStory, dynamicMeta])

  // Fetch related articles
  useEffect(() => {
    if (!slug) return
    fetch(`/api/story-articles?slug=${slug}&region=${encodeURIComponent(dynamicMeta?.region ?? staticStory?.region ?? '')}`)
      .then(r => r.json())
      .then(d => { setArticles(d.articles ?? []); setArticlesLoading(false) })
      .catch(() => setArticlesLoading(false))
  }, [slug, staticStory, dynamicMeta])

  const title  = staticStory?.title  ?? dynamicMeta?.title  ?? slug.replace(/-/g, ' ')
  const region = staticStory?.region ?? dynamicMeta?.region ?? ''
  const type   = staticStory?.type   ?? dynamicMeta?.type   ?? 'Modern'
  const icon   = staticStory?.icon   ?? TYPE_ICONS[type]    ?? '✨'
  const meta   = staticStory?.meta   ?? `${region} · ${type}`
  const image  = staticStory?.image  ?? 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=80'
  const accent = staticStory?.accent ?? '#222'

  const paragraphs = editorial.split('\n').filter(p => p.trim().length > 0)

  return (
    <main className="pb-20">
      <section className="mx-auto max-w-6xl px-4 pt-6">
        <Link href="/discover?tab=stories"
          className="text-xs tracking-widest uppercase text-neutral-400 hover:text-neutral-700 transition-colors">
          ← Stories
        </Link>

        <div className="mt-6 grid overflow-hidden rounded-lg border border-neutral-200 bg-[#fbf8f2] lg:min-h-[520px] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative min-h-[420px]">
            <img src={image} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
              <span className="border border-white/50 px-3 py-2 text-[10px] uppercase tracking-widest text-white">
                {icon}
              </span>
              <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] uppercase tracking-widest text-neutral-700">
                {region}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between p-6 lg:p-10">
            <div>
              <div className="mb-10 flex items-center gap-4">
                <span className="h-2 w-12" style={{ backgroundColor: accent }} />
                <span className="text-xs tracking-widest uppercase text-neutral-400">{type}</span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-medium leading-none tracking-tight mb-6">{title}</h1>
              <p className="max-w-xl text-sm leading-relaxed text-neutral-500">{meta}</p>
            </div>
            <p className="mt-12 max-w-md text-2xl italic leading-relaxed text-neutral-500">
              A short editorial on the clothes that carry place, memory, and cultural motion.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-10 lg:mt-14 max-w-3xl px-4">

      {editorialLoading ? (
        <div className="space-y-4 mb-12">
          <p className="text-xs tracking-widest uppercase text-neutral-400 animate-pulse">Writing editorial...</p>
          {[...Array(8)].map((_, i) => (
            <div key={i} className={`h-4 bg-neutral-100 rounded animate-pulse ${i % 3 === 2 ? 'w-3/4' : 'w-full'}`} />
          ))}
        </div>
      ) : !editorial ? (
        <div className="mb-12">
          <p className="text-neutral-400 font-serif text-lg">Story coming soon.</p>
        </div>
      ) : (
        <article className="mb-14">
          {paragraphs.map((p, i) => (
            <p key={i} className={`leading-relaxed text-neutral-700 mb-6 ${i === 0 ? 'text-xl lg:text-2xl font-medium text-neutral-800' : 'text-base lg:text-lg'}`}>
              {p}
            </p>
          ))}
        </article>
      )}

      <div className="border-t border-neutral-200 pt-10">
        <p className="text-xs tracking-widest uppercase text-neutral-400 mb-6">From around the web</p>
        {articlesLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-neutral-50 rounded-xl animate-pulse" />)}
          </div>
        ) : articles.length === 0 ? (
          <p className="text-sm text-neutral-400">No articles found right now — check back soon.</p>
        ) : (
          <div className="space-y-3">
            {articles[0] && (
              <a href={articles[0].link} target="_blank" rel="noopener noreferrer"
                className="block border border-neutral-200 rounded-xl overflow-hidden hover:border-neutral-400 transition-colors group">
                {articles[0].image && (
                  <img src={articles[0].image} alt="" className="w-full aspect-video object-cover group-hover:opacity-95 transition-opacity" />
                )}
                <div className="p-5">
                  <p className="text-xs tracking-widest uppercase text-neutral-400 mb-1">{articles[0].source}</p>
                  <h2 className="font-serif text-xl font-normal leading-snug mb-2">{articles[0].title}</h2>
                  <p className="text-sm text-neutral-500 line-clamp-2 leading-relaxed">{articles[0].summary}</p>
                </div>
              </a>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {articles.slice(1).map((a, i) => (
                <a key={i} href={a.link} target="_blank" rel="noopener noreferrer"
                  className="border border-neutral-200 rounded-xl overflow-hidden hover:border-neutral-400 transition-colors group flex flex-col">
                  {a.image && (
                    <div className="overflow-hidden h-32">
                      <img src={a.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  )}
                  <div className="p-3 flex-1">
                    <p className="text-xs tracking-widest uppercase text-neutral-400 mb-1">{a.source}</p>
                    <h3 className="font-serif text-sm font-normal leading-snug line-clamp-3">{a.title}</h3>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
      </section>
    </main>
  )
}
