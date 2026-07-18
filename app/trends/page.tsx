'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DM_Sans, Cormorant_Garamond } from 'next/font/google'
import TrendsOverview from '@/components/trends/trends-overview'
import TrendDeepDive from '@/components/trends/trend-deep-dive'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['200', '300', '400', '500', '600', '700'],
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
})

export type TrendData = {
  id: number
  keyword: string
  editorialName: string
  oneLiner: string
  story?: string
  whoIsWearingIt?: string
  avoidThis?: string
  howToWear: string[]
  styleDirections?: Array<{ occasion: string; text: string }>
  shopSearchTerms: string[]
  pexelsQueries?: string[]
  pexelsImages?: string[]
  pexelsImageUrl: string | null
  conceptImageUrl?: string | null
  generatedImageUrl?: string | null
  velocity: 'RISING' | 'PEAKING' | 'FADING'
  topMarkets: Array<{ code: string; market: string }>
  trendData: Array<{ month: string; value: number }>
}

export default function TrendsPage() {
  const [activeTrend, setActiveTrend] = useState<TrendData | null>(null)
  const [fadeOut, setFadeOut] = useState(false)
  const [initialSearchQuery, setInitialSearchQuery] = useState('')
  const initialSearchHandled = useRef(false)

  const handleTrendClick = (trend: TrendData) => {
    setFadeOut(true)
    setTimeout(() => {
      setActiveTrend(trend)
      setFadeOut(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 300)
  }

  const handleTrendSearch = useCallback(async (query: string) => {
    const cleaned = query.trim()
    if (!cleaned) return

    try {
      setFadeOut(true)
      const res = await fetch(`/api/trends/search?keyword=${encodeURIComponent(cleaned)}`)
      if (!res.ok) {
        console.error('Trend search failed:', res.status, await res.text())
        setFadeOut(false)
        return
      }

      const data = await res.json()
      if (data.trend) {
        setActiveTrend(data.trend)
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      }
    } catch (error) {
      console.error('Trend search error:', error)
    } finally {
      setFadeOut(false)
    }
  }, [])

  useEffect(() => {
    if (initialSearchHandled.current) return
    initialSearchHandled.current = true

    const searchQuery = new URLSearchParams(window.location.search).get('search')?.trim()
    if (!searchQuery) return

    setInitialSearchQuery(searchQuery)
    void handleTrendSearch(searchQuery)
  }, [handleTrendSearch])

  const handleBackClick = () => {
    setFadeOut(true)
    setTimeout(() => {
      setActiveTrend(null)
      setFadeOut(false)
    }, 300)
  }

  return (
    <div
      className={`${dmSans.variable} ${cormorant.variable}`}
      style={{
        '--font-dm-sans': dmSans.variable,
        '--font-cormorant': cormorant.variable,
      } as React.CSSProperties}
    >
      <div
        className="transition-opacity duration-300"
        style={{ opacity: fadeOut ? 0 : 1 }}
      >
        {activeTrend ? (
          <TrendDeepDive trend={activeTrend} onBack={handleBackClick} />
        ) : (
          <TrendsOverview initialSearchQuery={initialSearchQuery} onTrendClick={handleTrendClick} onTrendSearch={handleTrendSearch} />
        )}
      </div>
    </div>
  )
}
